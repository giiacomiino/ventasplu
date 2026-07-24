import { corsHeaders, json, bubbleEnv, bubbleGet, conOrg, isoWeekday, requireRole } from '../_shared/bubble.ts'

function sumaVenta(results: any[]) {
  return results.reduce((s, v) => s + (v.VentaNeta || 0), 0)
}

function limitesMes(anio: number, mes0: number) {
  return {
    inicio: new Date(Date.UTC(anio, mes0, 1)).toISOString(),
    fin: new Date(Date.UTC(anio, mes0 + 1, 0, 23, 59, 59)).toISOString(),
  }
}

function limitesTramo(anio: number, mes0: number, diaCorte: number) {
  return {
    inicio: new Date(Date.UTC(anio, mes0, 1)).toISOString(),
    fin: new Date(Date.UTC(anio, mes0, diaCorte, 23, 59, 59)).toISOString(),
  }
}

function mesAnterior0(anio: number, mes0: number) {
  return mes0 === 0 ? { anio: anio - 1, mes0: 11 } : { anio, mes0: mes0 - 1 }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await requireRole(req, ['owner', 'admin'])
  if (!user) return json({ error: 'No autorizado' }, 401)

  const { bubbleUrl, bubbleToken } = bubbleEnv()
  const body = await req.json().catch(() => ({}))

  try {
    const hoyReal = new Date()
    // mes seleccionado (1-12 desde el cliente); por default, el mes real en curso
    const anio = body.anio ?? hoyReal.getUTCFullYear()
    const mes0 = (body.mes ?? hoyReal.getUTCMonth() + 1) - 1 // 0-indexado internamente
    const esMesActual = anio === hoyReal.getUTCFullYear() && mes0 === hoyReal.getUTCMonth()
    const diasDelMes = new Date(Date.UTC(anio, mes0 + 1, 0)).getUTCDate()
    const diaCorte = esMesActual ? hoyReal.getUTCDate() : diasDelMes

    const { inicio: inicioSel, fin: finSel } = esMesActual
      ? limitesTramo(anio, mes0, diaCorte)
      : limitesMes(anio, mes0)

    const anteriorRef = mesAnterior0(anio, mes0)
    const { inicio: inicioAnt, fin: finAnt } = esMesActual
      ? limitesTramo(anteriorRef.anio, anteriorRef.mes0, diaCorte)
      : limitesMes(anteriorRef.anio, anteriorRef.mes0)

    const { inicio: inicioAnioAntTramo, fin: finAnioAntTramo } = limitesTramo(anio - 1, mes0, diaCorte)
    const { inicio: inicioAnioAntCompleto, fin: finAnioAntCompleto } = limitesMes(anio - 1, mes0)

    const [ventaData, promedioData, selData, mesAnteriorData, anioAnteriorTramoData, anioAnteriorCompletoData] = await Promise.all([
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
        constraints: JSON.stringify(conOrg(
          { key: 'DiaDeVenta', constraint_type: 'greater than', value: inicioSel },
          { key: 'DiaDeVenta', constraint_type: 'less than', value: finSel },
        )),
        limit: '100',
      }),
      bubbleGet(bubbleUrl, bubbleToken, 'Venta', {
        constraints: JSON.stringify(conOrg(
          { key: 'DiaDeVenta', constraint_type: 'greater than', value: inicioAnt },
          { key: 'DiaDeVenta', constraint_type: 'less than', value: finAnt },
        )),
        limit: '100',
      }),
      bubbleGet(bubbleUrl, bubbleToken, 'Venta', {
        constraints: JSON.stringify(conOrg(
          { key: 'DiaDeVenta', constraint_type: 'greater than', value: inicioAnioAntTramo },
          { key: 'DiaDeVenta', constraint_type: 'less than', value: finAnioAntTramo },
        )),
        limit: '100',
      }),
      bubbleGet(bubbleUrl, bubbleToken, 'Venta', {
        constraints: JSON.stringify(conOrg(
          { key: 'DiaDeVenta', constraint_type: 'greater than', value: inicioAnioAntCompleto },
          { key: 'DiaDeVenta', constraint_type: 'less than', value: finAnioAntCompleto },
        )),
        limit: '100',
      }),
    ])

    const ventas = ventaData.response.results
    if (ventas.length === 0) return json({ error: 'Sin registros de venta en Bubble' }, 404)

    const promedioPorDia = new Map(
      promedioData.response.results.map((p: any) => [p.DiaSemana, p.PromedioVenta]),
    )

    // "ayer" y los últimos 14 días son siempre lo más reciente real,
    // independientes del mes seleccionado en el resto de la página
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

    // ── Venta del mes seleccionado (parcial si es el mes en curso, cerrada si no) ──
    const ventaNetaSel = sumaVenta(selData.response.results)
    const ventaNetaMesAnterior = sumaVenta(mesAnteriorData.response.results)
    const ventaNetaAnioAnteriorTramo = sumaVenta(anioAnteriorTramoData.response.results)
    const ventaTotalMesAnioAnterior = sumaVenta(anioAnteriorCompletoData.response.results)

    const momPct = ventaNetaMesAnterior ? ((ventaNetaSel - ventaNetaMesAnterior) / ventaNetaMesAnterior) * 100 : null
    // si es el mes en curso, comparamos MTD vs MTD (mismo tramo); si ya cerró, comparamos el total real vs. el total real
    const yoyBase = esMesActual ? ventaNetaAnioAnteriorTramo : ventaTotalMesAnioAnterior
    const yoyPct = yoyBase ? ((ventaNetaSel - yoyBase) / yoyBase) * 100 : null

    // ── Proyección de cierre (solo aplica si es el mes en curso) ───────
    let proyeccionCierreMes = null
    let proyeccionVsAnioAnteriorPct = null
    if (esMesActual) {
      let proyeccionRestante = 0
      for (let d = diaCorte + 1; d <= diasDelMes; d++) {
        const fecha = new Date(Date.UTC(anio, mes0, d))
        const diaSemana = isoWeekday(fecha.toISOString())
        proyeccionRestante += promedioPorDia.get(diaSemana) ?? 0
      }
      proyeccionCierreMes = ventaNetaSel + proyeccionRestante
      proyeccionVsAnioAnteriorPct = ventaTotalMesAnioAnterior
        ? ((proyeccionCierreMes - ventaTotalMesAnioAnterior) / ventaTotalMesAnioAnterior) * 100
        : null
    }

    // ── Promedio real del mes seleccionado por día de la semana ────────
    const acumPorDia = new Map<number, { suma: number; n: number }>()
    for (const v of selData.response.results) {
      const dia = isoWeekday(v.DiaDeVenta)
      const acc = acumPorDia.get(dia) ?? { suma: 0, n: 0 }
      acc.suma += v.VentaNeta || 0
      acc.n += 1
      acumPorDia.set(dia, acc)
    }
    const porDiaSemana = [1, 2, 3, 4, 5, 6, 7].map(dia => {
      const acc = acumPorDia.get(dia)
      return {
        diaSemana: dia,
        promedioReal: acc ? acc.suma / acc.n : null,
        promedioHistorico: promedioPorDia.get(dia) ?? null,
      }
    })

    return json({
      ayer,
      tendencia,
      mtd: {
        anio,
        mes: mes0 + 1,
        esMesActual,
        ventaNeta: ventaNetaSel,
        diaCorte,
        diasDelMes,
        momPct,
        yoyPct,
        proyeccionCierreMes,
        ventaTotalMesAnioAnterior,
        proyeccionVsAnioAnteriorPct,
      },
      porDiaSemana,
    })
  } catch (e) {
    return json({ error: e.message }, 502)
  }
})
