import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, json, bubbleEnv, bubbleGet, bubbleGetAll, conOrg, isoWeekday, requirePermiso } from '../_shared/bubble.ts'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// Los 12 meses del año: los días que ya pasaron usan la venta neta real
// (Bubble histórico, con Supabase ganando en los días que ya tenga
// capturados); los días que faltan del mes en curso y los meses que
// todavía no empiezan se proyectan con el promedio histórico de venta por
// día de la semana — mismo criterio que ya usa la proyección de cierre de
// mes individual, extendido a los 12 meses para ver el año completo.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await requirePermiso(req, 'ventas')
  if (!user) return json({ error: 'No autorizado' }, 401)

  const body = await req.json().catch(() => ({}))
  const hoyReal = new Date()
  const anio = body.anio ?? hoyReal.getUTCFullYear()

  try {
    const { bubbleUrl, bubbleToken } = bubbleEnv()
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)

    const inicioAnio = new Date(Date.UTC(anio, 0, 1))
    const finAnio = new Date(Date.UTC(anio, 11, 31, 23, 59, 59))

    const [ventasBubble, promedioData, { data: reportesSupabase, error }] = await Promise.all([
      bubbleGetAll(bubbleUrl, bubbleToken, 'Venta', conOrg(
        { key: 'DiaDeVenta', constraint_type: 'greater than', value: inicioAnio.toISOString() },
        { key: 'DiaDeVenta', constraint_type: 'less than', value: finAnio.toISOString() },
      )),
      bubbleGet(bubbleUrl, bubbleToken, 'PromedioVentaDiaSemana', { constraints: JSON.stringify(conOrg()), limit: '7' }),
      admin.from('reportes_venta_diaria').select('fecha, venta_neta').gte('fecha', inicioAnio.toISOString().slice(0, 10)).lte('fecha', finAnio.toISOString().slice(0, 10)),
    ])
    if (error) return json({ error: error.message }, 400)

    const promedioPorDiaSemana = new Map(
      promedioData.response.results.map((p: any) => [p.DiaSemana, p.PromedioVenta || 0]),
    )

    const realPorDia = new Map<string, number>()
    for (const v of ventasBubble) {
      const key = new Date(v.DiaDeVenta).toISOString().slice(0, 10)
      realPorDia.set(key, v.VentaNeta || 0)
    }
    for (const r of reportesSupabase ?? []) {
      if (r.venta_neta != null) realPorDia.set(r.fecha, r.venta_neta)
    }

    const hoyStr = hoyReal.toISOString().slice(0, 10)
    const meses = []

    for (let mes0 = 0; mes0 < 12; mes0++) {
      const diasDelMes = new Date(Date.UTC(anio, mes0 + 1, 0)).getUTCDate()
      let real = 0
      let proyectado = 0
      let tieneReal = false
      let tieneProyeccion = false

      for (let d = 1; d <= diasDelMes; d++) {
        const fecha = new Date(Date.UTC(anio, mes0, d))
        const fechaStr = fecha.toISOString().slice(0, 10)
        if (fechaStr <= hoyStr) {
          real += realPorDia.get(fechaStr) ?? 0
          tieneReal = true
        } else {
          proyectado += promedioPorDiaSemana.get(isoWeekday(fecha.toISOString())) ?? 0
          tieneProyeccion = true
        }
      }

      meses.push({
        mes: `${MESES[mes0]} ${String(anio).slice(2)}`,
        real: tieneReal ? real : null,
        proyectado: tieneProyeccion ? proyectado : null,
      })
    }

    return json({ anio, meses })
  } catch (e) {
    return json({ error: e.message }, 502)
  }
})
