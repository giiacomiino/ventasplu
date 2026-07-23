import { Link } from 'react-router-dom'
import { ArrowLeft, AlertTriangle } from 'lucide-react'
import { useHistorial } from '../../hooks/useHistorial'
import { useProductos } from '../../hooks/useProductos'
import { formatMoney } from '../../utils/formatters'
import { GOLD_RAMP } from './shared'
import { Card, SectionHeader, PageHeader, DeltaPill, LoadingState, EmptyState } from './ui'

function flattenProductos(tree) {
  const out = []
  for (const cat of Object.values(tree)) {
    for (const sub of Object.values(cat)) {
      for (const p of Object.values(sub.productos)) out.push(p)
    }
  }
  return out
}

function BarraTop({ p, i, max }) {
  const width = (p.actual / max) * 100
  return (
    <div className="py-3 border-b border-gray-50 last:border-0">
      <div className="flex justify-between items-baseline text-sm mb-1.5">
        <span className="font-semibold text-gray-800">{i + 1}. {p.nombre}</span>
        <span className="font-bold text-gray-800 tabular-nums">{formatMoney(p.actual)}</span>
      </div>
      <div className="h-2 bg-gray-50 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${width}%`, background: GOLD_RAMP[i % GOLD_RAMP.length] }} />
      </div>
    </div>
  )
}

function FilaMovimiento({ p }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0 text-sm">
      <span className="text-gray-700 font-medium truncate">{p.nombre}</span>
      <DeltaPill pct={p.momPct} />
    </div>
  )
}

export default function BIVentasPlu() {
  const { data, loading: loadingHist } = useHistorial(6)
  const { productos: catalogo, loading: loadingCat } = useProductos()

  const loading = loadingHist || loadingCat

  let topVentas = [], ganadores = [], perdedores = [], sinVenta = []

  if (data) {
    const currentYm = data.months.at(-1)
    const prevYm = data.months.at(-2)
    const flat = flattenProductos(data.tree).map(p => {
      const actual = p.monthly[currentYm]?.monto ?? 0
      const anterior = p.monthly[prevYm]?.monto ?? 0
      const momPct = anterior > 0 ? ((actual - anterior) / anterior) * 100 : null
      return { ...p, actual, anterior, momPct }
    })

    topVentas = [...flat].sort((a, b) => b.actual - a.actual).slice(0, 8)

    const conMom = flat.filter(p => p.momPct != null)
    ganadores = [...conMom].sort((a, b) => b.momPct - a.momPct).slice(0, 5)
    perdedores = [...conMom].sort((a, b) => a.momPct - b.momPct).slice(0, 5)

    const idsConVenta = new Set(flat.filter(p => p.actual > 0).map(p => p.id))
    sinVenta = (catalogo ?? []).filter(p => !idsConVenta.has(p.id))
  }

  return (
    <div className="w-full px-8 py-8 max-w-[1600px] mx-auto space-y-8">
      <div>
        <Link to="/business-intelligence" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-700 mb-3 transition-colors">
          <ArrowLeft size={15} /> Business Intelligence
        </Link>
        <PageHeader title="Ventas por PLU — Inteligencia" sub="Ranking de productos y movimientos del mes en curso" />
      </div>

      {loading && <LoadingState>Cargando...</LoadingState>}

      {!loading && data && (
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2">
            <Card>
              <SectionHeader title="Top productos del mes" sub="Por monto vendido, mes en curso" />
              <div>
                {topVentas.map((p, i) => <BarraTop key={p.id} p={p} i={i} max={topVentas[0]?.actual || 1} />)}
              </div>
            </Card>
          </div>

          <Card>
            <SectionHeader
              title={
                <span className="flex items-center gap-2">
                  <AlertTriangle size={16} className="text-gray-400" /> Sin venta este mes
                </span>
              }
              sub="Productos activos sin ningún registro"
            />
            {sinVenta.length === 0 ? (
              <EmptyState>Todos los productos activos tuvieron venta</EmptyState>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {sinVenta.map(p => (
                  <p key={p.id} className="text-sm text-gray-600 truncate">{p.nombre}</p>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <SectionHeader title="Subiendo más" sub="MoM% vs. mes anterior" />
            <div>
              {ganadores.length === 0
                ? <EmptyState>Sin datos suficientes</EmptyState>
                : ganadores.map(p => <FilaMovimiento key={p.id} p={p} />)}
            </div>
          </Card>

          <Card>
            <SectionHeader title="Bajando más" sub="MoM% vs. mes anterior" />
            <div>
              {perdedores.length === 0
                ? <EmptyState>Sin datos suficientes</EmptyState>
                : perdedores.map(p => <FilaMovimiento key={p.id} p={p} />)}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
