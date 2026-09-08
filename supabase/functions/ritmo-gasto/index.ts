import { corsHeaders, json, bubbleEnv, bubbleGet, bubbleGetAllFast, conOrg, isoWeekday, requirePermiso } from '../_shared/bubble.ts'

// Ritmo de gasto: compara, día a día del mes en curso, el gasto real
// acumulado contra dos rectas de ritmo ideal —una para agotar justo el
// presupuesto global al último día, otra para no exceder la venta neta
// proyectada del mes— para poder corregir a mitad de mes en vez de
// descubrir hasta el día 30 que ya se pasó.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await requirePermiso(req, ['pagos', 'dashboard'])
  if (!user) return json({ error: 'No autorizado' }, 401)

  const { bubbleUrl, bubbleToken } = bubbleEnv()
  const body = await req.json().catch(() => ({}))

  try {
    const hoy = new Date()
    const anio = body.anio ?? hoy.getUTCFullYear()
    const mes0 = (body.mes ?? hoy.getUTCMonth() + 1) - 1
    const esMesActual = anio === hoy.getUTCFullYear() && mes0 === hoy.getUTCMonth()
    const diasDelMes = new Date(Date.UTC(anio, mes0 + 1, 0)).getUTCDate()
    // Mes cerrado: el "corte" es el último día (ya se sabe cómo terminó).
    // Mes en curso: el corte es hoy.
    const diaCorte = esMesActual ? hoy.getUTCDate() : diasDelMes
    const inicioMes = new Date(Date.UTC(anio, mes0, 1))
    const finMes = new Date(Date.UTC(anio, mes0 + 1, 0, 23, 59, 59))

    const [snapshotsData, gastoCrudo, ventaData, promedioData] = await Promise.all([
      bubbleGet(bubbleUrl, bubbleToken, 'BudgetSnapshot', {
        constraints: JSON.stringify(conOrg()),
        sort_field: 'MesDeReferencia',
        descending: 'true',
        limit: '50',
      }),
      bubbleGetAllFast(bubbleUrl, bubbleToken, 'Inventario', conOrg(
        { key: 'FechaDeIngreso', constraint_type: 'greater than', value: inicioMes.toISOString() },
        { key: 'FechaDeIngreso', constraint_type: 'less than', value: finMes.toISOString() },
        { key: 'borrada?', constraint_type: 'equals', value: false },
      )),
      bubbleGet(bubbleUrl, bubbleToken, 'Venta', {
        constraints: JSON.stringify(conOrg(
          { key: 'DiaDeVenta', constraint_type: 'greater than', value: inicioMes.toISOString() },
          { key: 'DiaDeVenta', constraint_type: 'less than', value: finMes.toISOString() },
        )),
        limit: '100',
      }),
      bubbleGet(bubbleUrl, bubbleToken, 'PromedioVentaDiaSemana', { constraints: JSON.stringify(conOrg()), limit: '7' }),
    ])

    // ── Presupuesto global del mes: suma de LimiteMes de todas las
    // categorías (el "Gasto estimado total" que ya se ve en Presupuesto).
    let presupuestoGlobal = 0
    for (const s of snapshotsData.response.results) {
      const d = new Date(s.MesDeReferencia)
      if (d.getUTCFullYear() === anio && d.getUTCMonth() === mes0) presupuestoGlobal += s.LimiteMes || 0
    }

    // ── Gasto real acumulado día por día ────────────────────────────────
    const gastos = gastoCrudo.filter((f: any) => f['borrada?'] !== true)
    const gastoPorDia = new Map<number, number>()
    for (const f of gastos) {
      const dia = new Date(f.FechaDeIngreso).getUTCDate()
      gastoPorDia.set(dia, (gastoPorDia.get(dia) ?? 0) + (f.MontoSinIVA || 0))
    }

    // ── Venta neta proyectada del mes (ingreso), con promedio por día de
    // la semana para los días que faltan — misma lógica que resumen-ventas.
    const promedioPorDiaSemana = new Map(promedioData.response.results.map((p: any) => [p.DiaSemana, p.PromedioVenta]))
    const ventaNetaMTD = ventaData.response.results.reduce((s: number, v: any) => s + (v.VentaNeta || 0), 0)
    let proyeccionRestante = 0
    for (let d = diaCorte + 1; d <= diasDelMes; d++) {
      const fecha = new Date(Date.UTC(anio, mes0, d))
      proyeccionRestante += promedioPorDiaSemana.get(isoWeekday(fecha.toISOString())) ?? 0
    }
    const ventaNetaProyectada = ventaNetaMTD + proyeccionRestante

    // ── Serie día a día: gasto acumulado + las 2 rectas de ritmo ideal ──
    let acumulado = 0
    const serie = []
    for (let d = 1; d <= diasDelMes; d++) {
      if (d <= diaCorte) acumulado += gastoPorDia.get(d) ?? 0
      serie.push({
        dia: d,
        gastoAcumulado: d <= diaCorte ? acumulado : null,
        ritmoPresupuesto: presupuestoGlobal ? (presupuestoGlobal * d) / diasDelMes : null,
        ritmoIngreso: ventaNetaProyectada ? (ventaNetaProyectada * d) / diasDelMes : null,
      })
    }

    const ritmoIdealHoy = presupuestoGlobal ? (presupuestoGlobal * diaCorte) / diasDelMes : null
    const sobreRitmo = ritmoIdealHoy != null ? acumulado - ritmoIdealHoy : null

    return json({
      anio,
      mes: mes0 + 1,
      diaCorte,
      diasDelMes,
      presupuestoGlobal,
      ventaNetaProyectada,
      gastoAcumuladoHoy: acumulado,
      sobreRitmo,
      serie,
    })
  } catch (e) {
    return json({ error: e.message }, 502)
  }
})
