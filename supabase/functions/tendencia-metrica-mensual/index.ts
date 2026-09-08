import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, json, bubbleEnv, bubbleGetAll, conOrg, requirePermiso } from '../_shared/bubble.ts'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// Campo en reportes_venta_diaria por cada métrica seleccionable — todas
// menos venta_neta solo existen desde que se empezó a capturar el reporte
// Sierra (no hay histórico en Bubble para ellas).
const CAMPO_SUPABASE: Record<string, string> = {
  venta_neta: 'venta_neta',
  venta_bruta: 'total_ingresos',
  cortesias: 'cortesias_monto',
  cancelaciones: 'cancelaciones',
  clientes: 'clientes_total',
  cuentas: 'cuentas_total',
  ticket_promedio: 'prom_cliente',
}

// Venta neta/bruta se agregan como promedio diario del mes (así los meses
// son comparables sin importar cuántos días tengan) — es la convención que
// ya traían las demás gráficas de venta. Cortesías, cancelaciones,
// clientes y cuentas son cosas que se quieren ver como total del mes
// (cuánto en total, no un promedio diario). Ticket promedio siempre es
// promedio, nunca tiene sentido sumarlo.
const SUMAR: Record<string, boolean> = {
  venta_neta: false,
  venta_bruta: false,
  cortesias: true,
  cancelaciones: true,
  clientes: true,
  cuentas: true,
  ticket_promedio: false,
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await requirePermiso(req, 'ventas')
  if (!user) return json({ error: 'No autorizado' }, 401)

  const body = await req.json().catch(() => ({}))
  const metrica = body.metrica ?? 'venta_neta'
  const campo = CAMPO_SUPABASE[metrica]
  if (!campo) return json({ error: 'Métrica no reconocida' }, 400)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)

    // Valor por día — Supabase siempre gana sobre Bubble en el día que
    // exista (es el reemplazo hacia adelante); antes de eso, solo Bubble
    // tiene dato, y para las métricas nuevas (cortesías, cancelaciones...)
    // Bubble nunca tuvo nada que aportar.
    const valorPorDia = new Map<string, number>()

    if (metrica === 'venta_neta') {
      const { bubbleUrl, bubbleToken } = bubbleEnv()
      const ventas = await bubbleGetAll(bubbleUrl, bubbleToken, 'Venta', conOrg())
      for (const v of ventas) {
        const key = new Date(v.DiaDeVenta).toISOString().slice(0, 10)
        valorPorDia.set(key, v.VentaNeta || 0)
      }
    }

    const { data: reportes, error } = await admin.from('reportes_venta_diaria').select(`fecha, ${campo}`)
    if (error) return json({ error: error.message }, 400)
    // Cancelaciones/cortesías nunca deberían ser negativas — un valor así
    // en un día suelto es un error de parseo, no un dato real.
    const noNegativo = metrica === 'cancelaciones' || metrica === 'cortesias'
    for (const r of reportes ?? []) {
      const valor = (r as any)[campo]
      if (valor != null) valorPorDia.set(r.fecha, noNegativo ? Math.max(valor, 0) : valor)
    }

    const porMes = new Map<string, { suma: number; n: number }>()
    for (const [fecha, valor] of valorPorDia) {
      const key = fecha.slice(0, 7)
      const acc = porMes.get(key) ?? { suma: 0, n: 0 }
      acc.suma += valor
      acc.n += 1
      porMes.set(key, acc)
    }
    const sumar = SUMAR[metrica] ?? false
    const promedioPorMes = new Map([...porMes.entries()].map(([k, v]) => [k, sumar ? v.suma : v.suma / v.n]))

    const hoy = new Date()
    const claves = [...porMes.keys()].sort()
    const ultimaClave = claves.length ? claves[claves.length - 1] : `${hoy.getUTCFullYear()}-${String(hoy.getUTCMonth() + 1).padStart(2, '0')}`
    const [yUlt, mUlt] = ultimaClave.split('-').map(Number)

    const serie = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(yUlt, mUlt - 1 - i, 1))
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
      const dAnt = new Date(Date.UTC(d.getUTCFullYear() - 1, d.getUTCMonth(), 1))
      const keyAnt = `${dAnt.getUTCFullYear()}-${String(dAnt.getUTCMonth() + 1).padStart(2, '0')}`
      const actual = promedioPorMes.get(key) ?? null
      const anterior = promedioPorMes.get(keyAnt) ?? null
      serie.push({
        mes: `${MESES[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`,
        actual,
        anterior,
        deltaMonto: actual != null && anterior != null ? actual - anterior : null,
        deltaPct: actual != null && anterior ? ((actual - anterior) / anterior) * 100 : null,
      })
    }

    const valoresActual = serie.map(s => s.actual).filter((v): v is number => v != null)
    const promedioGeneral = valoresActual.length ? valoresActual.reduce((a, b) => a + b, 0) / valoresActual.length : null

    return json({ serie, promedioGeneral })
  } catch (e) {
    return json({ error: e.message }, 502)
  }
})
