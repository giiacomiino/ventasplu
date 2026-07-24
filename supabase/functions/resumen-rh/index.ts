import { corsHeaders, json, bubbleEnv, bubbleGetAll, conOrg, requireRole } from '../_shared/bubble.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await requireRole(req, ['owner', 'admin'])
  if (!user) return json({ error: 'No autorizado' }, 401)

  const { bubbleUrl, bubbleToken } = bubbleEnv()

  try {
    const [empleados, areas, puestos] = await Promise.all([
      bubbleGetAll(bubbleUrl, bubbleToken, 'Empleado', conOrg()),
      bubbleGetAll(bubbleUrl, bubbleToken, 'Área', conOrg()),
      bubbleGetAll(bubbleUrl, bubbleToken, 'Puestos', conOrg()),
    ])

    const areaPorId = new Map(areas.map((a: any) => [a._id, a['NombreÁrea']]))
    const puestoPorId = new Map(puestos.map((p: any) => [p._id, { nombre: p.NombrePuesto, sueldo: p.SuedoDiario }]))

    const activos = empleados.filter((e: any) => e.EstatusEmpleado === 'Activo')
    const headcountActivo = activos.length

    const ahora = new Date()
    const inicioAnio = new Date(Date.UTC(ahora.getUTCFullYear(), 0, 1))
    const bajasDelAnio = empleados.filter((e: any) =>
      e.EstatusEmpleado === 'Baja' && e['Modified Date'] && new Date(e['Modified Date']) >= inicioAnio,
    ).length
    const rotacionAnual = headcountActivo > 0 ? bajasDelAnio / headcountActivo : null

    const antiguedades = activos
      .filter((e: any) => e.FechaIngreso)
      .map((e: any) => (ahora.getTime() - new Date(e.FechaIngreso).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    const antiguedadPromedio = antiguedades.length
      ? antiguedades.reduce((a, b) => a + b, 0) / antiguedades.length
      : null

    const porArea = new Map<string, number>()
    for (const e of activos) {
      const nombre = areaPorId.get(e['Área']) ?? 'Sin área'
      porArea.set(nombre, (porArea.get(nombre) ?? 0) + 1)
    }
    const hcPorArea = [...porArea.entries()]
      .map(([nombre, headcount]) => ({ nombre, headcount }))
      .sort((a, b) => b.headcount - a.headcount)

    const porPuesto = new Map<string, { headcount: number; sueldo: number }>()
    for (const e of activos) {
      const info = puestoPorId.get(e.Puesto)
      const nombre = info?.nombre ?? 'Sin puesto'
      const actual = porPuesto.get(nombre) ?? { headcount: 0, sueldo: info?.sueldo ?? 0 }
      actual.headcount += 1
      porPuesto.set(nombre, actual)
    }
    const hcPorPuesto = [...porPuesto.entries()]
      .map(([nombre, v]) => ({ nombre, ...v, nominaEstimadaMensual: v.headcount * v.sueldo * 30 }))
      .sort((a, b) => b.headcount - a.headcount)

    const nominaEstimadaMensual = hcPorPuesto.reduce((s, p) => s + p.nominaEstimadaMensual, 0)

    return json({
      headcountActivo,
      bajasDelAnio,
      rotacionAnual,
      antiguedadPromedio,
      hcPorArea,
      hcPorPuesto,
      nominaEstimadaMensual,
    })
  } catch (e) {
    return json({ error: e.message }, 502)
  }
})
