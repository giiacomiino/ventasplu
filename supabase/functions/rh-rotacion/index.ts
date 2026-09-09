import { corsHeaders, json, bubbleEnv, bubbleGetAll, conOrg, requirePermiso } from '../_shared/bubble.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await requirePermiso(req, 'rh')
  if (!user) return json({ error: 'No autorizado' }, 401)

  const { bubbleUrl, bubbleToken } = bubbleEnv()

  try {
    const [empleados, areas, puestos] = await Promise.all([
      bubbleGetAll(bubbleUrl, bubbleToken, 'Empleado', conOrg()),
      bubbleGetAll(bubbleUrl, bubbleToken, 'Área', conOrg()),
      bubbleGetAll(bubbleUrl, bubbleToken, 'Puestos', conOrg()),
    ])

    const areaPorId = new Map(areas.map((a: any) => [a._id, a['NombreÁrea']]))
    const puestoPorId = new Map(puestos.map((p: any) => [p._id, p.NombrePuesto]))

    const ahora = new Date()
    const inicioAnio = new Date(Date.UTC(ahora.getUTCFullYear(), 0, 1))

    const nombreArea = (e: any) => areaPorId.get(e['Área']) ?? 'Sin área'
    const nombrePuesto = (e: any) => puestoPorId.get(e.Puesto) ?? 'Sin puesto'
    const antiguedadMeses = (e: any) => e.FechaIngreso
      ? Math.floor((ahora.getTime() - new Date(e.FechaIngreso).getTime()) / (30.44 * 24 * 60 * 60 * 1000))
      : 0
    const esBajaDelAnio = (e: any) =>
      e.EstatusEmpleado === 'Baja' && e.FechaSalida && new Date(e.FechaSalida) >= inicioAnio

    const porArea = new Map<string, any[]>()
    for (const e of empleados) {
      const area = nombreArea(e)
      if (!porArea.has(area)) porArea.set(area, [])
      porArea.get(area)!.push(e)
    }

    const areasRotacion = [...porArea.entries()].map(([area, empleadosArea]) => {
      const activos = empleadosArea.filter((e: any) => e.EstatusEmpleado === 'Activo')
      const bajasDelAnio = empleadosArea.filter(esBajaDelAnio).length
      const rotacion = activos.length > 0 ? bajasDelAnio / activos.length : null

      const porPuestoMap = new Map<string, any[]>()
      for (const e of empleadosArea) {
        const puesto = nombrePuesto(e)
        if (!porPuestoMap.has(puesto)) porPuestoMap.set(puesto, [])
        porPuestoMap.get(puesto)!.push(e)
      }
      const porPuesto = [...porPuestoMap.entries()].map(([puesto, empleadosPuesto]) => {
        const activosPuesto = empleadosPuesto.filter((e: any) => e.EstatusEmpleado === 'Activo')
        const bajasPuesto = empleadosPuesto.filter(esBajaDelAnio).length
        return {
          puesto,
          activos: activosPuesto.length,
          bajasDelAnio: bajasPuesto,
          rotacion: activosPuesto.length > 0 ? bajasPuesto / activosPuesto.length : null,
        }
      }).sort((a, b) => b.activos - a.activos)

      const colaboradores = empleadosArea
        .map((e: any) => ({
          nombre: e.NombreEmpleado || 'Sin nombre',
          puesto: nombrePuesto(e),
          antiguedadMeses: antiguedadMeses(e),
          estatus: e.EstatusEmpleado || 'Desconocido',
        }))
        .sort((a, b) => b.antiguedadMeses - a.antiguedadMeses)

      return { area, activos: activos.length, bajasDelAnio, rotacion, porPuesto, colaboradores }
    }).sort((a, b) => b.activos - a.activos)

    return json({ areas: areasRotacion })
  } catch (e) {
    return json({ error: e.message }, 502)
  }
})
