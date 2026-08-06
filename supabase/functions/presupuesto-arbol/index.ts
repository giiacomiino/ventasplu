import { corsHeaders, json, bubbleEnv, bubbleGet, bubbleGetAllFast, conOrg, requireRole } from '../_shared/bubble.ts'

// Árbol completo Categoría → Proveedor → Facturas pagadas, en una sola
// respuesta. Antes cada click en una categoría o proveedor disparaba su
// propia consulta paginada a Bubble (lento y además duplicaba trabajo:
// el drill-down de proveedor volvía a traer el mismo rango de 6 meses
// que ya se había traído para la categoría). Aquí se trae todo una vez
// (2 consultas grandes en vez de N+M) y se arma el árbol en memoria, así
// que expandir cualquier nivel en el frontend es instantáneo.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await requireRole(req, ['owner', 'admin'])
  if (!user) return json({ error: 'No autorizado' }, 401)

  const { anio, mes } = await req.json().catch(() => ({}))
  const { bubbleUrl, bubbleToken } = bubbleEnv()

  try {
    const hoyReal = new Date()
    const anioSel = anio ?? hoyReal.getUTCFullYear()
    const mes0Sel = (mes ?? hoyReal.getUTCMonth() + 1) - 1

    const inicioMesSel = new Date(Date.UTC(anioSel, mes0Sel, 1))
    const finMesSel = new Date(Date.UTC(anioSel, mes0Sel + 1, 0, 23, 59, 59))
    const inicioVentana = new Date(Date.UTC(anioSel, mes0Sel - 6, 1))
    // mismo rango de 6 meses pero un año antes, para poder mostrar la
    // variación YoY de cada barra del gráfico de proveedor.
    const inicioVentanaAnyoAnt = new Date(Date.UTC(anioSel - 1, mes0Sel - 6, 1))
    const finVentanaAnyoAnt = new Date(Date.UTC(anioSel - 1, mes0Sel + 1, 0, 23, 59, 59))

    const [categoriasData, snapshotsData, historicasCrudas, delMesCrudas, anyoAnteriorCrudas] = await Promise.all([
      bubbleGet(bubbleUrl, bubbleToken, 'Categorías', { constraints: JSON.stringify(conOrg()), limit: '100' }),
      bubbleGet(bubbleUrl, bubbleToken, 'BudgetSnapshot', {
        constraints: JSON.stringify(conOrg()),
        sort_field: 'MesDeReferencia',
        descending: 'true',
        limit: '50',
      }),
      bubbleGetAllFast(bubbleUrl, bubbleToken, 'Inventario', conOrg(
        { key: 'FechaDeIngreso', constraint_type: 'greater than', value: inicioVentana.toISOString() },
        { key: 'FechaDeIngreso', constraint_type: 'less than', value: inicioMesSel.toISOString() },
        { key: 'borrada?', constraint_type: 'equals', value: false },
      )),
      bubbleGetAllFast(bubbleUrl, bubbleToken, 'Inventario', conOrg(
        { key: 'FechaDeIngreso', constraint_type: 'greater than', value: inicioMesSel.toISOString() },
        { key: 'FechaDeIngreso', constraint_type: 'less than', value: finMesSel.toISOString() },
        { key: 'borrada?', constraint_type: 'equals', value: false },
      )),
      bubbleGetAllFast(bubbleUrl, bubbleToken, 'Inventario', conOrg(
        { key: 'FechaDeIngreso', constraint_type: 'greater than', value: inicioVentanaAnyoAnt.toISOString() },
        { key: 'FechaDeIngreso', constraint_type: 'less than', value: finVentanaAnyoAnt.toISOString() },
        { key: 'borrada?', constraint_type: 'equals', value: false },
      )),
    ])

    const tipoPorNombre = new Map(
      categoriasData.response.results.map((c: any) => [c.CategoriaNombre, c.TipoDeCosto]),
    )
    const categoriaPorId = new Map(
      categoriasData.response.results.map((c: any) => [c._id, c.CategoriaNombre]),
    )

    const limitePorCategoria = new Map<string, number>()
    for (const s of snapshotsData.response.results) {
      const d = new Date(s.MesDeReferencia)
      if (d.getUTCFullYear() === anioSel && d.getUTCMonth() === mes0Sel) {
        const nombre = categoriaPorId.get(s.Categoria) ?? 'Sin categoría'
        limitePorCategoria.set(nombre, s.LimiteMes)
      }
    }

    const historicas = historicasCrudas.filter((f: any) => f['borrada?'] !== true)
    const delMes = delMesCrudas.filter((f: any) => f['borrada?'] !== true)
    const anyoAnterior = anyoAnteriorCrudas.filter((f: any) => f['borrada?'] !== true)

    const clave = (cat: string, prov: string) => `${cat}||${prov}`

    // Histórico (6 meses previos al mes seleccionado, sin incluirlo): usado
    // solo para repartir el presupuesto de la categoría entre proveedores
    // según su % de gasto histórico.
    const histTotalPorCategoria = new Map<string, number>()
    const histPorCategoriaProveedor = new Map<string, number>()
    // meses distintos (de esos 6) en los que el proveedor facturó algo —
    // de aquí sale su cadencia real, no solo el promedio.
    const mesesConFacturaPorCategoriaProveedor = new Map<string, Set<string>>()
    for (const f of historicas) {
      const cat = f['Categoría'] || 'Sin categoría'
      const prov = f.Prooveedor || 'Sin proveedor'
      histTotalPorCategoria.set(cat, (histTotalPorCategoria.get(cat) ?? 0) + (f.MontoSinIVA || 0))
      const key = clave(cat, prov)
      histPorCategoriaProveedor.set(key, (histPorCategoriaProveedor.get(key) ?? 0) + (f.MontoSinIVA || 0))
      const mesKey = (f.FechaDeIngreso as string).slice(0, 7)
      const meses = mesesConFacturaPorCategoriaProveedor.get(key) ?? new Set<string>()
      meses.add(mesKey)
      mesesConFacturaPorCategoriaProveedor.set(key, meses)
    }

    // Mes seleccionado: gasto real y facturas pagadas por proveedor.
    const gastoPorCategoria = new Map<string, number>()
    const gastoPorCategoriaProveedor = new Map<string, number>()
    const facturasPorCategoriaProveedor = new Map<string, any[]>()
    for (const f of delMes) {
      const cat = f['Categoría'] || 'Sin categoría'
      const prov = f.Prooveedor || 'Sin proveedor'
      const key = clave(cat, prov)
      gastoPorCategoria.set(cat, (gastoPorCategoria.get(cat) ?? 0) + (f.MontoSinIVA || 0))
      gastoPorCategoriaProveedor.set(key, (gastoPorCategoriaProveedor.get(key) ?? 0) + (f.MontoSinIVA || 0))
      if (f['Pagada?'] === true) {
        const lista = facturasPorCategoriaProveedor.get(key) ?? []
        lista.push({
          fecha: f.FechaDeIngreso,
          monto: f.MontoSinIVA,
          descripcion: f.Descripcion,
          remision: f.Remision,
          fechaPago: f.FechaDePago,
        })
        facturasPorCategoriaProveedor.set(key, lista)
      }
    }

    // Serie mensual por proveedor (últimos 6 meses incluyendo el mes
    // seleccionado): se arma de la unión histórico+mes-actual, que juntos
    // cubren exactamente esa ventana.
    const serieMensualPorCategoriaProveedor = new Map<string, Map<string, number>>()
    for (const f of [...historicas, ...delMes]) {
      const cat = f['Categoría'] || 'Sin categoría'
      const prov = f.Prooveedor || 'Sin proveedor'
      const key = clave(cat, prov)
      const mesKey = (f.FechaDeIngreso as string).slice(0, 7)
      const mapa = serieMensualPorCategoriaProveedor.get(key) ?? new Map<string, number>()
      mapa.set(mesKey, (mapa.get(mesKey) ?? 0) + (f.MontoSinIVA || 0))
      serieMensualPorCategoriaProveedor.set(key, mapa)
    }

    // Mismo cálculo pero un año antes, solo para poder comparar mes a mes
    // (YoY) en el gráfico de cada proveedor.
    const serieMensualAnyoAntPorCategoriaProveedor = new Map<string, Map<string, number>>()
    for (const f of anyoAnterior) {
      const cat = f['Categoría'] || 'Sin categoría'
      const prov = f.Prooveedor || 'Sin proveedor'
      const key = clave(cat, prov)
      const mesKey = (f.FechaDeIngreso as string).slice(0, 7)
      const mapa = serieMensualAnyoAntPorCategoriaProveedor.get(key) ?? new Map<string, number>()
      mapa.set(mesKey, (mapa.get(mesKey) ?? 0) + (f.MontoSinIVA || 0))
      serieMensualAnyoAntPorCategoriaProveedor.set(key, mapa)
    }

    const nombresCategorias = new Set([
      ...limitePorCategoria.keys(),
      ...histTotalPorCategoria.keys(),
      ...gastoPorCategoria.keys(),
    ])

    const categorias = [...nombresCategorias].map(nombre => {
      const limiteMes = limitePorCategoria.get(nombre) ?? null
      const gastoReal = gastoPorCategoria.get(nombre) ?? 0
      const totalHistorico = histTotalPorCategoria.get(nombre) ?? 0

      const nombresProveedores = new Set<string>()
      const prefijo = clave(nombre, '')
      for (const key of histPorCategoriaProveedor.keys()) if (key.startsWith(prefijo)) nombresProveedores.add(key.slice(prefijo.length))
      for (const key of gastoPorCategoriaProveedor.keys()) if (key.startsWith(prefijo)) nombresProveedores.add(key.slice(prefijo.length))

      const proveedores = [...nombresProveedores].map(prov => {
        const key = clave(nombre, prov)
        const gastoHistorico6m = histPorCategoriaProveedor.get(key) ?? 0
        const share = totalHistorico ? gastoHistorico6m / totalHistorico : null
        const impliedBudget = limiteMes != null && share != null ? limiteMes * share : null
        const gastoActual = gastoPorCategoriaProveedor.get(key) ?? 0

        const mapaMeses = serieMensualPorCategoriaProveedor.get(key) ?? new Map<string, number>()
        const mapaMesesAnyoAnt = serieMensualAnyoAntPorCategoriaProveedor.get(key) ?? new Map<string, number>()
        const serieMensual = []
        for (let i = 5; i >= 0; i--) {
          const d = new Date(Date.UTC(anioSel, mes0Sel - i, 1))
          const mesKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
          const dAnt = new Date(Date.UTC(anioSel - 1, mes0Sel - i, 1))
          const mesKeyAnt = `${dAnt.getUTCFullYear()}-${String(dAnt.getUTCMonth() + 1).padStart(2, '0')}`
          serieMensual.push({
            mes: mesKey,
            monto: mapaMeses.get(mesKey) ?? 0,
            montoAnterior: mapaMesesAnyoAnt.get(mesKeyAnt) ?? 0,
          })
        }

        // Cadencia real del proveedor: en cuántos de los últimos 6 meses
        // facturó algo. Un proveedor trimestral aparece en ~2 de 6 meses,
        // así que su cadencia es ~3 — comparamos su gasto de los últimos
        // 3 meses contra 3 meses de presupuesto implícito, no un mes
        // suelto contra un mes de presupuesto (que es lo que antes hacía
        // que se viera "excedido" el mes que factura y "vacío" los demás).
        const mesesConFactura = mesesConFacturaPorCategoriaProveedor.get(key)?.size ?? 0
        const cadenciaMeses = mesesConFactura > 0 ? Math.min(6, Math.max(1, Math.round(6 / mesesConFactura))) : null
        const gastoVentana = cadenciaMeses ? serieMensual.slice(-cadenciaMeses).reduce((s, m) => s + m.monto, 0) : gastoActual
        const impliedBudgetVentana = impliedBudget != null && cadenciaMeses ? impliedBudget * cadenciaMeses : impliedBudget

        const facturas = (facturasPorCategoriaProveedor.get(key) ?? [])
          .sort((a, b) => b.fecha.localeCompare(a.fecha))

        return {
          nombre: prov,
          gastoHistorico6m,
          share,
          impliedBudget,
          gastoActual,
          cadenciaMeses,
          gastoVentana,
          impliedBudgetVentana,
          serieMensual,
          facturas,
          pct: impliedBudgetVentana ? gastoVentana / impliedBudgetVentana : null,
        }
      }).sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1))

      return {
        nombre,
        tipo: tipoPorNombre.get(nombre) ?? null,
        limiteMes,
        gastoReal,
        porcentajeUtilizado: limiteMes ? gastoReal / limiteMes : null,
        proveedores,
      }
    }).sort((a, b) => (b.porcentajeUtilizado ?? 0) - (a.porcentajeUtilizado ?? 0))

    return json({ mes: inicioMesSel.toISOString(), categorias })
  } catch (e) {
    return json({ error: e.message }, 502)
  }
})
