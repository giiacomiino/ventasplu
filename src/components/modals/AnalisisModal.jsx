import { useState } from 'react'
import Modal from '../ui/Modal'
import { useHistorial } from '../../hooks/useHistorial'
import { formatMoney, formatUnits } from '../../utils/formatters'
import { ChevronRight, ArrowLeft, TrendingUp, TrendingDown } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function momPct(curr, prev) {
  if (!prev || prev === 0) return null
  return Math.round(((curr - prev) / prev) * 1000) / 10
}

function MomBadge({ pct }) {
  if (pct == null) return <span className="text-gray-300 text-xs">--</span>
  const pos   = pct >= 0
  const color = pos ? 'text-green-600 bg-green-50' : 'text-red-500 bg-red-50'
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-bold ${color}`}>
      {pos ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {pos ? '+' : ''}{pct.toFixed(1)}%
    </span>
  )
}

function getVal(monthly, ym, vista) {
  return monthly[ym]?.[vista === '$$$' ? 'monto' : 'unidades'] || 0
}

function fmt(val, vista) {
  if (!val) return null
  return vista === '$$$' ? formatMoney(val) : formatUnits(val)
}

function monthLabel(ym) {
  const [y, m] = ym.split('-')
  return format(new Date(Number(y), Number(m) - 1, 1), 'MMM-yy', { locale: es })
}

function StatBox({ label, value }) {
  return (
    <div>
      <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">{label}</p>
      <p className="text-base font-bold text-gray-800 mt-0.5 tabular-nums">{value ?? '—'}</p>
    </div>
  )
}

// ─── Bar chart ────────────────────────────────────────────────────────────────

function BarChart({ monthly, months, vista }) {
  const values = months.map(ym => getVal(monthly, ym, vista))
  const max    = Math.max(...values, 1)
  const barW   = 30
  const gap    = 6
  const h      = 90
  const totalW = months.length * (barW + gap) - gap

  return (
    <svg width="100%" viewBox={`-2 0 ${totalW + 4} ${h + 30}`} preserveAspectRatio="none" className="w-full">
      {months.map((ym, i) => {
        const val  = values[i]
        const barH = Math.max(Math.round((val / max) * h), val > 0 ? 2 : 0)
        const x    = i * (barW + gap)
        const isLast = i === months.length - 1
        const label  = format(
          new Date(Number(ym.split('-')[0]), Number(ym.split('-')[1]) - 1, 1),
          'MMM', { locale: es }
        )
        const shortVal = val
          ? vista === '$$$'
            ? val >= 100000 ? `$${(val/1000).toFixed(0)}k` : `$${(val/1000).toFixed(1)}k`
            : val >= 1000 ? `${(val/1000).toFixed(1)}k` : String(val)
          : ''

        return (
          <g key={ym}>
            <rect
              x={x} y={h - barH} width={barW} height={barH} rx={3}
              fill={isLast ? '#7a6020' : '#d4b896'}
            />
            {val > 0 && (
              <text x={x + barW / 2} y={h - barH - 5} textAnchor="middle" fill="#6b7280" fontSize={9}>
                {shortVal}
              </text>
            )}
            <text x={x + barW / 2} y={h + 15} textAnchor="middle" fill="#9ca3af" fontSize={10}>
              {label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ─── Overview: tabla de subcategorías ────────────────────────────────────────

function VistaOverview({ tree, months, vista, categoria, onDrill }) {
  const subcats = Object.entries(tree[categoria] || {})
    .sort((a, b) => {
      const at = months.reduce((s, ym) => s + getVal(a[1].monthly, ym, '$$$'), 0)
      const bt = months.reduce((s, ym) => s + getVal(b[1].monthly, ym, '$$$'), 0)
      return bt - at
    })

  if (subcats.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-300 text-sm">
        Sin datos para {categoria}
      </div>
    )
  }

  return (
    <div className="overflow-auto flex-1">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-white border-b shadow-sm z-10">
          <tr>
            <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs sticky left-0 bg-white z-20 min-w-[180px]">
              Subcategoría
            </th>
            {months.map(ym => (
              <th key={ym} className="text-right px-3 py-3 font-semibold text-gray-500 text-xs whitespace-nowrap">
                {monthLabel(ym)}
              </th>
            ))}
            <th className="text-right px-3 py-3 font-semibold text-gray-500 text-xs">Total</th>
            <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs">MoM%</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {subcats.map(([subcat, node]) => {
            const total = months.reduce((s, ym) => s + getVal(node.monthly, ym, vista), 0)
            const lastM = getVal(node.monthly, months.at(-1), vista)
            const prevM = getVal(node.monthly, months.at(-2), vista)
            const mom   = momPct(lastM, prevM)

            return (
              <tr key={subcat}
                onClick={() => onDrill(subcat)}
                className="cursor-pointer hover:bg-gold-50 border-b border-gray-100 transition-colors select-none group"
              >
                <td className="px-4 py-3 font-bold text-gold-700 sticky left-0 bg-white group-hover:bg-gold-50 z-[1] transition-colors">
                  {subcat}
                </td>
                {months.map(ym => {
                  const val = getVal(node.monthly, ym, vista)
                  return (
                    <td key={ym} className="px-3 py-3 text-right font-medium text-gray-700 text-xs tabular-nums whitespace-nowrap">
                      {val ? fmt(val, vista) : <span className="text-gray-200">—</span>}
                    </td>
                  )
                })}
                <td className="px-3 py-3 text-right font-bold text-gray-800 text-xs tabular-nums whitespace-nowrap">
                  {fmt(total, vista) || '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <MomBadge pct={mom} />
                </td>
                <td className="pr-3 py-3 text-right text-gray-300 group-hover:text-gold-500 transition-colors">
                  <ChevronRight size={14} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Subcategoría: chart + tabla de productos ─────────────────────────────────

function VistaSubcat({ subcat, node, months, vista, onBack, onDrillProduct }) {
  const sortedProds = Object.values(node.productos).sort((a, b) => {
    const at = months.reduce((s, ym) => s + getVal(a.monthly, ym, '$$$'), 0)
    const bt = months.reduce((s, ym) => s + getVal(b.monthly, ym, '$$$'), 0)
    return bt - at
  })

  const total   = months.reduce((s, ym) => s + getVal(node.monthly, ym, vista), 0)
  const lastVal = getVal(node.monthly, months.at(-1), vista)
  const allVals = months.map(ym => getVal(node.monthly, ym, vista))
  const bestVal = Math.max(...allVals)

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Chart panel */}
      <div className="px-6 pt-5 pb-4 border-b bg-gray-50/60 flex-shrink-0">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-gold-700 hover:text-gold-900 mb-4 font-semibold transition-colors"
        >
          <ArrowLeft size={12} /> Volver al resumen
        </button>
        <div className="flex items-start gap-8">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-3">Tendencia mensual</p>
            <BarChart monthly={node.monthly} months={months} vista={vista} />
          </div>
          <div className="flex-shrink-0 grid grid-cols-2 gap-x-8 gap-y-4 pt-1">
            <StatBox label="Total período" value={fmt(total, vista)} />
            <StatBox label="Último mes"    value={fmt(lastVal, vista)} />
            <StatBox label="Mejor mes"     value={fmt(bestVal, vista)} />
            <StatBox label="Productos"     value={sortedProds.length} />
          </div>
        </div>
      </div>

      {/* Products table */}
      <div className="overflow-auto flex-1">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white border-b shadow-sm z-10">
            <tr>
              <th className="text-left px-4 py-2.5 font-semibold text-gray-500 text-xs sticky left-0 bg-white z-20 min-w-[180px]">
                Producto
              </th>
              {months.map(ym => (
                <th key={ym} className="text-right px-3 py-2.5 font-semibold text-gray-500 text-xs whitespace-nowrap">
                  {monthLabel(ym)}
                </th>
              ))}
              <th className="text-right px-3 py-2.5 font-semibold text-gray-500 text-xs">Total</th>
              <th className="text-right px-4 py-2.5 font-semibold text-gray-500 text-xs">MoM%</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {sortedProds.map(prod => {
              const pTotal = months.reduce((s, ym) => s + getVal(prod.monthly, ym, vista), 0)
              const pLast  = getVal(prod.monthly, months.at(-1), vista)
              const pPrev  = getVal(prod.monthly, months.at(-2), vista)
              const pMom   = momPct(pLast, pPrev)

              return (
                <tr key={prod.id}
                  onClick={() => onDrillProduct(prod.id)}
                  className="cursor-pointer hover:bg-blue-50/40 border-b border-gray-50 transition-colors select-none group"
                >
                  <td className="px-4 py-2.5 text-gray-700 font-medium text-sm sticky left-0 bg-white group-hover:bg-blue-50/40 z-[1] transition-colors">
                    {prod.nombre}
                  </td>
                  {months.map(ym => {
                    const val = getVal(prod.monthly, ym, vista)
                    return (
                      <td key={ym} className="px-3 py-2.5 text-right text-gray-500 text-xs tabular-nums whitespace-nowrap">
                        {val ? fmt(val, vista) : <span className="text-gray-100">—</span>}
                      </td>
                    )
                  })}
                  <td className="px-3 py-2.5 text-right font-bold text-gray-800 text-xs tabular-nums whitespace-nowrap">
                    {fmt(pTotal, vista) || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <MomBadge pct={pMom} />
                  </td>
                  <td className="pr-3 py-2.5 text-right text-gray-200 group-hover:text-blue-400 transition-colors">
                    <ChevronRight size={13} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Producto: chart + tabla mensual ─────────────────────────────────────────

function VistaProducto({ prod, subcat, months, vista, onBack }) {
  const values  = months.map(ym => getVal(prod.monthly, ym, vista))
  const total   = values.reduce((s, v) => s + v, 0)
  const avg     = months.length ? Math.round(total / months.length) : 0
  const bestIdx = values.indexOf(Math.max(...values))

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Chart panel */}
      <div className="px-6 pt-5 pb-4 border-b bg-gray-50/60 flex-shrink-0">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 mb-4 font-semibold transition-colors"
        >
          <ArrowLeft size={12} /> {subcat}
        </button>
        <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-3">Tendencia mensual</p>
        <BarChart monthly={prod.monthly} months={months} vista={vista} />
      </div>

      {/* Stats row */}
      <div className="flex-shrink-0 border-b px-6 py-4 flex gap-10">
        <StatBox label="Total período"   value={fmt(total, vista)} />
        <StatBox label="Promedio / mes"  value={fmt(avg, vista)} />
        <StatBox label="Mejor mes"
          value={months[bestIdx]
            ? `${fmt(values[bestIdx], vista)} (${monthLabel(months[bestIdx])})`
            : '—'}
        />
        <StatBox label="Último mes" value={fmt(values.at(-1), vista)} />
      </div>

      {/* Monthly detail */}
      <div className="overflow-auto flex-1">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white border-b shadow-sm">
            <tr>
              <th className="text-left px-6 py-2.5 font-semibold text-gray-500 text-xs">Mes</th>
              <th className="text-right px-6 py-2.5 font-semibold text-gray-500 text-xs">
                {vista === '$$$' ? 'Monto' : 'Unidades'}
              </th>
              <th className="text-right px-6 py-2.5 font-semibold text-gray-500 text-xs">MoM%</th>
            </tr>
          </thead>
          <tbody>
            {[...months].reverse().map((ym, ri) => {
              const i    = months.length - 1 - ri
              const val  = values[i]
              const prev = i > 0 ? values[i - 1] : null
              const mom  = momPct(val, prev)
              const isLatest = i === months.length - 1

              return (
                <tr key={ym} className={`border-b border-gray-50 ${isLatest ? 'bg-gold-50/40' : ''}`}>
                  <td className="px-6 py-3 text-gray-600 text-sm capitalize">
                    {format(
                      new Date(Number(ym.split('-')[0]), Number(ym.split('-')[1]) - 1, 1),
                      'MMMM yyyy', { locale: es }
                    )}
                  </td>
                  <td className="px-6 py-3 text-right font-bold text-gray-800 tabular-nums">
                    {val ? fmt(val, vista) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <MomBadge pct={mom} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Modal principal ──────────────────────────────────────────────────────────

export default function AnalisisModal({ onClose }) {
  const [categoria, setCategoria] = useState('Bebidas')
  const [vista, setVista]         = useState('$$$')
  const [numMeses, setNumMeses]   = useState(6)
  // drilldown stores only IDs so it stays valid when data reloads
  const [drilldown, setDrilldown] = useState(null)
  // null | { level: 'subcat', subcat: string }
  //      | { level: 'product', subcat: string, productId: string }

  const { data, loading, error } = useHistorial(numMeses)

  const months    = data?.months || []
  const subcatNode = drilldown?.subcat ? data?.tree?.[categoria]?.[drilldown.subcat] : null
  const prodNode   = drilldown?.productId && subcatNode
    ? subcatNode.productos?.[drilldown.productId]
    : null

  const handleSetCategoria = (cat) => { setCategoria(cat); setDrilldown(null) }
  const handleDrillSubcat  = (subcat)    => setDrilldown({ level: 'subcat', subcat })
  const handleDrillProduct = (productId) => setDrilldown(prev => ({ ...prev, level: 'product', productId }))
  const handleBackOverview = ()          => setDrilldown(null)
  const handleBackSubcat   = ()          => setDrilldown(prev => ({ level: 'subcat', subcat: prev.subcat }))

  // ── Breadcrumb ──
  const breadcrumb = (
    <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
      <button
        onClick={drilldown ? handleBackOverview : undefined}
        className={drilldown
          ? 'font-semibold text-gray-500 hover:text-gold-700 transition-colors'
          : 'font-semibold text-gray-400'}
      >
        {categoria}
      </button>
      {drilldown && (
        <>
          <ChevronRight size={10} />
          <button
            onClick={drilldown.level === 'product' ? handleBackSubcat : undefined}
            className={drilldown.level === 'product'
              ? 'font-semibold text-gray-500 hover:text-gold-700 transition-colors'
              : 'font-semibold text-gray-700'}
          >
            {drilldown.subcat}
          </button>
        </>
      )}
      {drilldown?.level === 'product' && prodNode && (
        <>
          <ChevronRight size={10} />
          <span className="font-semibold text-gray-700">{prodNode.nombre}</span>
        </>
      )}
    </div>
  )

  // ── Render content ──
  let content
  if (loading) {
    content = <p className="text-center py-20 text-gray-400">Cargando historial...</p>
  } else if (error) {
    content = <p className="text-center py-20 text-red-400">{error}</p>
  } else if (drilldown?.level === 'product' && prodNode) {
    content = (
      <VistaProducto
        prod={prodNode}
        subcat={drilldown.subcat}
        months={months}
        vista={vista}
        onBack={handleBackSubcat}
      />
    )
  } else if (drilldown?.level === 'subcat' && subcatNode) {
    content = (
      <VistaSubcat
        subcat={drilldown.subcat}
        node={subcatNode}
        months={months}
        vista={vista}
        onBack={handleBackOverview}
        onDrillProduct={handleDrillProduct}
      />
    )
  } else {
    content = (
      <VistaOverview
        tree={data?.tree || {}}
        months={months}
        vista={vista}
        categoria={categoria}
        onDrill={handleDrillSubcat}
      />
    )
  }

  return (
    <Modal onClose={onClose} maxWidth="max-w-7xl">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 p-5 border-b flex-shrink-0">
        <div className="mr-2">
          <h2 className="text-xl font-bold text-gray-900 leading-none">Análisis Detallado</h2>
          {breadcrumb}
        </div>

        {/* Category tabs — only in overview */}
        {!drilldown && (
          <div className="flex rounded-lg border overflow-hidden">
            {['Bebidas', 'Alimentos'].map(cat => (
              <button key={cat}
                onClick={() => handleSetCategoria(cat)}
                className={`px-4 py-1.5 text-sm font-semibold transition-colors ${
                  categoria === cat ? 'bg-[#7a6020] text-white' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >{cat}</button>
            ))}
          </div>
        )}

        {/* Vista toggle — always visible */}
        <div className="flex rounded-lg border overflow-hidden">
          {['$$$', '###'].map(v => (
            <button key={v}
              onClick={() => setVista(v)}
              className={`px-3 py-1.5 text-sm font-semibold transition-colors ${
                vista === v ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >{v}</button>
          ))}
        </div>

        {/* Months selector */}
        <select
          value={numMeses}
          onChange={e => setNumMeses(Number(e.target.value))}
          className="border rounded-lg px-3 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-1 focus:ring-gold-400"
        >
          <option value={3}>3 meses</option>
          <option value={6}>6 meses</option>
          <option value={12}>12 meses</option>
        </select>

        <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
      </div>

      {content}
    </Modal>
  )
}
