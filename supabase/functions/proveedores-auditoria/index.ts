import { corsHeaders, json, bubbleEnv, bubbleGetAllFast, conOrg, requireRole } from '../_shared/bubble.ts'

// "Fonda La Trattoria" es un proveedor interno (transferencias entre la
// misma operación, no gasto real a terceros) — se excluye de todo el
// análisis para no ensuciar rankings, % de concentración y tendencias.
const PROVEEDOR_EXCLUIDO = 'fonda la trattoria'

// Auditoría de proveedores: ventana móvil de 12 meses terminando en el mes
// seleccionado, comparada contra los 12 meses previos a esa ventana para
// poder sacar variación YoY por proveedor (no solo el total).
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

    const finVentana = new Date(Date.UTC(anioSel, mes0Sel + 1, 0, 23, 59, 59))
    const inicioVentanaActual = new Date(Date.UTC(anioSel, mes0Sel - 11, 1))
    const inicioVentana24 = new Date(Date.UTC(anioSel, mes0Sel - 23, 1))

    const crudas = await bubbleGetAllFast(bubbleUrl, bubbleToken, 'Inventario', conOrg(
      { key: 'FechaDeIngreso', constraint_type: 'greater than', value: inicioVentana24.toISOString() },
      { key: 'FechaDeIngreso', constraint_type: 'less than', value: finVentana.toISOString() },
      { key: 'borrada?', constraint_type: 'equals', value: false },
    ))

    const facturas = crudas.filter((f: any) => {
      if (f['borrada?'] === true) return false
      const nombre = (f.Prooveedor || '').trim().toLowerCase()
      return nombre !== '' && nombre !== PROVEEDOR_EXCLUIDO
    })

    const actual = facturas.filter((f: any) => f.FechaDeIngreso >= inicioVentanaActual.toISOString())
    const anterior = facturas.filter((f: any) => f.FechaDeIngreso < inicioVentanaActual.toISOString())

    type Acc = {
      facturas: number
      monto: number
      categorias: Map<string, number>
      serieMensual: Map<string, number>
    }
    const porProveedor = new Map<string, Acc>()
    const montoAnteriorPorProveedor = new Map<string, number>()
    const categoriasDisponibles = new Set<string>()

    for (const f of actual) {
      const nombre = f.Prooveedor
      const monto = f.MontoSinIVA || 0
      const categoria = f['Categoría'] || 'Sin categoría'
      const mesKey = (f.FechaDeIngreso as string).slice(0, 7)
      categoriasDisponibles.add(categoria)

      const acc = porProveedor.get(nombre) ?? { facturas: 0, monto: 0, categorias: new Map(), serieMensual: new Map() }
      acc.facturas += 1
      acc.monto += monto
      acc.categorias.set(categoria, (acc.categorias.get(categoria) ?? 0) + monto)
      acc.serieMensual.set(mesKey, (acc.serieMensual.get(mesKey) ?? 0) + monto)
      porProveedor.set(nombre, acc)
    }

    for (const f of anterior) {
      const nombre = f.Prooveedor
      montoAnteriorPorProveedor.set(nombre, (montoAnteriorPorProveedor.get(nombre) ?? 0) + (f.MontoSinIVA || 0))
    }

    const totalGastado = [...porProveedor.values()].reduce((s, a) => s + a.monto, 0)
    const totalFacturas = actual.length

    // serie de 12 meses en orden cronológico, terminando en el mes seleccionado
    const mesesVentana: string[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(anioSel, mes0Sel - i, 1))
      mesesVentana.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
    }

    const proveedores = [...porProveedor.entries()].map(([nombre, acc]) => {
      const montoAnterior = montoAnteriorPorProveedor.get(nombre) ?? 0
      const yoyPct = montoAnterior ? ((acc.monto - montoAnterior) / montoAnterior) * 100 : null
      const categorias = [...acc.categorias.entries()]
        .map(([cat, monto]) => ({ nombre: cat, monto }))
        .sort((a, b) => b.monto - a.monto)
      const serieMensual = mesesVentana.map(mesKey => ({ mes: mesKey, monto: acc.serieMensual.get(mesKey) ?? 0 }))

      return {
        nombre,
        facturas: acc.facturas,
        monto: acc.monto,
        pctDelTotal: totalGastado ? acc.monto / totalGastado : null,
        montoAnterior,
        yoyPct,
        categorias,
        serieMensual,
      }
    }).sort((a, b) => b.monto - a.monto)

    const concentracionTop5 = totalGastado
      ? proveedores.slice(0, 5).reduce((s, p) => s + p.monto, 0) / totalGastado
      : null

    return json({
      ventana: { inicio: inicioVentanaActual.toISOString(), fin: finVentana.toISOString() },
      totalGastado,
      totalFacturas,
      totalProveedores: proveedores.length,
      concentracionTop5,
      categoriasDisponibles: [...categoriasDisponibles].sort(),
      proveedores,
    })
  } catch (e) {
    return json({ error: e.message }, 502)
  }
})
