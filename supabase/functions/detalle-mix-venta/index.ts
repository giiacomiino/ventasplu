import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, json, requirePermiso } from '../_shared/bubble.ts'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const CONFIG: Record<string, { tabla: string; campoNombre: string; campoValor: string; excluir?: string[] }> = {
  categorias: { tabla: 'reportes_venta_diaria_categorias', campoNombre: 'descripcion', campoValor: 'ventas' },
  zonas: { tabla: 'reportes_venta_diaria_zonas', campoNombre: 'zona', campoValor: 'venta' },
  pagos: {
    tabla: 'reportes_venta_diaria_pagos', campoNombre: 'descripcion', campoValor: 'monto',
    excluir: ['SALEFE', 'ENTEFE', 'DESC 25%', 'TRANSFER'],
  },
}

// Página dedicada a UN solo mix (categoría, zona o forma de pago): % del
// año completo y cómo se mueve mes a mes — para que al picarle a ese
// bloque en el overview solo se hable de eso.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await requirePermiso(req, 'ventas')
  if (!user) return json({ error: 'No autorizado' }, 401)

  const body = await req.json().catch(() => ({}))
  const config = CONFIG[body.tipo]
  if (!config) return json({ error: 'Tipo no reconocido' }, 400)

  const hoyReal = new Date()
  const anio = body.anio ?? hoyReal.getUTCFullYear()

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)

    const inicio = new Date(Date.UTC(anio, 0, 1)).toISOString().slice(0, 10)
    const fin = new Date(Date.UTC(anio, 11, 31)).toISOString().slice(0, 10)

    const { data: reportes, error } = await admin
      .from('reportes_venta_diaria')
      .select(`fecha, ${config.tabla}(${config.campoNombre}, ${config.campoValor})`)
      .gte('fecha', inicio)
      .lte('fecha', fin)

    if (error) return json({ error: error.message }, 400)

    const excluir = config.excluir ?? []
    const totalPorNombre = new Map<string, number>()
    const porMesPorNombre = new Map<string, Map<string, number>>()

    for (const r of reportes ?? []) {
      const mesKey = (r as any).fecha.slice(0, 7)
      for (const fila of (r as any)[config.tabla] ?? []) {
        const nombre = fila[config.campoNombre]
        if (excluir.includes(String(nombre).toUpperCase())) continue
        const monto = Number(fila[config.campoValor]) || 0
        if (monto <= 0) continue

        totalPorNombre.set(nombre, (totalPorNombre.get(nombre) ?? 0) + monto)

        const mapaMes = porMesPorNombre.get(nombre) ?? new Map<string, number>()
        mapaMes.set(mesKey, (mapaMes.get(mesKey) ?? 0) + monto)
        porMesPorNombre.set(nombre, mapaMes)
      }
    }

    const total = [...totalPorNombre.values()].reduce((s, v) => s + v, 0)
    const nombres = [...totalPorNombre.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n)

    const mix = nombres.map(nombre => ({
      nombre,
      monto: totalPorNombre.get(nombre) ?? 0,
      pct: total ? (totalPorNombre.get(nombre) ?? 0) / total : 0,
    }))

    const serieMensual = []
    for (let m = 0; m < 12; m++) {
      const key = `${anio}-${String(m + 1).padStart(2, '0')}`
      const fila: Record<string, unknown> = { mes: `${MESES[m]} ${String(anio).slice(2)}` }
      for (const nombre of nombres) fila[nombre] = porMesPorNombre.get(nombre)?.get(key) ?? 0
      serieMensual.push(fila)
    }

    return json({ anio, nombres, mix, serieMensual, total })
  } catch (e) {
    return json({ error: e.message }, 502)
  }
})
