import { corsHeaders, json, bubbleEnv, bubbleGet, bubbleGetAllFast, conOrg, isoWeekday, requireRole } from '../_shared/bubble.ts'

// Reporte semanal (lunes a domingo) para dirección: venta vs. promedio y
// YoY, gasto por categoría vs. su promedio semanal histórico, facturas
// grandes de la semana, y altas/bajas de RH. La proyección de cierre de
// mes (sección 7 del reporte) NO se calcula aquí — el frontend reutiliza
// resumen-ventas y tendencia-cierre para eso, para no duplicar esa lógica.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await requireRole(req, ['owner', 'admin'])
  if (!user) return json({ error: 'No autorizado' }, 401)

  const { lunes } = await req.json().catch(() => ({}))
  if (!lunes) return json({ error: 'Falta el lunes de la semana' }, 400)
  const { bubbleUrl, bubbleToken } = bubbleEnv()

  try {
    const [ly, lm, ld] = lunes.split('-').map(Number)
    const inicioSemana = new Date(Date.UTC(ly, lm - 1, ld))
    const finSemana = new Date(Date.UTC(ly, lm - 1, ld + 6, 23, 59, 59))
    // mismo rango, 52 semanas antes (mantiene la alineación lunes-domingo,
    // a diferencia de restar un año calendario)
    const inicioAnioAnt = new Date(inicioSemana.getTime() - 364 * 24 * 60 * 60 * 1000)
    const finAnioAnt = new Date(finSemana.getTime() - 364 * 24 * 60 * 60 * 1000)
    // 8 semanas previas a la seleccionada, para la línea base de gasto por categoría
    const inicioBase = new Date(inicioSemana.getTime() - 8 * 7 * 24 * 60 * 60 * 1000)

    const [
      categoriasData,
      ventaSemanaData,
      promedioDiaData,
      ventaAnioAntData,
      inventarioSemanaCrudas,
      inventarioBaseCrudas,
      empleados,
      ventaBaseData,
    ] = await Promise.all([
      bubbleGet(bubbleUrl, bubbleToken, 'Categorías', { constraints: JSON.stringify(conOrg()), limit: '100' }),
      bubbleGet(bubbleUrl, bubbleToken, 'Venta', {
        constraints: JSON.stringify(conOrg(
          { key: 'DiaDeVenta', constraint_type: 'greater than', value: inicioSemana.toISOString() },
          { key: 'DiaDeVenta', constraint_type: 'less than', value: finSemana.toISOString() },
        )),
        limit: '20',
      }),
      bubbleGet(bubbleUrl, bubbleToken, 'PromedioVentaDiaSemana', { constraints: JSON.stringify(conOrg()), limit: '7' }),
      bubbleGet(bubbleUrl, bubbleToken, 'Venta', {
        constraints: JSON.stringify(conOrg(
          { key: 'DiaDeVenta', constraint_type: 'greater than', value: inicioAnioAnt.toISOString() },
          { key: 'DiaDeVenta', constraint_type: 'less than', value: finAnioAnt.toISOString() },
        )),
        limit: '20',
      }),
      bubbleGetAllFast(bubbleUrl, bubbleToken, 'Inventario', conOrg(
        { key: 'FechaDeIngreso', constraint_type: 'greater than', value: inicioSemana.toISOString() },
        { key: 'FechaDeIngreso', constraint_type: 'less than', value: finSemana.toISOString() },
        { key: 'borrada?', constraint_type: 'equals', value: false },
      )),
      bubbleGetAllFast(bubbleUrl, bubbleToken, 'Inventario', conOrg(
        { key: 'FechaDeIngreso', constraint_type: 'greater than', value: inicioBase.toISOString() },
        { key: 'FechaDeIngreso', constraint_type: 'less than', value: inicioSemana.toISOString() },
        { key: 'borrada?', constraint_type: 'equals', value: false },
      )),
      bubbleGetAllFast(bubbleUrl, bubbleToken, 'Empleado', conOrg()),
      // Sin tabla de "promedio de personas por día" precalculada (a
      // diferencia de PromedioVentaDiaSemana), así que se saca del
      // histórico de las mismas 8 semanas usadas como línea base de gasto.
      bubbleGet(bubbleUrl, bubbleToken, 'Venta', {
        constraints: JSON.stringify(conOrg(
          { key: 'DiaDeVenta', constraint_type: 'greater than', value: inicioBase.toISOString() },
          { key: 'DiaDeVenta', constraint_type: 'less than', value: inicioSemana.toISOString() },
        )),
        limit: '100',
      }),
    ])

    const tipoPorNombre = new Map(
      categoriasData.response.results.map((c: any) => [c.CategoriaNombre, c.TipoDeCosto]),
    )

    // ── Venta de la semana, por día, vs. promedio histórico de cada día ──
    const promedioPorDia = new Map(promedioDiaData.response.results.map((p: any) => [p.DiaSemana, p.PromedioVenta]))
    const ventaPorFecha = new Map(ventaSemanaData.response.results.map((v: any) => [v.DiaDeVenta.slice(0, 10), v]))

    const ventaPorDia = []
    for (let i = 0; i < 7; i++) {
      const fecha = new Date(inicioSemana)
      fecha.setUTCDate(fecha.getUTCDate() + i)
      const fechaStr = fecha.toISOString().slice(0, 10)
      const diaSemana = i + 1 // 1=lunes .. 7=domingo, alineado con isoWeekday
      const v = ventaPorFecha.get(fechaStr)
      const promedioHistorico = promedioPorDia.get(diaSemana) ?? null
      const ventaNeta = v?.VentaNeta ?? 0
      const diferenciaPct = promedioHistorico ? ((ventaNeta - promedioHistorico) / promedioHistorico) * 100 : null
      ventaPorDia.push({ fecha: fechaStr, diaSemana, ventaNeta, promedioHistorico, diferenciaPct })
    }

    const ventaSemana = ventaPorDia.reduce((s, d) => s + d.ventaNeta, 0)
    const promedioSemanalHistorico = [...promedioPorDia.values()].reduce((s, v) => s + (v || 0), 0)
    const ventaSemanaVsPromedioPct = promedioSemanalHistorico ? ((ventaSemana - promedioSemanalHistorico) / promedioSemanalHistorico) * 100 : null
    const ventaSemanaVsPromedioMonto = promedioSemanalHistorico ? ventaSemana - promedioSemanalHistorico : null

    const ventaMismaSemanaAnioAnterior = ventaAnioAntData.response.results.reduce((s: number, v: any) => s + (v.VentaNeta || 0), 0)
    const ventaYoyPct = ventaMismaSemanaAnioAnterior ? ((ventaSemana - ventaMismaSemanaAnioAnterior) / ventaMismaSemanaAnioAnterior) * 100 : null

    // ── Personas atendidas por día, vs. promedio de las mismas 8 semanas ──
    const personasAcumPorDia = new Map<number, { suma: number; n: number }>()
    for (const v of ventaBaseData.response.results) {
      const dia = isoWeekday(v.DiaDeVenta)
      const acc = personasAcumPorDia.get(dia) ?? { suma: 0, n: 0 }
      acc.suma += v['# Personas'] || 0
      acc.n += 1
      personasAcumPorDia.set(dia, acc)
    }
    const promedioPersonasPorDia = new Map(
      [...personasAcumPorDia.entries()].map(([dia, acc]) => [dia, acc.n ? acc.suma / acc.n : null]),
    )

    const personasPorDia = ventaPorDia.map(d => {
      const v = ventaPorFecha.get(d.fecha)
      const personasDia = v?.['# Personas'] ?? 0
      const promedioHistorico = promedioPersonasPorDia.get(d.diaSemana) ?? null
      const diferenciaPct = promedioHistorico ? ((personasDia - promedioHistorico) / promedioHistorico) * 100 : null
      return { fecha: d.fecha, diaSemana: d.diaSemana, personas: personasDia, promedioHistorico, diferenciaPct }
    })

    const personas = [...ventaPorFecha.values()].reduce((s: number, v: any) => s + (v['# Personas'] || 0), 0)
    const ticketPromedio = personas ? ventaSemana / personas : null

    const diaDestacado = ventaPorDia
      .filter(d => d.diferenciaPct != null)
      .sort((a, b) => Math.abs(b.diferenciaPct) - Math.abs(a.diferenciaPct))[0] ?? null

    // ── Gasto de la semana por categoría, vs. promedio de las 8 semanas previas ──
    const inventarioSemana = inventarioSemanaCrudas.filter((f: any) => f['borrada?'] !== true)
    const inventarioBase = inventarioBaseCrudas.filter((f: any) => f['borrada?'] !== true)

    const gastoPorCategoria = new Map<string, number>()
    for (const f of inventarioSemana) {
      const cat = f['Categoría'] || 'Sin categoría'
      gastoPorCategoria.set(cat, (gastoPorCategoria.get(cat) ?? 0) + (f.MontoSinIVA || 0))
    }
    const gastoBasePorCategoria = new Map<string, number>()
    for (const f of inventarioBase) {
      const cat = f['Categoría'] || 'Sin categoría'
      gastoBasePorCategoria.set(cat, (gastoBasePorCategoria.get(cat) ?? 0) + (f.MontoSinIVA || 0))
    }

    const nombresCategorias = new Set([...gastoPorCategoria.keys(), ...gastoBasePorCategoria.keys()])
    const categorias = [...nombresCategorias].map(nombre => {
      const gastoSemana = gastoPorCategoria.get(nombre) ?? 0
      const promedioSemanal = (gastoBasePorCategoria.get(nombre) ?? 0) / 8
      const variacionPct = promedioSemanal ? ((gastoSemana - promedioSemanal) / promedioSemanal) * 100 : null
      const variacionMonto = gastoSemana - promedioSemanal
      return {
        nombre,
        tipo: tipoPorNombre.get(nombre) ?? null,
        gastoSemana,
        promedioSemanal,
        variacionPct,
        variacionMonto,
      }
    }).sort((a, b) => b.gastoSemana - a.gastoSemana)

    const mayoresVariaciones = [...categorias]
      .filter(c => c.variacionPct != null && c.promedioSemanal > 0)
      .sort((a, b) => Math.abs(b.variacionPct) - Math.abs(a.variacionPct))
      .slice(0, 4)

    const gastoTotalSemana = categorias.reduce((s, c) => s + c.gastoSemana, 0)

    // ── Pagos fuertes de la semana (facturas más grandes registradas) ──
    const pagosFuertes = [...inventarioSemana]
      .sort((a: any, b: any) => (b.MontoSinIVA || 0) - (a.MontoSinIVA || 0))
      .slice(0, 8)
      .map((f: any) => ({
        fecha: f.FechaDeIngreso,
        proveedor: f.Prooveedor || 'Sin proveedor',
        categoria: f['Categoría'] || 'Sin categoría',
        monto: f.MontoSinIVA,
        descripcion: f.Descripcion,
      }))

    // ── RH: altas y bajas de la semana ──────────────────────────────────
    const enRango = (fechaStr: string) => {
      if (!fechaStr) return false
      const t = new Date(fechaStr).getTime()
      return t >= inicioSemana.getTime() && t <= finSemana.getTime()
    }
    const altas = empleados
      .filter((e: any) => enRango(e.FechaIngreso))
      .map((e: any) => ({ nombre: e.Nombre || e.NombreCompleto || 'Sin nombre', fecha: e.FechaIngreso }))
    const bajas = empleados
      .filter((e: any) => e.EstatusEmpleado === 'Baja' && enRango(e['Modified Date']))
      .map((e: any) => ({ nombre: e.Nombre || e.NombreCompleto || 'Sin nombre', fecha: e['Modified Date'] }))

    return json({
      lunes: inicioSemana.toISOString(),
      domingo: finSemana.toISOString(),
      ventas: {
        ventaSemana,
        personas,
        ticketPromedio,
        promedioSemanalHistorico,
        ventaSemanaVsPromedioPct,
        ventaSemanaVsPromedioMonto,
        ventaMismaSemanaAnioAnterior,
        ventaYoyPct,
        ventaPorDia,
        diaDestacado,
        personasPorDia,
      },
      gastos: {
        gastoTotalSemana,
        categorias,
        mayoresVariaciones,
        pagosFuertes,
      },
      rh: { altas, bajas },
    })
  } catch (e) {
    return json({ error: e.message }, 502)
  }
})
