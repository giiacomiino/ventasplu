import { useState, useEffect, useCallback } from 'react'
import Modal from '../ui/Modal'
import { supabase } from '../../lib/supabase'
import { formatMoney, formatUnits } from '../../utils/formatters'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowLeft, TrendingUp, TrendingDown, ChevronRight } from 'lucide-react'

const COLORS = [
  '#dc2626','#ea580c','#d97706','#65a30d','#16a34a',
  '#0d9488','#0284c7','#7c3aed','#c026d3','#db2777','#64748b',
]

function momPct(curr, prev) {
  if (!prev) return null
  return Math.round(((curr - prev) / prev) * 1000) / 10
}

function MomBadge({ pct }) {
  if (pct == null) return <span className="text-gray-300 text-xs">--</span>
  const pos = pct >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-bold
      ${pos ? 'text-green-600 bg-green-50' : 'text-red-500 bg-red-50'}`}>
      {pos ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
      {pos ? '+' : ''}{pct.toFixed(1)}%
    </span>
  )
}

// ─── Mini sparkline ────────────────────────────────────────────────────────────

function Sparkline({ monthly, months }) {
  const vals = months.map(ym => monthly[ym]?.unidades || 0)
  if (vals.every(v => !v)) return <span className="text-gray-200 text-xs">—</span>
  const max = Math.max(...vals, 1)
  const W = 56, H = 18
  const pts = vals.map((v, i) => ({
    x: vals.length < 2 ? W / 2 : (i / (vals.length - 1)) * W,
    y: H - Math.max((v / max) * H, v > 0 ? 2 : 0),
  }))
  let d = ''; let on = false
  pts.forEach((p, i) => {
    if (vals[i] > 0) { d += `${on ? 'L' : 'M'} ${p.x} ${p.y} `; on = true }
    else on = false
  })
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <path d={d} fill="none" stroke={COLORS[0]} strokeWidth={1.5} strokeLinejoin="round" />
      {pts.at(-1) && vals.at(-1) > 0 && (
        <circle cx={pts.at(-1).x} cy={pts.at(-1).y} r={2} fill={COLORS[0]} />
      )}
    </svg>
  )
}

// ─── Bar chart (product detail) ────────────────────────────────────────────────

function BarChart({ monthly, months, vista }) {
  const k    = vista === '$$$' ? 'monto' : 'unidades'
  const vals = months.map(ym => monthly[ym]?.[k] || 0)
  const max  = Math.max(...vals, 1)
  const bW = 30, gap = 6, h = 90
  const totalW = months.length * (bW + gap) - gap

  const label = v => {
    if (!v) return ''
    if (vista === '$$$') return v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`
    return v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
  }

  return (
    <svg width="100%" viewBox={`-2 0 ${totalW + 4} ${h + 30}`} preserveAspectRatio="none" className="w-full">
      {months.map((ym, i) => {
        const val = vals[i]
        const bH  = Math.max(Math.round((val / max) * h), val > 0 ? 2 : 0)
        const x   = i * (bW + gap)
        const isLast = i === months.length - 1
        const lbl = format(new Date(+ym.split('-')[0], +ym.split('-')[1] - 1, 1), 'MMM', { locale: es })
        return (
          <g key={ym}>
            <rect x={x} y={h - bH} width={bW} height={bH} rx={3}
              fill={isLast ? '#7a6020' : '#d4b896'} />
            {val > 0 && (
              <text x={x + bW / 2} y={h - bH - 5} textAnchor="middle" fill="#6b7280" fontSize={9}>
                {label(val)}
              </text>
            )}
            <text x={x + bW / 2} y={h + 16} textAnchor="middle" fill="#9ca3af" fontSize={10}>
              {lbl}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ─── Stat box ─────────────────────────────────────────────────────────────────

function StatBox({ label, value, mom, sub }) {
  const pos = mom >= 0
  return (
    <div className="bg-white rounded-lg border border-gray-100 px-4 py-3 min-w-0">
      <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold truncate">{label}</p>
      <p className="text-base font-bold text-gray-800 mt-0.5 tabular-nums truncate">{value ?? '—'}</p>
      {mom != null && (
        <p className={`text-xs font-semibold mt-0.5 flex items-center gap-0.5 ${pos ? 'text-green-600' : 'text-red-500'}`}>
          {pos ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          {pos ? '+' : ''}{mom.toFixed(1)}%
        </p>
      )}
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Product detail ────────────────────────────────────────────────────────────

function ProductoDetalle({ prod, months, onBack }) {
  const [vista, setVista] = useState('###')
  const k      = vista === '$$$' ? 'monto' : 'unidades'
  const values = months.map(ym => prod.monthly[ym]?.[k] || 0)
  const total  = values.reduce((s, v) => s + v, 0)
  const avg    = months.length ? Math.round(total / months.length) : 0
  const bestIdx = values.indexOf(Math.max(...values))
  const lastVal = values.at(-1) || 0
  const prevVal = values.at(-2) || 0

  const fmt = v => {
    if (!v) return '—'
    return vista === '$$$' ? formatMoney(v) : formatUnits(v)
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Panel superior */}
      <div className="px-6 pt-5 pb-4 border-b bg-gray-50/60 flex-shrink-0">
        <div className="flex justify-between items-start mb-4">
          <button onClick={onBack}
            className="flex items-center gap-1.5 text-xs text-gold-700 hover:text-gold-900 font-semibold transition-colors">
            <ArrowLeft size={12} /> Volver a productos
          </button>
          <div className="flex rounded-lg border overflow-hidden">
            {['$$$', '###'].map(v => (
              <button key={v} onClick={() => setVista(v)}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors
                  ${vista === v ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <StatBox label="Mes actual" value={fmt(lastVal)} mom={momPct(lastVal, prevVal)} />
          <StatBox label="Promedio/mes" value={fmt(avg)} />
          <StatBox
            label="Mejor mes"
            value={fmt(values[bestIdx])}
            sub={months[bestIdx]
              ? format(new Date(+months[bestIdx].split('-')[0], +months[bestIdx].split('-')[1] - 1, 1), 'MMM-yy', { locale: es })
              : null}
          />
          <StatBox label="Total período" value={fmt(total)} />
        </div>

        {/* Gráfica de barras */}
        <div className="bg-white rounded-lg border border-gray-100 p-4">
          <BarChart monthly={prod.monthly} months={months} vista={vista} />
        </div>
      </div>

      {/* Tabla mensual */}
      <div className="overflow-auto flex-1">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white border-b shadow-sm">
            <tr>
              <th className="text-left px-6 py-2.5 font-semibold text-gray-500 text-xs">Mes</th>
              <th className="text-right px-5 py-2.5 font-semibold text-gray-500 text-xs">Unidades</th>
              <th className="text-right px-5 py-2.5 font-semibold text-gray-500 text-xs">Monto</th>
              <th className="text-right px-6 py-2.5 font-semibold text-gray-500 text-xs">MoM%</th>
            </tr>
          </thead>
          <tbody>
            {[...months].reverse().map((ym, ri) => {
              const i      = months.length - 1 - ri
              const row    = prod.monthly[ym] || { unidades: 0, monto: 0 }
              const prev   = i > 0 ? (prod.monthly[months[i - 1]] || {}) : null
              const mom    = momPct(row.unidades, prev?.unidades)
              const isLast = i === months.length - 1
              return (
                <tr key={ym} className={`border-b border-gray-50 ${isLast ? 'bg-amber-50/30' : ''}`}>
                  <td className="px-6 py-3 text-gray-600 capitalize text-sm">
                    {format(new Date(+ym.split('-')[0], +ym.split('-')[1] - 1, 1), 'MMMM yyyy', { locale: es })}
                    {isLast && (
                      <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">
                        MTD
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right font-bold text-gray-800 tabular-nums">
                    {row.unidades ? formatUnits(row.unidades) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-5 py-3 text-right text-gray-500 tabular-nums">
                    {row.monto ? formatMoney(row.monto) : <span className="text-gray-200">—</span>}
                  </td>
                  <td className="px-6 py-3 text-right"><MomBadge pct={mom} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Products list ─────────────────────────────────────────────────────────────

function ProductosList({ prods, months, onSelect }) {
  const lastYm  = months.at(-1)
  const prevYm  = months.at(-2)
  const total   = prods.reduce((s, p) => s + (p.monthly[lastYm]?.unidades || 0), 0)
  const sorted  = [...prods].sort((a, b) =>
    (b.monthly[lastYm]?.unidades || 0) - (a.monthly[lastYm]?.unidades || 0)
  )

  return (
    <div className="overflow-auto flex-1">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-white border-b shadow-sm z-10">
          <tr>
            <th className="px-4 py-2.5 text-right font-semibold text-gray-400 text-xs w-10">#</th>
            <th className="px-4 py-2.5 text-left font-semibold text-gray-400 text-xs">Producto</th>
            <th className="px-4 py-2.5 text-right font-semibold text-gray-400 text-xs">%</th>
            <th className="px-4 py-2.5 text-right font-semibold text-gray-400 text-xs">Unidades</th>
            <th className="px-4 py-2.5 text-right font-semibold text-gray-400 text-xs">Monto</th>
            <th className="px-4 py-2.5 text-right font-semibold text-gray-400 text-xs">MoM%</th>
            <th className="px-4 py-2.5 text-right font-semibold text-gray-400 text-xs">6m</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-4 py-12 text-center text-gray-300 text-sm">
                Sin registros para este mes
              </td>
            </tr>
          ) : sorted.map((prod, i) => {
            const u   = prod.monthly[lastYm]?.unidades || 0
            const m   = prod.monthly[lastYm]?.monto    || 0
            const prv = prod.monthly[prevYm]?.unidades || 0
            const mom = momPct(u, prv)
            const pct = total > 0 ? (u / total * 100).toFixed(1) : '0.0'
            return (
              <tr key={prod.id}
                onClick={() => onSelect(prod)}
                className="border-b border-gray-50 hover:bg-amber-50/60 cursor-pointer transition-colors select-none group">
                <td className="px-4 py-2.5 text-right text-gray-300 text-xs">{i + 1}</td>
                <td className="px-4 py-2.5 font-semibold text-gray-800 group-hover:text-gold-700 group-hover:underline">
                  {prod.nombre}
                </td>
                <td className="px-4 py-2.5 text-right text-gray-400 text-xs tabular-nums">{pct}%</td>
                <td className="px-4 py-2.5 text-right text-gray-700 font-medium tabular-nums">
                  {u ? formatUnits(u) : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-2.5 text-right text-gray-500 text-xs tabular-nums">
                  {m ? formatMoney(m) : <span className="text-gray-200">—</span>}
                </td>
                <td className="px-4 py-2.5 text-right"><MomBadge pct={mom} /></td>
                <td className="px-4 py-2.5 text-right">
                  <Sparkline monthly={prod.monthly} months={months} />
                </td>
                <td className="pr-3 py-2.5 text-right text-gray-200 group-hover:text-gold-500 transition-colors">
                  <ChevronRight size={13} />
                </td>
              </tr>
            )
          })}
        </tbody>
        {sorted.length > 0 && (
          <tfoot>
            <tr className="bg-gray-50 border-t">
              <td colSpan={3} className="px-5 py-2 text-xs font-bold text-gray-500">TOTAL</td>
              <td className="px-4 py-2 text-right font-bold text-gray-800 tabular-nums">{formatUnits(total)}</td>
              <td colSpan={4} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

// ─── Modal principal ──────────────────────────────────────────────────────────

export default function SubcatModal({ subcat, categoria, mes, onClose }) {
  const [prods,   setProds]   = useState([])
  const [months,  setMonths]  = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [selected, setSelected] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    // Fetch product IDs for this subcategory
    const { data: prodList, error: pErr } = await supabase
      .from('productos')
      .select('id, nombre')
      .eq('subcategoria', subcat)

    if (pErr || !prodList?.length) {
      setError(pErr?.message || 'Sin productos para esta subcategoría')
      setLoading(false)
      return
    }

    const prodIds    = prodList.map(p => p.id)
    const nameById   = Object.fromEntries(prodList.map(p => [p.id, p.nombre]))

    // Fetch 6 months of sales for those products
    const endDate   = endOfMonth(mes)
    const startDate = startOfMonth(subMonths(mes, 5))

    const { data: rows, error: vErr } = await supabase
      .from('ventas_plu')
      .select('producto_id, unidades, monto, fecha')
      .in('producto_id', prodIds)
      .gte('fecha', format(startDate, 'yyyy-MM-dd'))
      .lte('fecha', format(endDate, 'yyyy-MM-dd'))

    if (vErr) { setError(vErr.message); setLoading(false); return }

    // Build months array (6 months ending in selected month)
    const mths = Array.from({ length: 6 }, (_, i) =>
      format(subMonths(mes, 5 - i), 'yyyy-MM')
    )
    setMonths(mths)

    // Aggregate by product × month
    const map = {}
    for (const r of rows || []) {
      const id = r.producto_id
      const ym = r.fecha.slice(0, 7)
      if (!map[id]) map[id] = { id, nombre: nameById[id], monthly: {} }
      if (!map[id].monthly[ym]) map[id].monthly[ym] = { unidades: 0, monto: 0 }
      map[id].monthly[ym].unidades += Number(r.unidades || 0)
      map[id].monthly[ym].monto    += Number(r.monto    || 0)
    }

    setProds(Object.values(map))
    setLoading(false)
  }, [subcat, mes])

  useEffect(() => { load() }, [load])

  const mesLabel = format(mes, 'MMMM yyyy', { locale: es })

  return (
    <Modal onClose={onClose} maxWidth="max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b flex-shrink-0">
        <div>
          {selected
            ? <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-0.5">{subcat}</p>
            : <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-0.5 capitalize">
                {categoria} · {mesLabel}
              </p>
          }
          <h2 className="text-xl font-bold text-gray-800">
            {selected ? selected.nombre : subcat}
          </h2>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none ml-4">×</button>
      </div>

      {/* Content */}
      {loading ? (
        <p className="text-center py-16 text-gray-400 text-sm">Cargando productos...</p>
      ) : error ? (
        <p className="text-center py-16 text-red-400 text-sm">{error}</p>
      ) : selected ? (
        <ProductoDetalle prod={selected} months={months} onBack={() => setSelected(null)} />
      ) : (
        <ProductosList prods={prods} months={months} onSelect={setSelected} />
      )}
    </Modal>
  )
}
