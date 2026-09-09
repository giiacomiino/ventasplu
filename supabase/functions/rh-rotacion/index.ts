import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, json, bubbleEnv, bubbleGetAll, conOrg, requirePermiso } from '../_shared/bubble.ts'

// Días de vacaciones por año de servicio cumplido, Ley Federal del
// Trabajo (art. 76): 12/14/16/18/20 los primeros 5 años, +2 cada 5 años
// después. El periodo de cada empleado corre por su aniversario de
// ingreso, no por año calendario.
const DIAS_VACACIONES_LFT = [12, 14, 16, 18, 20]
const ESTADOS_AUSENCIA = ['descanso', 'vacaciones', 'falta', 'incapacidad', 'permiso']

function diasVacacionesPorAnio(anioServicio: number): number {
  if (anioServicio <= 0) return 0
  if (anioServicio <= 5) return DIAS_VACACIONES_LFT[anioServicio - 1]
  const bloque = Math.ceil((anioServicio - 5) / 5)
  return 20 + bloque * 2
}

function periodoAniversarioActual(fechaIngreso: Date, hoy: Date) {
  const anioIngreso = fechaIngreso.getUTCFullYear()
  const mes = fechaIngreso.getUTCMonth()
  const dia = fechaIngreso.getUTCDate()

  let aniosCumplidos = hoy.getUTCFullYear() - anioIngreso
  let ultimoAniversario = new Date(Date.UTC(hoy.getUTCFullYear(), mes, dia))
  if (hoy < ultimoAniversario) {
    aniosCumplidos -= 1
    ultimoAniversario = new Date(Date.UTC(hoy.getUTCFullYear() - 1, mes, dia))
  }
  const siguienteAniversario = new Date(Date.UTC(ultimoAniversario.getUTCFullYear() + 1, mes, dia))
  return { aniosCumplidos, inicio: ultimoAniversario, fin: siguienteAniversario }
}

