import { corsHeaders, json, bubbleEnv, bubbleGet, conOrg, isoWeekday, requireProfile } from '../_shared/bubble.ts'

function sumaVenta(results: any[]) {
  return results.reduce((s, v) => s + (v.VentaNeta || 0), 0)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await requireProfile(req)
  if (!user) return json({ error: 'No autorizado' }, 401)

  const { bubbleUrl, bubbleToken } = bubbleEnv()

  try {
    const ahora = new Date()
    const anio = ahora.getUTCFullYear()
    const mes = ahora.getUTCMonth() // 0-indexed
    const diaHoy = ahora.getUTCDate()
    const diasDelMes = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate()

    const inicioMesActual = new Date(Date.UTC(anio, mes, 1)).toISOString()
    const inicioMesAnterior = new Date(Date.UTC(anio, mes - 1, 1)).toISOString()
    const finTramoMesAnterior = new Date(Date.UTC(anio, mes - 1, diaHoy, 23, 59, 59)).toISOString()
    const inicioMismoMesAnioAnterior = new Date(Date.UTC(anio - 1, mes, 1)).toISOString()
    const finTramoAnioAnterior = new Date(Date.UTC(anio - 1, mes, diaHoy, 23, 59, 59)).toISOString()

    const [ventaData, promedioData, mtdData, mesAnteriorData, anioAnteriorData] = await Promise.all([
      bubbleGet(bubbleUrl, bubbleToken, 'Venta', {
        constraints: JSON.stringify(conOrg()),
        sort_field: 'DiaDeVenta',
        descending: 'true',
        limit: '14',
      }),
      bubbleGet(bubbleUrl, bubbleToken, 'PromedioVentaDiaSemana', {
        constraints: JSON.stringify(conOrg()),
        limit: '7',
      }),
      bubbleGet(bubbleUrl, bubbleToken, 'Venta', {
        constraints: JSON.stringify(conOrg({ key: 'DiaDeVenta', constraint_type: 'greater than', value: inicioMesActual })),
        limit: '100',
      }),
      bubbleGet(bubbleUrl, bubbleToken, 'Venta', {
        constraints: JSON.stringify(conOrg(
          { key: 'DiaDeVenta', constraint_type: 'greater than', value: inicioMesAnterior },
          { key: 'DiaDeVenta', constraint_type: 'less than', value: finTramoMesAnterior },
        )),
        limit: '100',
      }),
      bubbleGet(bubbleUrl, bubbleToken, 'Venta', {
        constraints: JSON.stringify(conOrg(
          { key: 'DiaDeVenta', constraint_type: 'greater than', value: inicioMismoMesAnioAnterior },
          { key: 'DiaDeVenta', constraint_type: 'less than', value: finTramoAnioAnterior },
        )),
        limit: '100',
      }),
    ])

    const ventas = ventaData.response.results
    if (ventas.length === 0) return json({ error: 'Sin registros de venta en Bubble' }, 404)

    const promedioPorDia = new Map(
      promedioData.response.results.map((p: any) => [p.DiaSemana, p.PromedioVenta]),
    )

    // más reciente primero -> lo invertimos para graficar de izquierda (viejo) a derecha (ayer)
    const tendencia = [...ventas].reverse().map((v: any) => {
      const diaSemana = isoWeekday(v.DiaDeVenta)
      const promedioVenta = promedioPorDia.get(diaSemana) ?? null
      const diferenciaPct = promedioVenta ? ((v.VentaNeta - promedioVenta) / promedioVenta) * 100 : null
      return {
        fecha: v.DiaDeVenta,
        diaSemana,
        ventaNeta: v.VentaNeta,
        promedioVenta,
        diferenciaPct,
        buenDia: diferenciaPct != null ? diferenciaPct >= 0 : null,
      }
    })

    const ultimo = ventas[0]
    const ayer = {
      ...tendencia[tendencia.length - 1],
      ventaBruta: ultimo.VentaBruta,
      personas: ultimo['# Personas'],
      ticketPromedio: ultimo.TicketPromedio,
    }

    // ── Venta MTD + MoM + YoY ──────────────────────────────────────────
    const ventaNetaMTD = sumaVenta(mtdData.response.results)
    const ventaNetaMesAnteriorTramo = sumaVenta(mesAnteriorData.response.results)
    const ventaNetaAnioAnteriorTramo = sumaVenta(anioAnteriorData.response.results)
    const momPct = ventaNetaMesAnteriorTramo ? ((ventaNetaMTD - ventaNetaMesAnteriorTramo) / ventaNetaMesAnteriorTramo) * 100 : null
    const yoyPct = ventaNetaAnioAnteriorTramo ? ((ventaNetaMTD - ventaNetaAnioAnteriorTramo) / ventaNetaAnioAnteriorTramo) * 100 : null

    // ── Proyección de cierre de mes ────────────────────────────────────
    // suma el MTD real + el promedio histórico de cada día de la semana
    // restante del mes (no una simple regla de tres)
    let proyeccionRestante = 0
    for (let d = diaHoy + 1; d <= diasDelMes; d++) {
      const fecha = new Date(Date.UTC(anio, mes, d))
      const diaSemana = isoWeekday(fecha.toISOString())
      proyeccionRestante += promedioPorDia.get(diaSemana) ?? 0
    }
    const proyeccionCierreMes = ventaNetaMTD + proyeccionRestante

    return json({
      ayer,
      tendencia,
      mtd: {
        ventaNeta: ventaNetaMTD,
        diaHoy,
        diasDelMes,
        momPct,
        yoyPct,
        proyeccionCierreMes,
      },
    })
  } catch (e) {
    return json({ error: e.message }, 502)
  }
})
