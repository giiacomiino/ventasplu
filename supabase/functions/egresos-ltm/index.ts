import { corsHeaders, json, bubbleEnv, bubbleGetAllFast, conOrg, requirePermiso } from '../_shared/bubble.ts'

// Egresos de los últimos 12 meses (LTM), mes contra el mismo mes del año
// anterior. A propósito NO excluye "Fonda La Trattoria": ese proveedor
// interno se saca de los rankings por proveedor porque no es un vendor de
// verdad, pero la nómina que pasa por ahí sí es gasto real de la empresa —
// para el total de egresos tiene que contar.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await requirePermiso(req, 'pagos')
  if (!user) return json({ error: 'No autorizado' }, 401)

  const { bubbleUrl, bubbleToken } = bubbleEnv()

  try {
    const hoy = new Date()
    const anio = hoy.getUTCFullYear()
    const mes0 = hoy.getUTCMonth()

    // Ventana de 24 meses (12 actuales + 12 del año anterior para YoY),
    // terminando en el mes en curso.
    const inicioVentana = new Date(Date.UTC(anio - 1, mes0 - 11, 1))
    const finVentana = new Date(Date.UTC(anio, mes0 + 1, 0, 23, 59, 59))

    const crudas = await bubbleGetAllFast(bubbleUrl, bubbleToken, 'Inventario', conOrg(
      { key: 'FechaDeIngreso', constraint_type: 'greater than', value: inicioVentana.toISOString() },
      { key: 'FechaDeIngreso', constraint_type: 'less than', value: finVentana.toISOString() },
      { key: 'borrada?', constraint_type: 'equals', value: false },
    ))

    const porMes = new Map<string, number>()
    for (const f of crudas) {
      if (f['borrada?'] === true) continue
      const mesKey = (f.FechaDeIngreso as string).slice(0, 7)
      porMes.set(mesKey, (porMes.get(mesKey) ?? 0) + (f.MontoSinIVA || 0))
    }

    const serie = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(anio, mes0 - i, 1))
      const dAnterior = new Date(Date.UTC(anio - 1, mes0 - i, 1))
      const clave = k => `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, '0')}`
      serie.push({
        mes: d.toISOString().slice(0, 7),
        actual: porMes.get(clave(d)) ?? 0,
        anterior: porMes.get(clave(dAnterior)) ?? 0,
      })
    }

    const totalLTM = serie.reduce((s, m) => s + m.actual, 0)
    const totalLTMAnterior = serie.reduce((s, m) => s + m.anterior, 0)
    const yoyPct = totalLTMAnterior ? ((totalLTM - totalLTMAnterior) / totalLTMAnterior) * 100 : null
    const promedioMensual = serie.length ? totalLTM / serie.length : 0

    return json({ serie, totalLTM, totalLTMAnterior, yoyPct, promedioMensual })
  } catch (e) {
    return json({ error: e.message }, 502)
  }
})
