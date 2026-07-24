import { corsHeaders, json, bubbleEnv, bubbleGet, bubbleGetAll, conOrg, requireRole } from '../_shared/bubble.ts'

// Rolling forecast por proveedor dentro de una categoría:
// el límite de la categoría se reparte entre sus proveedores según el %
// que cada uno representó históricamente (últimos 6 meses completos) del
// gasto de esa categoría. Así se ve quién va excedido de SU parte del
// presupuesto, no solo el total de la categoría.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await requireRole(req, ['owner', 'admin'])
  if (!user) return json({ error: 'No autorizado' }, 401)

  const { categoria, anio, mes } = await req.json().catch(() => ({}))
  if (!categoria) return json({ error: 'Falta categoría' }, 400)

  const { bubbleUrl, bubbleToken } = bubbleEnv()

  try {
    const categoriasData = await bubbleGet(bubbleUrl, bubbleToken, 'Categorías', {
      constraints: JSON.stringify(conOrg()),
      limit: '100',
    })
    const cat = categoriasData.response.results.find((c: any) => c.CategoriaNombre === categoria)
    if (!cat) return json({ error: 'Categoría no encontrada' }, 404)

    const hoyReal = new Date()
    const anioSel = anio ?? hoyReal.getUTCFullYear()
    const mes0Sel = (mes ?? hoyReal.getUTCMonth() + 1) - 1

    const snapshotsData = await bubbleGet(bubbleUrl, bubbleToken, 'BudgetSnapshot', {
      constraints: JSON.stringify(conOrg(
        { key: 'Categoria', constraint_type: 'equals', value: cat._id },
      )),
      sort_field: 'MesDeReferencia',
      descending: 'true',
      limit: '50',
    })
    const limiteMes = snapshotsData.response.results.find((s: any) => {
      const d = new Date(s.MesDeReferencia)
      return d.getUTCFullYear() === anioSel && d.getUTCMonth() === mes0Sel
    })?.LimiteMes ?? null

    const inicioMesActual = new Date(Date.UTC(anioSel, mes0Sel, 1))
    const finMesActual = new Date(Date.UTC(anioSel, mes0Sel + 1, 0, 23, 59, 59))
    const inicioVentana = new Date(Date.UTC(anioSel, mes0Sel - 6, 1))

    // Dos consultas separadas (no una sola con todo el rango): así el mes en
    // curso siempre llega completo, sin importar qué tan grande sea el
    // histórico de 6 meses ni cuántas páginas tome traerlo.
    const [historicasCrudas, delMesCrudas] = await Promise.all([
      bubbleGetAll(bubbleUrl, bubbleToken, 'Inventario', conOrg(
        { key: 'Categoría', constraint_type: 'equals', value: categoria },
        { key: 'FechaDeIngreso', constraint_type: 'greater than', value: inicioVentana.toISOString() },
        { key: 'FechaDeIngreso', constraint_type: 'less than', value: inicioMesActual.toISOString() },
        { key: 'borrada?', constraint_type: 'equals', value: false },
      )),
      bubbleGetAll(bubbleUrl, bubbleToken, 'Inventario', conOrg(
        { key: 'Categoría', constraint_type: 'equals', value: categoria },
        { key: 'FechaDeIngreso', constraint_type: 'greater than', value: inicioMesActual.toISOString() },
        { key: 'FechaDeIngreso', constraint_type: 'less than', value: finMesActual.toISOString() },
        { key: 'borrada?', constraint_type: 'equals', value: false },
      )),
    ])
    const historicas = historicasCrudas.filter((f: any) => f['borrada?'] !== true)
    const delMes = delMesCrudas.filter((f: any) => f['borrada?'] !== true)

    const historicoPorProveedor = new Map<string, number>()
    let totalHistorico = 0
    for (const f of historicas) {
      const nombre = f.Prooveedor || 'Sin proveedor'
      historicoPorProveedor.set(nombre, (historicoPorProveedor.get(nombre) ?? 0) + (f.MontoSinIVA || 0))
      totalHistorico += f.MontoSinIVA || 0
    }

    const actualPorProveedor = new Map<string, { monto: number; facturas: number }>()
    for (const f of delMes) {
      const nombre = f.Prooveedor || 'Sin proveedor'
      const act = actualPorProveedor.get(nombre) ?? { monto: 0, facturas: 0 }
      act.monto += f.MontoSinIVA || 0
      act.facturas += 1
      actualPorProveedor.set(nombre, act)
    }

    // union de proveedores que aparecen en el histórico o en el mes actual
    const nombres = new Set([...historicoPorProveedor.keys(), ...actualPorProveedor.keys()])

    const proveedores = [...nombres].map(nombre => {
      const gastoHistorico6m = historicoPorProveedor.get(nombre) ?? 0
      const share = totalHistorico ? gastoHistorico6m / totalHistorico : null
      const impliedBudget = limiteMes != null && share != null ? limiteMes * share : null
      const gastoActual = actualPorProveedor.get(nombre)?.monto ?? 0
      return {
        nombre,
        gastoHistorico6m,
        share,
        impliedBudget,
        gastoActual,
        facturasActual: actualPorProveedor.get(nombre)?.facturas ?? 0,
        pct: impliedBudget ? gastoActual / impliedBudget : null,
      }
    }).sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1))

    return json({
      categoria,
      limiteMes,
      ventanaDesde: inicioVentana.toISOString(),
      proveedores,
    })
  } catch (e) {
    return json({ error: e.message }, 502)
  }
})
