import { corsHeaders, json, bubbleEnv, bubbleGetAll, conOrg, requireRole } from '../_shared/bubble.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await requireRole(req, ['owner', 'admin'])
  if (!user) return json({ error: 'No autorizado' }, 401)

  const { bubbleUrl, bubbleToken } = bubbleEnv()

  try {
    const pendientesCrudas = await bubbleGetAll(bubbleUrl, bubbleToken, 'Inventario', conOrg(
      { key: 'Pagada?', constraint_type: 'equals', value: false },
      { key: 'borrada?', constraint_type: 'equals', value: false },
    ))
    const pendientes = pendientesCrudas.filter((f: any) => f['borrada?'] !== true && f['Pagada?'] !== true)

    const hoy = new Date()
    const en7dias = new Date(hoy.getTime() + 7 * 24 * 60 * 60 * 1000)

    let totalPendiente = 0
    let totalVencido = 0
    let facturasVencidas = 0
    let totalProximos7 = 0
    let facturasProximos7 = 0

    const porProveedor = new Map<string, { monto: number; facturas: number; masVencida: string | null }>()

    for (const f of pendientes) {
      const monto = f.MontoSinIVA || 0
      totalPendiente += monto

      const fechaPago = f.FechaDePago ? new Date(f.FechaDePago) : null
      const vencida = fechaPago ? fechaPago < hoy : false
      if (vencida) {
        totalVencido += monto
        facturasVencidas += 1
      } else if (fechaPago && fechaPago <= en7dias) {
        totalProximos7 += monto
        facturasProximos7 += 1
      }

      const nombre = f.Prooveedor || 'Sin proveedor'
      const actual = porProveedor.get(nombre) ?? { monto: 0, facturas: 0, masVencida: null }
      actual.monto += monto
      actual.facturas += 1
      if (fechaPago && (!actual.masVencida || fechaPago < new Date(actual.masVencida))) {
        actual.masVencida = f.FechaDePago
      }
      porProveedor.set(nombre, actual)
    }

    const porProveedorArr = [...porProveedor.entries()]
      .map(([nombre, v]) => ({ nombre, ...v }))
      .sort((a, b) => b.monto - a.monto)
      .slice(0, 8)

    return json({
      totalPendiente,
      totalFacturas: pendientes.length,
      totalVencido,
      facturasVencidas,
      totalProximos7,
      facturasProximos7,
      porProveedor: porProveedorArr,
    })
  } catch (e) {
    return json({ error: e.message }, 502)
  }
})
