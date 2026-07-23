import { corsHeaders, json, bubbleEnv, bubbleGet, bubbleGetAll, conOrg, requireProfile } from '../_shared/bubble.ts'

function diaDelAnio(d: Date) {
  const inicio = Date.UTC(d.getUTCFullYear(), 0, 1)
  return Math.floor((d.getTime() - inicio) / (24 * 60 * 60 * 1000))
}

function sumaVentas(ventas: any[]) {
  return ventas.reduce(
    (acc, v) => {
      acc.ventaNeta += v.VentaNeta || 0
      acc.personas += v['# Personas'] || 0
      acc.iva += v.IVA || 0
      acc.cortesias += v['Cortesías'] || 0
      acc.n += 1
      return acc
    },
    { ventaNeta: 0, personas: 0, iva: 0, cortesias: 0, n: 0 },
  )
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await requireProfile(req)
  if (!user) return json({ error: 'No autorizado' }, 401)

  const { bubbleUrl, bubbleToken } = bubbleEnv()

  try {
    const ahora = new Date()
    const inicioMesActual = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1)).toISOString()

    const [categoriasData, snapshotsAll, ventasAll, facturasMesCrudas] = await Promise.all([
      bubbleGet(bubbleUrl, bubbleToken, 'Categorías', { constraints: JSON.stringify(conOrg()), limit: '100' }),
      bubbleGetAll(bubbleUrl, bubbleToken, 'BudgetSnapshot', conOrg()),
      bubbleGetAll(bubbleUrl, bubbleToken, 'Venta', conOrg()),
      bubbleGetAll(bubbleUrl, bubbleToken, 'Inventario', conOrg(
        { key: 'FechaDeIngreso', constraint_type: 'greater than', value: inicioMesActual },
        { key: 'borrada?', constraint_type: 'equals', value: false },
      )),
    ])

    const categoriaPorId = new Map(
      categoriasData.response.results.map((c: any) => [c._id, { nombre: c.CategoriaNombre, tipo: c.TipoDeCosto }]),
    )
    const tipoPorNombre = new Map(
      categoriasData.response.results.map((c: any) => [c.CategoriaNombre, c.TipoDeCosto]),
    )

    // ── YTD vs mismo periodo año anterior ─────────────────────────────
    const anioActual = ahora.getUTCFullYear()
    const diaCorte = diaDelAnio(ahora)

    const ventasYTD = ventasAll.filter((v: any) => {
      const d = new Date(v.DiaDeVenta)
      return d.getUTCFullYear() === anioActual && diaDelAnio(d) <= diaCorte
    })
    const ventasYTDAnterior = ventasAll.filter((v: any) => {
      const d = new Date(v.DiaDeVenta)
      return d.getUTCFullYear() === anioActual - 1 && diaDelAnio(d) <= diaCorte
    })

    const ytd = sumaVentas(ventasYTD)
    const ytdAnterior = sumaVentas(ventasYTDAnterior)

    const yoyPct = (actual: number, anterior: number) => (anterior ? ((actual - anterior) / anterior) * 100 : null)

    const kpis = {
      ventaNetaYTD: ytd.ventaNeta,
      ventaNetaYTDAnteriorPct: yoyPct(ytd.ventaNeta, ytdAnterior.ventaNeta),
      ventaPromedioYTD: ytd.n ? ytd.ventaNeta / ytd.n : null,
      ventaPromedioYTDAnteriorPct: yoyPct(ytd.n ? ytd.ventaNeta / ytd.n : 0, ytdAnterior.n ? ytdAnterior.ventaNeta / ytdAnterior.n : 0),
      personasYTD: ytd.personas,
      personasYTDAnteriorPct: yoyPct(ytd.personas, ytdAnterior.personas),
      ticketPromedioYTD: ytd.personas ? ytd.ventaNeta / ytd.personas : null,
      ivaYTD: ytd.iva,
      cortesiasYTD: ytd.cortesias,
    }

    // ── Márgenes del mes en curso (recalculado desde Inventario, sin borradas) ──
    const facturasMes = facturasMesCrudas.filter((f: any) => f['borrada?'] !== true)
    const gastoPorTipoMes = new Map<string, number>()
    for (const f of facturasMes) {
      const tipo = tipoPorNombre.get(f['Categoría']) ?? 'Sin tipo'
      gastoPorTipoMes.set(tipo, (gastoPorTipoMes.get(tipo) ?? 0) + (f.MontoSinIVA || 0))
    }
    const ventasMes = ventasAll.filter((v: any) => v.DiaDeVenta >= inicioMesActual)
    const ventaNetaMes = ventasMes.reduce((s: number, v: any) => s + (v.VentaNeta || 0), 0)

    const costoDirectoMes = gastoPorTipoMes.get('Costo Directo') ?? 0
    const gastosOperacionMes = gastoPorTipoMes.get('Gastos de Operacion') ?? 0
    const margenBrutoMes = ventaNetaMes - costoDirectoMes
    const margenOperacionMes = margenBrutoMes - gastosOperacionMes

    const margenes = {
      mes: inicioMesActual,
      ventaNetaMes,
      margenBrutoMes,
      margenBrutoPctMes: ventaNetaMes ? margenBrutoMes / ventaNetaMes : null,
      margenOperacionMes,
      margenOperacionPctMes: ventaNetaMes ? margenOperacionMes / ventaNetaMes : null,
    }

    // ── Márgenes YTD (desde snapshots congelados de BudgetSnapshot) ────
    const snapshotsYTD = snapshotsAll.filter((s: any) => new Date(s.MesDeReferencia).getUTCFullYear() === anioActual)
    const gastoPorTipoYTD = new Map<string, number>()
    for (const s of snapshotsYTD) {
      const tipo = categoriaPorId.get(s.Categoria)?.tipo ?? 'Sin tipo'
      gastoPorTipoYTD.set(tipo, (gastoPorTipoYTD.get(tipo) ?? 0) + (s.GastoReal || 0))
    }
    const costoDirectoYTD = gastoPorTipoYTD.get('Costo Directo') ?? 0
    const gastosOperacionYTD = gastoPorTipoYTD.get('Gastos de Operacion') ?? 0
    const margenBrutoYTD = ytd.ventaNeta - costoDirectoYTD
    const margenOperacionYTD = margenBrutoYTD - gastosOperacionYTD

    const margenesYTD = {
      margenBrutoYTD,
      margenBrutoPctYTD: ytd.ventaNeta ? margenBrutoYTD / ytd.ventaNeta : null,
      margenOperacionYTD,
      margenOperacionPctYTD: ytd.ventaNeta ? margenOperacionYTD / ytd.ventaNeta : null,
    }

    // ── Proyección del mes (VentaProyectada, calculada en Bubble) ──────
    const mesReciente = snapshotsAll.reduce((max: string, s: any) => (s.MesDeReferencia > max ? s.MesDeReferencia : max), '')
    const proyeccionVentaNeta = snapshotsAll.find((s: any) => s.MesDeReferencia === mesReciente)?.VentaProyectada ?? null

    // ── Categorías del mes en curso: monto y % de la venta del mes ─────
    const gastoPorCategoriaMes = new Map<string, number>()
    for (const f of facturasMes) {
      const cat = f['Categoría'] || 'Sin categoría'
      gastoPorCategoriaMes.set(cat, (gastoPorCategoriaMes.get(cat) ?? 0) + (f.MontoSinIVA || 0))
    }
    const categoriasMes = [...gastoPorCategoriaMes.entries()]
      .map(([nombre, monto]) => ({
        nombre,
        tipo: tipoPorNombre.get(nombre) ?? null,
        monto,
        pctVenta: ventaNetaMes ? monto / ventaNetaMes : null,
      }))
      .sort((a, b) => b.monto - a.monto)

    // ── Últimos 3 meses por categoría (BudgetSnapshot histórico) ───────
    const mesesDisponibles = [...new Set(snapshotsAll.map((s: any) => s.MesDeReferencia))].sort().slice(-3)
    const ventaPorMes = new Map<string, number>()
    for (const v of ventasAll) {
      const key = v.DiaDeVenta.slice(0, 7)
      ventaPorMes.set(key, (ventaPorMes.get(key) ?? 0) + (v.VentaNeta || 0))
    }
    const ultimosTresMeses = mesesDisponibles.map(mes => {
      const filas = snapshotsAll.filter((s: any) => s.MesDeReferencia === mes)
      const ventaDelMes = ventaPorMes.get((mes as string).slice(0, 7)) ?? 0
      const categorias = filas
        .map((s: any) => ({
          nombre: categoriaPorId.get(s.Categoria)?.nombre ?? 'Sin categoría',
          monto: s.GastoReal ?? 0,
          pctVenta: ventaDelMes ? (s.GastoReal ?? 0) / ventaDelMes : null,
        }))
        .sort((a, b) => b.monto - a.monto)
      return { mes, categorias }
    })

    return json({ kpis, margenes, margenesYTD, proyeccionVentaNeta, categoriasMes, ultimosTresMeses })
  } catch (e) {
    return json({ error: e.message }, 502)
  }
})