function fechaISO(d: Date) {
  return d.toISOString().slice(0, 10)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await requirePermiso(req, 'rh')
  if (!user) return json({ error: 'No autorizado' }, 401)

  const { bubbleUrl, bubbleToken } = bubbleEnv()
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  try {
    const [empleados, areas, puestos] = await Promise.all([
      bubbleGetAll(bubbleUrl, bubbleToken, 'Empleado', conOrg()),
      bubbleGetAll(bubbleUrl, bubbleToken, 'Área', conOrg()),
      bubbleGetAll(bubbleUrl, bubbleToken, 'Puestos', conOrg()),
    ])

    const ahora = new Date()
    const anio = ahora.getUTCFullYear()
    const inicioAnio = new Date(Date.UTC(anio, 0, 1))
    const inicioAnioStr = fechaISO(inicioAnio)
    const finAnioStr = `${anio}-12-31`

    // Vacaciones tomadas: se necesita el histórico completo porque el
    // periodo de cada empleado corre por su aniversario, no por año
    // calendario, y puede pisar el año anterior.
    const { data: vacacionesTomadas, error: errorVac } = await admin
      .from('rh_asistencias')
      .select('empleado_bubble_id, fecha')
      .eq('estado', 'vacaciones')
    if (errorVac) return json({ error: errorVac.message }, 400)

    const vacacionesPorEmpleado = new Map<string, string[]>()
    for (const v of vacacionesTomadas ?? []) {
      if (!vacacionesPorEmpleado.has(v.empleado_bubble_id)) vacacionesPorEmpleado.set(v.empleado_bubble_id, [])
      vacacionesPorEmpleado.get(v.empleado_bubble_id)!.push(v.fecha)
    }

    // Ausencias del año en curso (todas las razones) para el detalle del
    // colaborador — a diferencia de vacacionesPorEmpleado, esto sí se
    // acota al año calendario porque es informativo, no un saldo legal.
    const { data: asistenciasAnio, error: errorAsis } = await admin
      .from('rh_asistencias')
      .select('empleado_bubble_id, estado')
      .gte('fecha', inicioAnioStr)
      .lte('fecha', finAnioStr)
    if (errorAsis) return json({ error: errorAsis.message }, 400)

    const asistenciaAnioPorEmpleado = new Map<string, Record<string, number>>()
    for (const r of asistenciasAnio ?? []) {
      if (!asistenciaAnioPorEmpleado.has(r.empleado_bubble_id)) {
        asistenciaAnioPorEmpleado.set(r.empleado_bubble_id, { descanso: 0, vacaciones: 0, falta: 0, incapacidad: 0, permiso: 0 })
      }
      const acc = asistenciaAnioPorEmpleado.get(r.empleado_bubble_id)!
      if (r.estado in acc) acc[r.estado] += 1
    }

    const areaPorId = new Map(areas.map((a: any) => [a._id, a['NombreÁrea']]))
    const puestoPorId = new Map(puestos.map((p: any) => [p._id, p.NombrePuesto]))
    const sueldoPorPuestoId = new Map(puestos.map((p: any) => [p._id, Number(p.SuedoDiario) || 0]))

    const nombreArea = (e: any) => areaPorId.get(e['Área']) ?? 'Sin área'
    const nombrePuesto = (e: any) => puestoPorId.get(e.Puesto) ?? 'Sin puesto'
    const antiguedadMeses = (e: any) => e.FechaIngreso
      ? Math.floor((ahora.getTime() - new Date(e.FechaIngreso).getTime()) / (30.44 * 24 * 60 * 60 * 1000))
      : 0
    const esBajaDelAnio = (e: any) =>
      e.EstatusEmpleado === 'Baja' && e.FechaSalida && new Date(e.FechaSalida) >= inicioAnio
    const costoMensualDe = (e: any) =>
      e.EstatusEmpleado === 'Activo' ? (sueldoPorPuestoId.get(e.Puesto) ?? 0) * 30 : 0

    const vacacionesDe = (e: any) => {
      if (e.EstatusEmpleado !== 'Activo' || !e.FechaIngreso) return null
      const { aniosCumplidos, inicio, fin } = periodoAniversarioActual(new Date(e.FechaIngreso), ahora)
      const correspondientes = diasVacacionesPorAnio(aniosCumplidos)
      const fechasVac = vacacionesPorEmpleado.get(e._id) ?? []
      const tomados = fechasVac.filter(f => f >= fechaISO(inicio) && f < fechaISO(fin)).length
      return { correspondientes, tomados, disponibles: Math.max(correspondientes - tomados, 0) }
    }

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
      const costoMensual = empleadosArea.reduce((s, e) => s + costoMensualDe(e), 0)

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
          costoMensual: empleadosPuesto.reduce((s, e) => s + costoMensualDe(e), 0),
        }
      }).sort((a, b) => b.activos - a.activos)

      const colaboradores = empleadosArea
        .map((e: any) => {
          const ausenciasAnio = asistenciaAnioPorEmpleado.get(e._id) ?? { descanso: 0, vacaciones: 0, falta: 0, incapacidad: 0, permiso: 0 }
          return {
            nombre: e.NombreEmpleado || 'Sin nombre',
            puesto: nombrePuesto(e),
            estatus: e.EstatusEmpleado || 'Desconocido',
            fechaIngreso: e.FechaIngreso ?? null,
            fechaSalida: e.FechaSalida ?? null,
            antiguedadMeses: antiguedadMeses(e),
            costoMensual: costoMensualDe(e),
            vacaciones: vacacionesDe(e),
            ausenciasAnio,
          }
        })
        .sort((a, b) => b.antiguedadMeses - a.antiguedadMeses)

      return { area, activos: activos.length, bajasDelAnio, rotacion, costoMensual, porPuesto, colaboradores }
    }).sort((a, b) => b.activos - a.activos)

    return json({ areas: areasRotacion, anio })
  } catch (e) {
    return json({ error: e.message }, 502)
  }
})
