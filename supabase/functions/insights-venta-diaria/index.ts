import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, json, requirePermiso } from '../_shared/bubble.ts'

// Todo lo que trae de nuevo el reporte de venta diaria (Sierra POS) que
// Bubble nunca tuvo: cancelaciones, ticket promedio, mix por categoría,
// comedor vs para llevar, mix de formas de pago. Se arma de los últimos
// reportes capturados en Supabase — no toca la venta neta histórica de
// Bubble, eso sigue en /ventas tal cual.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await requirePermiso(req, 'ventas')
  if (!user) return json({ error: 'No autorizado' }, 401)

  const body = await req.json().catch(() => ({}))
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  try {
    const hoyReal = new Date()
    const anio = body.anio ?? hoyReal.getUTCFullYear()
    const mes0 = (body.mes ?? hoyReal.getUTCMonth() + 1) - 1
    const esMesActual = anio === hoyReal.getUTCFullYear() && mes0 === hoyReal.getUTCMonth()
    const esAnioActual = anio === hoyReal.getUTCFullYear()

    let inicioMes: string
    let finMes: string
    // Mes y día de corte del rango actual — se reusan para armar los
    // rangos comparables de MoM/YoY con el mismo tramo de días (no tiene
    // caso comparar un mes completo contra uno a medias).
    let mesCorte0: number
    let diaCorte: number
    if (body.ytd) {
      inicioMes = new Date(Date.UTC(anio, 0, 1)).toISOString().slice(0, 10)
      if (esAnioActual) {
        finMes = hoyReal.toISOString().slice(0, 10)
        mesCorte0 = hoyReal.getUTCMonth()
        diaCorte = hoyReal.getUTCDate()
      } else {
        finMes = new Date(Date.UTC(anio, 11, 31)).toISOString().slice(0, 10)
        mesCorte0 = 11
        diaCorte = 31
      }
    } else {
      inicioMes = new Date(Date.UTC(anio, mes0, 1)).toISOString().slice(0, 10)
      mesCorte0 = mes0
      diaCorte = esMesActual ? hoyReal.getUTCDate() : new Date(Date.UTC(anio, mes0 + 1, 0)).getUTCDate()
      finMes = new Date(Date.UTC(anio, mes0, diaCorte)).toISOString().slice(0, 10)
    }

    // MoM: mes calendario inmediato anterior al mes de corte (no aplica en
    // modo YTD — no hay un "YTD anterior" natural con el que comparar).
    let inicioMoM: string | null = null
    let finMoM: string | null = null
    if (!body.ytd) {
      const mesAntRef = mesCorte0 === 0 ? { anio: anio - 1, mes0: 11 } : { anio, mes0: mesCorte0 - 1 }
      inicioMoM = new Date(Date.UTC(mesAntRef.anio, mesAntRef.mes0, 1)).toISOString().slice(0, 10)
      finMoM = esMesActual
        ? new Date(Date.UTC(mesAntRef.anio, mesAntRef.mes0, diaCorte)).toISOString().slice(0, 10)
        : new Date(Date.UTC(mesAntRef.anio, mesAntRef.mes0 + 1, 0)).toISOString().slice(0, 10)
    }

    // YoY: mismo rango (YTD completo o el mes de corte), un año antes.
    const inicioYoY = body.ytd
      ? new Date(Date.UTC(anio - 1, 0, 1)).toISOString().slice(0, 10)
      : new Date(Date.UTC(anio - 1, mesCorte0, 1)).toISOString().slice(0, 10)
    const finYoY = new Date(Date.UTC(anio - 1, mesCorte0, diaCorte)).toISOString().slice(0, 10)

    const { data: reportes, error } = await admin
      .from('reportes_venta_diaria')
      .select(`
        fecha, venta_neta, total_ingresos, cancelaciones, clientes_total, cuentas_total, cortesias_monto,
        reportes_venta_diaria_categorias(descripcion, ventas),
        reportes_venta_diaria_zonas(zona, venta),
        reportes_venta_diaria_pagos(descripcion, monto)
      `)
      .gte('fecha', inicioMes)
      .lte('fecha', finMes)
      .order('fecha', { ascending: false })

    if (error) return json({ error: error.message }, 400)

    const reportesAsc = [...(reportes ?? [])].sort((a, b) => a.fecha.localeCompare(b.fecha))

    const serieDiaria = reportesAsc.map(r => ({
      fecha: r.fecha,
      venta_neta: r.venta_neta,
      cancelaciones: Math.max(r.cancelaciones || 0, 0),
      clientes_total: r.clientes_total,
      cortesias_monto: Math.max(r.cortesias_monto || 0, 0),
      ticket_promedio: r.clientes_total ? (r.venta_neta ?? 0) / r.clientes_total : null,
    }))

    function mezclar(campoLista: string, etiqueta: string, valor: string, excluir: string[] = []) {
      const totales = new Map<string, number>()
      for (const r of reportes ?? []) {
        for (const fila of (r as any)[campoLista] ?? []) {
          const key = fila[etiqueta]
          if (excluir.includes(String(key).toUpperCase())) continue
          const monto = Number(fila[valor]) || 0
          if (monto <= 0) continue
          totales.set(key, (totales.get(key) ?? 0) + monto)
        }
      }
      const total = [...totales.values()].reduce((s, v) => s + v, 0)
      return [...totales.entries()]
        .map(([nombre, monto]) => ({ nombre, monto, pct: total ? monto / total : 0 }))
        .sort((a, b) => b.monto - a.monto)
    }

    // No son formas de pago reales del cliente: SalEfe/EntEfe son
    // movimientos manuales de efectivo, DESC 25% es un descuento y
    // TRANSFER no aplica para este mix — se dejan fuera del % de cobrado.
    const PAGOS_EXCLUIDOS = ['SALEFE', 'ENTEFE', 'DESC 25%', 'TRANSFER']

    function sumarTotales(rows: any[]) {
      const ventaNeta = rows.reduce((s, r) => s + (r.venta_neta || 0), 0)
      const ventaBruta = rows.reduce((s, r) => s + (r.total_ingresos || 0), 0)
      // Nunca deberían ser negativas — si algún día del reporte quedó mal
      // parseado (ej. un valor cercano que no era este), un signo negativo
      // ahí no representa nada real y solo ensucia la suma del periodo.
      const cancelaciones = rows.reduce((s, r) => s + Math.max(r.cancelaciones || 0, 0), 0)
      const cortesias = rows.reduce((s, r) => s + Math.max(r.cortesias_monto || 0, 0), 0)
      const clientes = rows.reduce((s, r) => s + (r.clientes_total || 0), 0)
      const cuentas = rows.reduce((s, r) => s + (r.cuentas_total || 0), 0)
      const clientesValidos = rows.filter(r => r.clientes_total)
      const ticketPromedio = clientesValidos.length
        ? clientesValidos.reduce((s, r) => s + (r.venta_neta ?? 0) / r.clientes_total, 0) / clientesValidos.length
        : null
      return { ventaNeta, ventaBruta, cancelaciones, cortesias, clientes, cuentas, ticketPromedio }
    }

    async function totalesPara(inicio: string, fin: string) {
      const { data } = await admin
        .from('reportes_venta_diaria')
        .select('venta_neta, total_ingresos, cancelaciones, clientes_total, cuentas_total, cortesias_monto')
        .gte('fecha', inicio)
        .lte('fecha', fin)
      return sumarTotales(data ?? [])
    }

    const [totalesMoM, totalesYoY] = await Promise.all([
      inicioMoM && finMoM ? totalesPara(inicioMoM, finMoM) : Promise.resolve(null),
      totalesPara(inicioYoY, finYoY),
    ])

    function pctDelta(actual: number | null, anterior: number | null) {
      if (actual == null || anterior == null || !anterior) return null
      return ((actual - anterior) / anterior) * 100
    }

    const totales = sumarTotales(reportesAsc)
    const camposComparables = ['ventaNeta', 'ventaBruta', 'cancelaciones', 'cortesias', 'clientes', 'cuentas', 'ticketPromedio'] as const
    const mom: Record<string, number | null> = {}
    const yoy: Record<string, number | null> = {}
    for (const campo of camposComparables) {
      mom[campo] = totalesMoM ? pctDelta(totales[campo], totalesMoM[campo]) : null
      yoy[campo] = pctDelta(totales[campo], totalesYoY[campo])
    }

    return json({
      dias: reportesAsc.length,
      serieDiaria,
      mixCategorias: mezclar('reportes_venta_diaria_categorias', 'descripcion', 'ventas'),
      mixZonas: mezclar('reportes_venta_diaria_zonas', 'zona', 'venta'),
      mixPagos: mezclar('reportes_venta_diaria_pagos', 'descripcion', 'monto', PAGOS_EXCLUIDOS),
      totales: {
        ...totales,
        cortesiasPct: totales.ventaNeta ? totales.cortesias / totales.ventaNeta : null,
      },
      mom,
      yoy,
    })
  } catch (e) {
    return json({ error: e.message }, 502)
  }
})
