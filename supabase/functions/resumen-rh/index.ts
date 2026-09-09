import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, json, bubbleEnv, bubbleGetAll, conOrg, requirePermiso, mapearEmpleadosNativos } from '../_shared/bubble.ts'

// Headcount activo reconstruido a cualquier fecha de corte: quién ya
// había ingresado y aún no había salido a esa fecha. Se usa tanto para la
// serie mensual como para las comparativas YoY.
function hcActivoAlCorte(empleados: any[], corte: Date): number {
  return empleados.filter((e: any) => {
    if (!e.FechaIngreso) return false
    if (new Date(e.FechaIngreso) > corte) return false
    if (e.EstatusEmpleado === 'Baja' && e.FechaSalida && new Date(e.FechaSalida) <= corte) return false
    return true
  }).length
}

function antiguedadPromedioAlCorte(empleados: any[], corte: Date): number | null {
  const activosCorte = empleados.filter((e: any) => {
    if (!e.FechaIngreso) return false
    if (new Date(e.FechaIngreso) > corte) return false
    if (e.EstatusEmpleado === 'Baja' && e.FechaSalida && new Date(e.FechaSalida) <= corte) return false
    return true
  })
  const antiguedades = activosCorte.map((e: any) => (corte.getTime() - new Date(e.FechaIngreso).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
  return antiguedades.length ? antiguedades.reduce((a, b) => a + b, 0) / antiguedades.length : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await requirePermiso(req, ['rh', 'dashboard'])
  if (!user) return json({ error: 'No autorizado' }, 401)

  const body = await req.json().catch(() => ({}))
  const { bubbleUrl, bubbleToken } = bubbleEnv()
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  try {
    const [empleadosBubble, areas, puestos, { data: nativos, error: errorNativos }] = await Promise.all([
      bubbleGetAll(bubbleUrl, bubbleToken, 'Empleado', conOrg()),
      bubbleGetAll(bubbleUrl, bubbleToken, 'Área', conOrg()),
      bubbleGetAll(bubbleUrl, bubbleToken, 'Puestos', conOrg()),
      admin.from('empleados_nativos').select('*'),
    ])
    if (errorNativos) return json({ error: errorNativos.message }, 400)
    const empleados = [...empleadosBubble, ...mapearEmpleadosNativos(nativos ?? [])]

    const areaPorId = new Map(areas.map((a: any) => [a._id, a['NombreÁrea']]))
    const puestoPorId = new Map(puestos.map((p: any) => [p._id, { nombre: p.NombrePuesto, sueldo: p.SuedoDiario }]))
    const sueldoDe = (e: any) => e._sueldoNativo ?? puestoPorId.get(e.Puesto)?.sueldo ?? 0

    const activos = empleados.filter((e: any) => e.EstatusEmpleado === 'Activo')
    const headcountActivo = activos.length

    const ahora = new Date()
    const inicioAnio = new Date(Date.UTC(ahora.getUTCFullYear(), 0, 1))
    const bajasDelAnio = empleados.filter((e: any) =>
      e.EstatusEmpleado === 'Baja' && e.FechaSalida && new Date(e.FechaSalida) >= inicioAnio,
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
      const nombre = areaPorId.get(e['Área']) ?? e['Área'] ?? 'Sin área'
      porArea.set(nombre, (porArea.get(nombre) ?? 0) + 1)
    }
    const hcPorArea = [...porArea.entries()]
      .map(([nombre, headcount]) => ({ nombre, headcount }))
      .sort((a, b) => b.headcount - a.headcount)

    const porPuesto = new Map<string, { headcount: number; sueldo: number }>()
    for (const e of activos) {
      const nombre = puestoPorId.get(e.Puesto)?.nombre ?? e.Puesto ?? 'Sin puesto'
      const actual = porPuesto.get(nombre) ?? { headcount: 0, sueldo: sueldoDe(e) }
      actual.headcount += 1
      porPuesto.set(nombre, actual)
    }
    const hcPorPuesto = [...porPuesto.entries()]
      .map(([nombre, v]) => ({ nombre, ...v, nominaEstimadaMensual: v.headcount * v.sueldo * 30 }))
      .sort((a, b) => b.headcount - a.headcount)

    const nominaEstimadaMensual = hcPorPuesto.reduce((s, p) => s + p.nominaEstimadaMensual, 0)

    // Serie de últimos 12 meses (LTM) terminando en el mes seleccionado
    // (selector de mes global de la app, default: mes en curso): altas
    // (por FechaIngreso), bajas (por FechaSalida, mismo criterio
    // aproximado que bajasDelAnio) y el HC activo reconstruido al cierre
    // de cada mes.
    const anioSel = body.anio ?? ahora.getUTCFullYear()
    const mesSel = body.mes ?? ahora.getUTCMonth() + 1 // 1-12
    const serieAnual = []
    for (let i = 11; i >= 0; i--) {
      const refMes = new Date(Date.UTC(anioSel, mesSel - 1 - i, 1))
      const anioMes = refMes.getUTCFullYear()
      const mes = refMes.getUTCMonth() // 0-indexado
      const inicioMes = new Date(Date.UTC(anioMes, mes, 1))
      const finMes = new Date(Date.UTC(anioMes, mes + 1, 0, 23, 59, 59))

      const altas = empleados.filter((e: any) => {
        if (!e.FechaIngreso) return false
        const f = new Date(e.FechaIngreso)
        return f >= inicioMes && f <= finMes
      }).length

      const bajas = empleados.filter((e: any) => {
        if (e.EstatusEmpleado !== 'Baja' || !e.FechaSalida) return false
        const f = new Date(e.FechaSalida)
        return f >= inicioMes && f <= finMes
      }).length

      const hcActivo = empleados.filter((e: any) => {
        if (!e.FechaIngreso) return false
        if (new Date(e.FechaIngreso) > finMes) return false
        if (e.EstatusEmpleado === 'Baja' && e.FechaSalida && new Date(e.FechaSalida) <= finMes) return false
        return true
      }).length

      serieAnual.push({ anio: anioMes, mes, altas, bajas, hcActivo })
    }

    // Comparativas YoY: mismo corte relativo (hoy) pero un año antes, para
    // headcount, rotación y antigüedad. Bajas hace un año se acota YTD del
    // año anterior, igual criterio que rotacionAnual.
    const haceUnAnio = new Date(Date.UTC(ahora.getUTCFullYear() - 1, ahora.getUTCMonth(), ahora.getUTCDate()))
    const inicioAnioAnterior = new Date(Date.UTC(ahora.getUTCFullYear() - 1, 0, 1))

    const headcountActivoAnioAnterior = hcActivoAlCorte(empleados, haceUnAnio)
    const bajasYtdAnioAnterior = empleados.filter((e: any) =>
      e.EstatusEmpleado === 'Baja' && e.FechaSalida && new Date(e.FechaSalida) >= inicioAnioAnterior && new Date(e.FechaSalida) <= haceUnAnio,
    ).length
    const rotacionAnualAnterior = headcountActivoAnioAnterior > 0 ? bajasYtdAnioAnterior / headcountActivoAnioAnterior : null
    const antiguedadPromedioAnioAnterior = antiguedadPromedioAlCorte(empleados, haceUnAnio)

    const deltaPctRelativo = (actual: number | null, anterior: number | null) =>
      actual != null && anterior ? ((actual - anterior) / anterior) * 100 : null

    const comparativas = {
      headcountActivo: { actual: headcountActivo, anterior: headcountActivoAnioAnterior, deltaPct: deltaPctRelativo(headcountActivo, headcountActivoAnioAnterior) },
      rotacionAnual: { actual: rotacionAnual, anterior: rotacionAnualAnterior, deltaPct: deltaPctRelativo(rotacionAnual, rotacionAnualAnterior) },
      antiguedadPromedio: { actual: antiguedadPromedio, anterior: antiguedadPromedioAnioAnterior, deltaPct: deltaPctRelativo(antiguedadPromedio, antiguedadPromedioAnioAnterior) },
    }

    return json({
      headcountActivo,
      bajasDelAnio,
      rotacionAnual,
      antiguedadPromedio,
      hcPorArea,
      hcPorPuesto,
      nominaEstimadaMensual,
      serieAnual,
      comparativas,
    })
  } catch (e) {
    return json({ error: e.message }, 502)
  }
})
