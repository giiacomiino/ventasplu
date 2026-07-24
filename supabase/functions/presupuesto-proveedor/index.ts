import { corsHeaders, json, bubbleEnv, bubbleGetAll, conOrg, requireRole } from '../_shared/bubble.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await requireRole(req, ['owner', 'admin'])
  if (!user) return json({ error: 'No autorizado' }, 401)

  const { categoria, proveedor, anio, mes } = await req.json().catch(() => ({}))
  if (!categoria || !proveedor) return json({ error: 'Falta categoría o proveedor' }, 400)

  const { bubbleUrl, bubbleToken } = bubbleEnv()

  try {
    const hoyReal = new Date()
    const anioSel = anio ?? hoyReal.getUTCFullYear()
    const mes0Sel = (mes ?? hoyReal.getUTCMonth() + 1) - 1

    const inicioVentana = new Date(Date.UTC(anioSel, mes0Sel - 6, 1))
    const finVentana = new Date(Date.UTC(anioSel, mes0Sel + 1, 0, 23, 59, 59))

    const crudas = await bubbleGetAll(bubbleUrl, bubbleToken, 'Inventario', conOrg(
      { key: 'Categoría', constraint_type: 'equals', value: categoria },
      { key: 'Prooveedor', constraint_type: 'equals', value: proveedor },
      { key: 'FechaDeIngreso', constraint_type: 'greater than', value: inicioVentana.toISOString() },
      { key: 'FechaDeIngreso', constraint_type: 'less than', value: finVentana.toISOString() },
      { key: 'borrada?', constraint_type: 'equals', value: false },
    ))
    const facturas = crudas
      .filter((f: any) => f['borrada?'] !== true)
      .sort((a: any, b: any) => b.FechaDeIngreso.localeCompare(a.FechaDeIngreso))

    const porMes = new Map<string, number>()
    for (const f of facturas) {
      const key = f.FechaDeIngreso.slice(0, 7)
      porMes.set(key, (porMes.get(key) ?? 0) + (f.MontoSinIVA || 0))
    }

    const serieMensual = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(anioSel, mes0Sel - i, 1))
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
      serieMensual.push({ mes: key, monto: porMes.get(key) ?? 0 })
    }

    const inicioMesSel = new Date(Date.UTC(anioSel, mes0Sel, 1)).toISOString()
    const finMesSel = new Date(Date.UTC(anioSel, mes0Sel + 1, 0, 23, 59, 59)).toISOString()
    const facturasMesSel = facturas.filter((f: any) => f.FechaDeIngreso >= inicioMesSel && f.FechaDeIngreso <= finMesSel)

    return json({
      categoria,
      proveedor,
      serieMensual,
      facturas: facturasMesSel.map((f: any) => ({
        fecha: f.FechaDeIngreso,
        monto: f.MontoSinIVA,
        descripcion: f.Descripcion,
        remision: f.Remision,
        fechaPago: f.FechaDePago,
      })),
    })
  } catch (e) {
    return json({ error: e.message }, 502)
  }
})
