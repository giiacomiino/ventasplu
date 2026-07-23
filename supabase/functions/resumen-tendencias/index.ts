import { corsHeaders, json, bubbleEnv, bubbleGet, bubbleGetAll, conOrg, requireProfile } from '../_shared/bubble.ts'

// Tendencias multi-mes. Usa BudgetSnapshot histórico tal cual (snapshots
// congelados por mes) — a diferencia del mes en curso, no se recalcula desde
// Inventario porque recorrer meses cerrados completos sería costoso y el
// propósito aquí es ver la trayectoria, no el centavo exacto de hoy.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await requireProfile(req)
  if (!user) return json({ error: 'No autorizado' }, 401)

  const { bubbleUrl, bubbleToken } = bubbleEnv()

  try {
    const categoriasData = await bubbleGet(bubbleUrl, bubbleToken, 'Categorías', {
      constraints: JSON.stringify(conOrg()),
      limit: '100',
    })
    const categoriaPorId = new Map(
      categoriasData.response.results.map((c: any) => [c._id, c.CategoriaNombre]),
    )

    const snapshots = await bubbleGetAll(bubbleUrl, bubbleToken, 'BudgetSnapshot', conOrg())

    const meses = [...new Set(snapshots.map((s: any) => s.MesDeReferencia))].sort()

    const mensual = meses.map(mes => {
      const filas = snapshots.filter((s: any) => s.MesDeReferencia === mes)
      const totalGastoReal = filas.reduce((s: number, f: any) => s + (f.GastoReal || 0), 0)
      const totalLimite = filas.reduce((s: number, f: any) => s + (f.LimiteMes || 0), 0)
      return { mes, totalGastoReal, totalLimite, pct: totalLimite ? totalGastoReal / totalLimite : null }
    })

    // Top 4 categorías (por límite del mes más reciente) con su serie histórica
    const ultimoMes = meses[meses.length - 1]
    const topCategoriaIds = snapshots
      .filter((s: any) => s.MesDeReferencia === ultimoMes)
      .sort((a: any, b: any) => (b.LimiteMes || 0) - (a.LimiteMes || 0))
      .slice(0, 4)
      .map((s: any) => s.Categoria)

    const porCategoria = topCategoriaIds.map((catId: string) => {
      const nombre = categoriaPorId.get(catId) ?? 'Sin categoría'
      const serie = meses.map(mes => {
        const fila = snapshots.find((s: any) => s.MesDeReferencia === mes && s.Categoria === catId)
        return { mes, pct: fila?.LimiteMes ? fila.GastoReal / fila.LimiteMes : null }
      })
      return { nombre, serie }
    })

    return json({ mensual, porCategoria })
  } catch (e) {
    return json({ error: e.message }, 502)
  }
})
