import { corsHeaders, json, bubbleEnv, bubbleGet, bubbleGetAllFast, conOrg, requireRole } from '../_shared/bubble.ts'

// Proyección de cierre de gasto, por categoría → proveedor.
//
// Método: para cada proveedor, con el histórico de los últimos 6 meses
// (excluyendo el mes seleccionado) se calcula cuántas facturas suele
// mandar por mes y de qué monto promedio. Contra eso se compara cuántas
// facturas ya nos ha mandado este mes: las que falten (esperadas - ya
// registradas) se proyectan usando el ticket promedio. Así, categorías
// con facturación recurrente (insumos, servicios) obtienen una
// proyección basada en cuántas facturas típicamente faltan por llegar,
// no solo en un ritmo lineal de gasto.
//
// La proyección de venta neta de cierre NO vive aquí — ya la calcula
// resumen-ventas (mtd.proyeccionCierreMes) y el frontend la combina con
// esto para armar el P&L proyectado completo.
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
    const esMesActual = anioSel === hoyReal.getUTCFullYear() && mes0Sel === hoyReal.getUTCMonth()

    const inicioMesSel = new Date(Date.UTC(anioSel, mes0Sel, 1))
    const finMesSel = new Date(Date.UTC(anioSel, mes0Sel + 1, 0, 23, 59, 59))
    const inicioVentana = new Date(Date.UTC(anioSel, mes0Sel - 6, 1))
    const diasDelMes = new Date(Date.UTC(anioSel, mes0Sel + 1, 0)).getUTCDate()
    const diasTranscurridos = esMesActual ? hoyReal.getUTCDate() : diasDelMes

    const [categoriasData, snapshotsData, historicasCrudas, delMesCrudas, pendientesCrudas] = await Promise.all([
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
        { key: 'Pagada?', constraint_type: 'equals', value: false },
        { key: 'FechaDePago', constraint_type: 'less than', value: finMesSel.toISOString() },
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
    const pendientes = pendientesCrudas.filter((f: any) => f['borrada?'] !== true && f['Pagada?'] !== true)

    const clave = (cat: string, prov: string) => `${cat}||${prov}`

    // Histórico: conteo y monto por proveedor, para sacar facturas/mes
    // esperadas y ticket promedio.
    const histPorCategoriaProveedor = new Map<string, { count: number; monto: number }>()
    for (const f of historicas) {
      const cat = f['Categoría'] || 'Sin categoría'
      const prov = f.Prooveedor || 'Sin proveedor'
      const key = clave(cat, prov)
      const acc = histPorCategoriaProveedor.get(key) ?? { count: 0, monto: 0 }
      acc.count += 1
      acc.monto += f.MontoSinIVA || 0
      histPorCategoriaProveedor.set(key, acc)
    }

    // Mes seleccionado: lo que ya nos han facturado (independiente de si
    // ya se pagó o no — esto es para proyectar el gasto devengado, no el
    // flujo de caja).
    const registradoPorCategoriaProveedor = new Map<string, { count: number; monto: number }>()
    for (const f of delMes) {
      const cat = f['Categoría'] || 'Sin categoría'
      const prov = f.Prooveedor || 'Sin proveedor'
      const key = clave(cat, prov)
      const acc = registradoPorCategoriaProveedor.get(key) ?? { count: 0, monto: 0 }
      acc.count += 1
      acc.monto += f.MontoSinIVA || 0
      registradoPorCategoriaProveedor.set(key, acc)
    }

    const nombresCategorias = new Set([
      ...limitePorCategoria.keys(),
      ...[...histPorCategoriaProveedor.keys()].map(k => k.split('||')[0]),
      ...[...registradoPorCategoriaProveedor.keys()].map(k => k.split('||')[0]),
    ])

    const categorias = [...nombresCategorias].map(nombre => {
      const limiteMes = limitePorCategoria.get(nombre) ?? null

      const nombresProveedores = new Set<string>()
      const prefijo = clave(nombre, '')
      for (const key of histPorCategoriaProveedor.keys()) if (key.startsWith(prefijo)) nombresProveedores.add(key.slice(prefijo.length))
      for (const key of registradoPorCategoriaProveedor.keys()) if (key.startsWith(prefijo)) nombresProveedores.add(key.slice(prefijo.length))

      const proveedores = [...nombresProveedores].map(prov => {
        const key = clave(nombre, prov)
        const hist = histPorCategoriaProveedor.get(key) ?? { count: 0, monto: 0 }
        const registrado = registradoPorCategoriaProveedor.get(key) ?? { count: 0, monto: 0 }

        const facturasEsperadas6m = hist.count / 6
        const montoPromedioFactura = hist.count ? hist.monto / hist.count : 0
        // si ya cerró el mes, no proyectamos facturas adicionales: lo
        // registrado es lo que hubo.
        const facturasFaltantes = esMesActual
          ? Math.max(Math.round(facturasEsperadas6m) - registrado.count, 0)
          : 0
        const gastoAdicionalProyectado = facturasFaltantes * montoPromedioFactura
        const gastoProyectado = registrado.monto + gastoAdicionalProyectado

        return {
          nombre: prov,
          facturasRegistradas: registrado.count,
          montoRegistrado: registrado.monto,
          facturasEsperadas6m,
          montoPromedioFactura,
          facturasFaltantes,
          gastoAdicionalProyectado,
          gastoProyectado,
        }
      }).sort((a, b) => b.gastoProyectado - a.gastoProyectado)

      const gastoRegistrado = proveedores.reduce((s, p) => s + p.montoRegistrado, 0)
      const gastoProyectado = proveedores.reduce((s, p) => s + p.gastoProyectado, 0)

      return {
        nombre,
        tipo: tipoPorNombre.get(nombre) ?? null,
        limiteMes,
        gastoRegistrado,
        gastoProyectado,
        pctProyectado: limiteMes ? gastoProyectado / limiteMes : null,
        varianzaProyectada: limiteMes != null ? gastoProyectado - limiteMes : null,
        proveedores,
      }
    }).sort((a, b) => (b.pctProyectado ?? -1) - (a.pctProyectado ?? -1))

    const sumaPorTipo = (tipo: string) => categorias.filter(c => c.tipo === tipo).reduce(
      (acc, c) => ({ proyectado: acc.proyectado + c.gastoProyectado, limite: acc.limite + (c.limiteMes || 0) }),
      { proyectado: 0, limite: 0 },
    )
    const costoDirecto = sumaPorTipo('Costo Directo')
    const gastosOperacion = sumaPorTipo('Gastos de Operacion')

    // ── Flujo de pagos pendientes hasta el fin del mes seleccionado ────
    const porProveedorPendiente = new Map<string, { monto: number; facturas: number }>()
    let totalPendienteHastaCierre = 0
    for (const f of pendientes) {
      const monto = f.MontoSinIVA || 0
      totalPendienteHastaCierre += monto
      const nombre = f.Prooveedor || 'Sin proveedor'
      const acc = porProveedorPendiente.get(nombre) ?? { monto: 0, facturas: 0 }
      acc.monto += monto
      acc.facturas += 1
      porProveedorPendiente.set(nombre, acc)
    }
    const pagosPorProveedor = [...porProveedorPendiente.entries()]
      .map(([nombre, v]) => ({ nombre, ...v }))
      .sort((a, b) => b.monto - a.monto)

    return json({
      mes: inicioMesSel.toISOString(),
      esMesActual,
      diasTranscurridos,
      diasDelMes,
      categorias,
      totales: {
        costoDirectoProyectado: costoDirecto.proyectado,
        costoDirectoLimite: costoDirecto.limite,
        gastosOperacionProyectado: gastosOperacion.proyectado,
        gastosOperacionLimite: gastosOperacion.limite,
        gastoTotalProyectado: costoDirecto.proyectado + gastosOperacion.proyectado,
        gastoTotalLimite: costoDirecto.limite + gastosOperacion.limite,
      },
      pagosPendientes: {
        hastaFinDeMes: totalPendienteHastaCierre,
        facturas: pendientes.length,
        porProveedor: pagosPorProveedor,
      },
    })
  } catch (e) {
    return json({ error: e.message }, 502)
  }
})
