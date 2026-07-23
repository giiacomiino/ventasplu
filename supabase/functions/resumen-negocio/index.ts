import { corsHeaders, json, bubbleEnv, bubbleGet, bubbleGetAll, conOrg, requireProfile } from '../_shared/bubble.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await requireProfile(req)
  if (!user) return json({ error: 'No autorizado' }, 401)

  const { bubbleUrl, bubbleToken } = bubbleEnv()

  try {
    // ── Categorías + límite de presupuesto (LimiteMes viene del último
    //    BudgetSnapshot cerrado — la fórmula de límite vive en Bubble y no
    //    la replicamos aquí; solo GastoReal se recalcula en vivo abajo). ──
    const ahora = new Date()
    const inicioMesActual = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1)).toISOString()
    const hace30dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    // una sola ventana (la más amplia de las dos) para no pedirle a Bubble
    // el mismo rango de facturas dos veces
    const inicioVentana = inicioMesActual < hace30dias ? inicioMesActual : hace30dias

    const [categoriasData, snapshotsData, facturasCrudas] = await Promise.all([
      bubbleGet(bubbleUrl, bubbleToken, 'Categorías', {
        constraints: JSON.stringify(conOrg()),
        limit: '100',
      }),
      bubbleGet(bubbleUrl, bubbleToken, 'BudgetSnapshot', {
        constraints: JSON.stringify(conOrg()),
        sort_field: 'MesDeReferencia',
        descending: 'true',
        limit: '50',
      }),
      bubbleGetAll(bubbleUrl, bubbleToken, 'Inventario', conOrg(
        { key: 'FechaDeIngreso', constraint_type: 'greater than', value: inicioVentana },
        { key: 'borrada?', constraint_type: 'equals', value: false },
      )),
    ])

    const categoriaPorId = new Map(
      categoriasData.response.results.map((c: any) => [c._id, { nombre: c.CategoriaNombre, tipo: c.TipoDeCosto }]),
    )

    const snapshots = snapshotsData.response.results
    const mesReciente = snapshots[0]?.MesDeReferencia
    const limitesDelMes = snapshots
      .filter((s: any) => s.MesDeReferencia === mesReciente)
      .map((s: any) => ({
        nombre: categoriaPorId.get(s.Categoria)?.nombre ?? 'Sin categoría',
        tipo: categoriaPorId.get(s.Categoria)?.tipo ?? null,
        limiteMes: s.LimiteMes,
      }))

    // no confiamos en BudgetSnapshot.GastoReal: es un snapshot congelado
    // y puede incluir facturas que después se marcaron como borradas
    const facturasVentana = facturasCrudas.filter((f: any) => f['borrada?'] !== true)
    const facturasMes = facturasVentana.filter((f: any) => f.FechaDeIngreso >= inicioMesActual)
    const facturas30 = facturasVentana.filter((f: any) => f.FechaDeIngreso >= hace30dias)

    const gastoRealPorCategoria = new Map<string, number>()
    for (const f of facturasMes) {
      const cat = f['Categoría'] || 'Sin categoría'
      gastoRealPorCategoria.set(cat, (gastoRealPorCategoria.get(cat) ?? 0) + (f.MontoSinIVA || 0))
    }

    const diasTranscurridos = ahora.getUTCDate()
    const diasDelMes = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() + 1, 0)).getUTCDate()
    const ritmoIdeal = diasTranscurridos / diasDelMes

    const categorias = limitesDelMes.map((c: any) => {
      const gastoReal = gastoRealPorCategoria.get(c.nombre) ?? 0
      const porcentajeUtilizado = c.limiteMes ? gastoReal / c.limiteMes : null
      // a este ritmo diario promedio, ¿qué día del mes se agotaría el límite?
      const diaAgotamientoProyectado = gastoReal > 0 && c.limiteMes
        ? Math.round(diasTranscurridos * (c.limiteMes / gastoReal))
        : null
      return {
        ...c,
        gastoReal,
        porcentajeUtilizado,
        vaAdelantado: porcentajeUtilizado != null ? porcentajeUtilizado > ritmoIdeal : null,
        diaAgotamientoProyectado,
      }
    }).sort((a: any, b: any) => (b.porcentajeUtilizado ?? 0) - (a.porcentajeUtilizado ?? 0))

    const totalGastoReal = categorias.reduce((s: number, c: any) => s + (c.gastoReal || 0), 0)
    const totalLimite = categorias.reduce((s: number, c: any) => s + (c.limiteMes || 0), 0)

    const porProveedor = new Map<string, { totalGastado: number; facturas: number }>()
    for (const f of facturas30) {
      const nombre = f.Prooveedor || 'Sin proveedor'
      const actual = porProveedor.get(nombre) ?? { totalGastado: 0, facturas: 0 }
      actual.totalGastado += f.MontoSinIVA || 0
      actual.facturas += 1
      porProveedor.set(nombre, actual)
    }
    const topProveedores = [...porProveedor.entries()]
      .map(([nombre, v]) => ({ nombre, ...v }))
      .sort((a, b) => b.totalGastado - a.totalGastado)
      .slice(0, 8)

    const totalGastado30 = [...porProveedor.values()].reduce((s, v) => s + v.totalGastado, 0)
    const concentracionTop3 = totalGastado30
      ? topProveedores.slice(0, 3).reduce((s, p) => s + p.totalGastado, 0) / totalGastado30
      : null

    return json({
      presupuesto: { mes: inicioMesActual, categorias, totalGastoReal, totalLimite, diasTranscurridos, diasDelMes, ritmoIdeal },
      proveedores: {
        desde: hace30dias,
        top: topProveedores,
        totalFacturas: facturas30.length,
        totalGastado: totalGastado30,
        concentracionTop3,
      },
    })
  } catch (e) {
    return json({ error: e.message }, 502)
  }
})
