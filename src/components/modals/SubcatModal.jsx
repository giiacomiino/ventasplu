import { useState, useEffect, useCallback } from 'react'
import Modal from '../ui/Modal'
import { supabase } from '../../lib/supabase'
import { formatMoney, formatUnits } from '../../utils/formatters'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowLeft, TrendingUp, TrendingDown } from 'lucide-react'

// Monochromatic amber/gold palette — darkest to lightest
const PALETTE = [
  '#78350f','#92400e','#b45309','#d97706','#f59e0b',
  '#fbbf24','#fcd34d','#f0d070','#e8c860','#ddc050','#d4b896',
]

function momPct(curr, prev) {
  if (!prev) return null
  return Math.round(((curr - prev) / prev) * 1000) / 10
}

function MomBadge({ pct }) {
  if (pct == null) return <span className="text-gray-300 text-xs">--</span>
  const pos = pct >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-bold
      ${pos ? 'text-emerald-700 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
      {pos ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
      {pos ? '+' : ''}{pct.toFixed(1)}%
    </span>
  )
}

// ─── Donut chart (productos del mes) ─────────────────────────────────────────

function DonutProds({ prods, lastYm }) {
  const [hover, setHover] = useState(null)
  const total = prods.reduce((s, p) => s + (p.monthly[lastYm]?.unidades || 0), 0)
  if (!total) return null

  const R = 55, ri = 32, cx = 62, cy = 62
  let angle = -Math.PI / 2

  const slices = prods.map((prod, i) => {
    const val = prod.monthly[lastYm]?.unidades || 0
    const pct = val / total
    const s = angle, e = angle + pct * 2 * Math.PI
    angle = e
    const large = pct > 0.5 ? 1 : 0
    const d = [
      `M ${cx + R * Math.cos(s)} ${cy + R * Math.sin(s)}`,
      `A ${R} ${R} 0 ${large} 1 ${cx + R * Math.cos(e)} ${cy + R * Math.sin(e)}`,
      `L ${cx + ri * Math.cos(e)} ${cy + ri * Math.sin(e)}`,
      `A ${ri} ${ri} 0 ${large} 0 ${cx + ri * Math.cos(s)} ${cy + ri * Math.sin(s)}`,
      'Z',
    ].join(' ')
    return { ...prod, d, pct, color: PALETTE[i % PALETTE.length], idx: i }
  })

  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 124 124" width={124} height={124} className="flex-shrink-0">
        {slices.map(s => (
          <path key={s.id} d={s.d} fill={s.color} stroke="white" strokeWidth={2}
            opacity={hover === null || hover === s.idx ? 1 : 0.4}
            className="transition-opacity cursor-pointer"
            onMouseEnter={() => setHover(s.idx)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
        <text x={cx} y={cy - 6} textAnchor="middle" fill="#374151" fontSize={12} fontWeight="700">
          {total.toLocaleString('es-MX')}
        </text>
        <text x={cx} y={cx + 8} textAnchor="middle" fill="#9ca3af" fontSize={9}>uds</text>
      </svg>
      <div className="space-y-1.5 flex-1 min-w-0">
        {slices.map(s => (
          <div key={s.id}
            className={`flex items-center gap-1.5 text-xs rounded px-1 py-0.5 transition-colors ${hover === s.idx ? 'bg-amber-50' : ''}`}
            onMouseEnter={() => setHover(s.idx)} onMouseLeave={() => setHover(null)}>
            <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: s.color }} />
            <span className="text-gray-600 truncate flex-1">{s.nombre}</span>
            <span className="text-gray-400 tabular-nums">{(s.pct * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Line chart (tendencia de monto) ─────────────────────────────────────────

function LineChart({ prods, months }) {
  const vals = months.map(ym => prods.reduce((s, p) => s + (p.monthly[ym]?.monto || 0), 0))
  const max  = Math.max(...vals, 1)
  const W = 280, H = 100, PAD = { l: 10, r: 10, t: 24, b: 24 }
  const CW = W - PAD.l - PAD.r, CH = H - PAD.t - PAD.b

  const xOf = i => months.length < 2 ? CW / 2 : PAD.l + (i / (months.length - 1)) * CW
  const yOf = v => PAD.t + CH - (v / max) * CH

  let d = ''; let on = false
  vals.forEach((v, i) => {
    if (v > 0) { d += `${on ? 'L' : 'M'} ${xOf(i)} ${yOf(v)} `; on = true }
    else on = false
  })

  const fmtV = v => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {/* Area fill */}
      {d && (
        <path
          d={`${d} L ${xOf(months.length - 1)} ${PAD.t + CH} L ${xOf(0)} ${PAD.t + CH} Z`}
          fill="#f59e0b" fillOpacity={0.08}
        />
      )}
      {/* Line */}
      <path d={d} fill="none" stroke="#d97706" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {/* Dots + values */}
      {vals.map((v, i) => v > 0 && (
        <g key={months[i]}>
          <circle cx={xOf(i)} cy={yOf(v)} r={3} fill="#d97706" stroke="white" strokeWidth={1.5} />
          <text x={xOf(i)} y={yOf(v) - 7} textAnchor="middle" fill="#78350f" fontSize={8} fontWeight="600">
            {fmtV(v)}
          </text>
        </g>
      ))}
      {/* X labels */}
      {months.map((ym, i) => (
        <text key={ym} x={xOf(i)} y={H - 5} textAnchor="middle" fill="#9ca3af" fontSize={9}>
          {format(new Date(+ym.split('-')[0], +ym.split('-')[1] - 1, 1), 'MMM', { locale: es })}
        </text>
      ))}
    </svg>
  )
}

// ─── Bar chart (detalle producto) ────────────────────────────────────────────

function BarChart({ monthly, months, vista }) {
  const k    = vista === '$$$' ? 'monto' : 'unidades'
  const vals = months.map(ym => monthly[ym]?.[k] || 0)
  const max  = Math.max(...vals, 1)

  // Wide bars so the viewBox aspect ratio ~4.5:1 → chart renders ~140px tall at modal width
  const bW = 76, gap = 14, barH = 72
  const PAD = { top: 28, bottom: 24 }
  const totalW = months.length * (bW + gap) - gap
  const svgH   = PAD.top + barH + PAD.bottom

  const lbl = v => {
    if (!v) return ''
    if (vista === '$$$') return v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`
    return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)
  }

  return (
    <svg width="100%" viewBox={`0 0 ${totalW} ${svgH}`} className="w-full">
      {/* Grid lines */}
      {[0.33, 0.66, 1].map(pct => {
        const gy = PAD.top + barH - pct * barH
        return <line key={pct} x1={0} y1={gy} x2={totalW} y2={gy} stroke="#f3f4f6" strokeWidth={1.5} />
      })}

      {months.map((ym, i) => {
        const val    = vals[i]
        const bH     = Math.max(Math.round((val / max) * barH), val > 0 ? 2 : 0)
        const x      = i * (bW + gap)
        const barTop = PAD.top + barH - bH
        const isLast = i === months.length - 1
        const ml     = format(new Date(+ym.split('-')[0], +ym.split('-')[1] - 1, 1), 'MMM', { locale: es })
        return (
          <g key={ym}>
            {bH > 0 && (
              <rect x={x} y={barTop} width={bW} height={bH} rx={4}
                fill={isLast ? '#b45309' : '#f59e0b'} />
            )}
            {val > 0 && (
              <text x={x + bW / 2} y={barTop - 6} textAnchor="middle" fill="#78350f" fontSize={11} fontWeight="700">
                {lbl(val)}
              </text>
            )}
            <text x={x + bW / 2} y={svgH - 5} textAnchor="middle"
              fill={val > 0 ? '#6b7280' : '#d1d5db'} fontSize={12}>
              {ml}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ─── Product detail view ──────────────────────────────────────────────────────

function ProductoDetalle({ prod, months, maxDayInCurrent }) {
  const [vista, setVista] = useState('###')
  const k         = vista === '$$$' ? 'monto' : 'unidades'
  const currentYm = months.at(-1)
  const prevYm    = months.at(-2)

  // MTD-capped MoM% for current month
  const currVal = prod.monthly[currentYm]?.[k] || 0
  let prevVal = 0
  if (prevYm && maxDayInCurrent > 0) {
    for (const [date, dv] of Object.entries(prod.days)) {
      if (date.startsWith(prevYm) && parseInt(date.slice(8, 10)) <= maxDayInCurrent) {
        prevVal += dv[k] || 0
      }
    }
  }
  const mom = momPct(currVal, prevVal)

  const allVals = months.map(ym => prod.monthly[ym]?.[k] || 0)
  const total   = allVals.reduce((s, v) => s + v, 0)
  const avg     = months.length ? Math.round(total / months.length) : 0
  const bestIdx = allVals.indexOf(Math.max(...allVals))
  const fmt     = v => v ? (vista === '$$$' ? formatMoney(v) : formatUnits(v)) : '—'

  return (
    <div className="flex-1 overflow-auto min-h-0">

      {/* ── Toggle + KPIs ── */}
      <div className="px-6 pt-4 pb-4 border-b">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-bold text-amber-700 uppercase tracking-widest">Indicadores del período</p>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
            {[{ v: '###', label: 'Unidades' }, { v: '$$$', label: 'Monto' }].map(({ v, label }) => (
              <button key={v} onClick={() => setVista(v)}
                className={`px-3 py-1.5 font-semibold transition-colors
                  ${vista === v ? 'bg-amber-700 text-white' : 'text-gray-400 hover:bg-gray-50'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2.5">
          {[
            {
              label: 'MTD actual',
              value: fmt(currVal),
              sub: mom != null
                ? <span className={`flex items-center gap-0.5 text-[10px] font-bold ${mom >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {mom >= 0 ? <TrendingUp size={9}/> : <TrendingDown size={9}/>}
                    {mom >= 0 ? '+' : ''}{mom.toFixed(1)}% vs mes ant.
                  </span>
                : null,
            },
            { label: 'Promedio / mes', value: fmt(avg) },
            {
              label: 'Mejor mes',
              value: fmt(allVals[bestIdx]),
              sub: months[bestIdx]
                ? <span className="text-[10px] text-amber-600 capitalize">
                    {format(new Date(+months[bestIdx].split('-')[0], +months[bestIdx].split('-')[1]-1, 1), 'MMM yyyy', { locale: es })}
                  </span>
                : null,
            },
            { label: 'Total 6 meses', value: fmt(total) },
          ].map(({ label, value, sub }) => (
            <div key={label} className="bg-amber-50/50 border border-amber-100 rounded-xl px-3 py-2.5">
              <p className="text-[9px] text-amber-800/50 uppercase tracking-wide font-bold leading-tight">{label}</p>
              <p className="text-sm font-bold text-gray-800 mt-1 tabular-nums leading-none">{value}</p>
              {sub && <div className="mt-1">{sub}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* ── Gráfica de barras ── */}
      <div className="px-6 pt-3 pb-3 border-b bg-gray-50/40">
        <p className="text-[10px] font-bold text-amber-700 uppercase tracking-widest mb-1.5">
          Evolución — {vista === '$$$' ? 'monto' : 'unidades'}
        </p>
        <div className="bg-white rounded-xl border border-gray-100 px-3 py-2">
          <BarChart monthly={prod.monthly} months={months} vista={vista} />
        </div>
      </div>

      {/* ── Tabla mensual ── */}
      <div>
        <div className="px-6 pt-3 pb-1">
          <p className="text-[10px] font-bold text-amber-700 uppercase tracking-widest">Detalle mensual</p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-white border-b">
            <tr>
              <th className="text-left px-6 py-2 font-semibold text-gray-400 text-xs">Mes</th>
              <th className="text-right px-5 py-2 font-semibold text-gray-400 text-xs">Unidades</th>
              <th className="text-right px-5 py-2 font-semibold text-gray-400 text-xs">Monto</th>
              <th className="text-right px-6 py-2 font-semibold text-gray-400 text-xs">MoM%</th>
            </tr>
          </thead>
          <tbody>
            {[...months].reverse().map((ym, ri) => {
              const i      = months.length - 1 - ri
              const row    = prod.monthly[ym] || { unidades: 0, monto: 0 }
              const isLast = i === months.length - 1
              let rowMom = null
              if (i > 0) {
                const prevM = months[i - 1]
                const cap   = isLast ? maxDayInCurrent : 31
                let prevK = 0
                for (const [date, dv] of Object.entries(prod.days)) {
                  if (date.startsWith(prevM) && parseInt(date.slice(8, 10)) <= cap) {
                    prevK += dv[k] || 0
                  }
                }
                rowMom = momPct(row[k], prevK)
              }
              return (
                <tr key={ym} className={`border-b border-gray-50 ${isLast ? 'bg-amber-50/40' : 'hover:bg-gray-50/60'}`}>
                  <td className="px-6 py-2.5 text-gray-600 capitalize text-sm font-medium">
                    {format(new Date(+ym.split('-')[0], +ym.split('-')[1]-1, 1), 'MMMM yyyy', { locale: es })}
                    {isLast && (
                      <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">MTD</span>
                    )}
                  </td>
                  <td className="px-5 py-2.5 text-right font-bold text-gray-800 tabular-nums">
                    {row.unidades ? formatUnits(row.unidades) : <span className="text-gray-200">—</span>}
                  </td>
                  <td className="px-5 py-2.5 text-right text-gray-500 tabular-nums">
                    {row.monto ? formatMoney(row.monto) : <span className="text-gray-200">—</span>}
                  </td>
                  <td className="px-6 py-2.5 text-right"><MomBadge pct={rowMom} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Subcategory overview ─────────────────────────────────────────────────────

function SubcatOverview({ prods, months, maxDayInCurrent, onSelect, subcat, mesLabel }) {
  const lastYm  = months.at(-1)
  const prevYm  = months.at(-2)

  const totUnidades = prods.reduce((s, p) => s + (p.monthly[lastYm]?.unidades || 0), 0)
  const totMonto    = prods.reduce((s, p) => s + (p.monthly[lastYm]?.monto    || 0), 0)

  const sorted = [...prods].sort((a, b) =>
    (b.monthly[lastYm]?.unidades || 0) - (a.monthly[lastYm]?.unidades || 0)
  )

  // MTD-capped MoM% per product
  const getMom = (prod) => {
    const currU = prod.monthly[lastYm]?.unidades || 0
    if (!prevYm || maxDayInCurrent === 0) return momPct(currU, prod.monthly[prevYm]?.unidades || 0)
    let prevU = 0
    for (const [date, vals] of Object.entries(prod.days)) {
      if (date.startsWith(prevYm) && parseInt(date.slice(8, 10)) <= maxDayInCurrent) {
        prevU += vals.unidades
      }
    }
    return momPct(currU, prevU)
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden min-h-0">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 p-6 border-b flex-shrink-0">
        <div className="border border-gray-100 rounded-xl p-5 text-center">
          <p className="text-sm text-gray-500 font-semibold mb-2">Unidades vendidas</p>
          <p className="text-3xl font-bold text-gray-900 tabular-nums">{formatUnits(totUnidades)}</p>
        </div>
        <div className="border border-gray-100 rounded-xl p-5 text-center">
          <p className="text-sm text-gray-500 font-semibold mb-2">Monto vendido</p>
          <p className="text-3xl font-bold text-gray-900 tabular-nums">{formatMoney(totMonto)}</p>
        </div>
      </div>

      {/* Product table */}
      <div className="overflow-auto flex-1">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white border-b shadow-sm z-10">
            <tr>
              <th className="text-left px-6 py-3 font-semibold text-gray-400 text-xs">Producto</th>
              <th className="text-right px-5 py-3 font-semibold text-gray-400 text-xs">Unidades</th>
              <th className="text-right px-5 py-3 font-semibold text-gray-400 text-xs">Monto</th>
              <th className="text-right px-6 py-3 font-semibold text-gray-400 text-xs">MoM%</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-gray-300 text-sm">Sin registros</td>
              </tr>
            ) : sorted.map((prod, i) => {
              const u   = prod.monthly[lastYm]?.unidades || 0
              const m   = prod.monthly[lastYm]?.monto    || 0
              const mom = getMom(prod)
              return (
                <tr key={prod.id}
                  onClick={() => onSelect(prod)}
                  className="border-b border-gray-50 hover:bg-amber-50/50 cursor-pointer transition-colors group">
                  <td className="px-6 py-3 font-semibold text-amber-700 group-hover:text-amber-900 group-hover:underline">
                    {prod.nombre}
                  </td>
                  <td className="px-5 py-3 text-right text-gray-800 font-bold tabular-nums">
                    {u ? formatUnits(u) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-5 py-3 text-right text-gray-600 tabular-nums">
                    {m ? formatMoney(m) : <span className="text-gray-200">—</span>}
                  </td>
                  <td className="px-6 py-3 text-right"><MomBadge pct={mom} /></td>
                </tr>
              )
            })}
          </tbody>
          {sorted.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 border-t">
                <td className="px-6 py-2.5 text-xs font-bold text-gray-500">TOTAL</td>
                <td className="px-5 py-2.5 text-right font-bold text-gray-800 tabular-nums">{formatUnits(totUnidades)}</td>
                <td className="px-5 py-2.5 text-right font-bold text-gray-600 tabular-nums">{formatMoney(totMonto)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>

        {/* Charts */}
        {sorted.length > 0 && (
          <div className="grid grid-cols-2 gap-5 p-6 border-t bg-gray-50/40">
            <div>
              <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-3">Unidades</p>
              <DonutProds prods={sorted} lastYm={lastYm} />
            </div>
            <div>
              <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-3">Monto</p>
              <LineChart prods={sorted} months={months} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Modal principal ──────────────────────────────────────────────────────────

export default function SubcatModal({ subcat, categoria, mes, onClose }) {
  const [prods,          setProds]          = useState([])
  const [months,         setMonths]         = useState([])
  const [maxDayInCurrent, setMaxDay]        = useState(0)
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState(null)
  const [selected,       setSelected]       = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setSelected(null)

    const { data: prodList, error: pErr } = await supabase
      .from('productos')
      .select('id, nombre')
      .eq('subcategoria', subcat)

    if (pErr || !prodList?.length) {
      setError(pErr?.message || 'Sin productos para esta subcategoría')
      setLoading(false)
      return
    }

    const prodIds  = prodList.map(p => p.id)
    const nameById = Object.fromEntries(prodList.map(p => [p.id, p.nombre]))

    const endDate   = endOfMonth(mes)
    const startDate = startOfMonth(subMonths(mes, 5))

    const { data: rows, error: vErr } = await supabase
      .from('ventas_plu')
      .select('producto_id, unidades, monto, fecha')
      .in('producto_id', prodIds)
      .gte('fecha', format(startDate, 'yyyy-MM-dd'))
      .lte('fecha', format(endDate, 'yyyy-MM-dd'))

    if (vErr) { setError(vErr.message); setLoading(false); return }

    const currentYm = format(mes, 'yyyy-MM')
    const mths = Array.from({ length: 6 }, (_, i) =>
      format(subMonths(mes, 5 - i), 'yyyy-MM')
    )

    // Find max day with data in the current month (for MTD capping)
    let maxDay = 0
    for (const r of rows || []) {
      if (r.fecha.startsWith(currentYm)) {
        const day = parseInt(r.fecha.slice(8, 10))
        if (day > maxDay) maxDay = day
      }
    }

    // Aggregate by product × month + keep daily records for MTD calc
    const map = {}
    for (const r of rows || []) {
      const id = r.producto_id
      const ym = r.fecha.slice(0, 7)
      if (!map[id]) map[id] = { id, nombre: nameById[id], monthly: {}, days: {} }
      if (!map[id].monthly[ym]) map[id].monthly[ym] = { unidades: 0, monto: 0 }
      map[id].monthly[ym].unidades += Number(r.unidades || 0)
      map[id].monthly[ym].monto    += Number(r.monto    || 0)
      if (!map[id].days[r.fecha]) map[id].days[r.fecha] = { unidades: 0, monto: 0 }
      map[id].days[r.fecha].unidades += Number(r.unidades || 0)
      map[id].days[r.fecha].monto    += Number(r.monto    || 0)
    }

    setMonths(mths)
    setMaxDay(maxDay)
    setProds(Object.values(map))
    setLoading(false)
  }, [subcat, mes])

  useEffect(() => { load() }, [load])

  const mesLabel = format(mes, "MMM-yy", { locale: es })

  return (
    <Modal onClose={onClose} maxWidth="max-w-3xl">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b flex-shrink-0 text-center relative">
        {selected && (
          <button onClick={() => setSelected(null)}
            className="absolute left-6 top-6 flex items-center gap-1.5 text-xs text-amber-700 hover:text-amber-900 font-semibold transition-colors">
            <ArrowLeft size={12} /> {subcat}
          </button>
        )}
        <button onClick={onClose} className="absolute right-5 top-5 text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        <h2 className="text-2xl font-bold text-amber-700">
          {selected ? selected.nombre : subcat}
        </h2>
        <p className="text-sm text-gray-400 mt-0.5 capitalize">{mesLabel}</p>
      </div>

      {loading ? (
        <p className="text-center py-16 text-gray-400 text-sm">Cargando...</p>
      ) : error ? (
        <p className="text-center py-16 text-red-400 text-sm">{error}</p>
      ) : selected ? (
        <ProductoDetalle
          prod={selected}
          months={months}
          maxDayInCurrent={maxDayInCurrent}
        />
      ) : (
        <SubcatOverview
          prods={prods}
          months={months}
          maxDayInCurrent={maxDayInCurrent}
          onSelect={setSelected}
          subcat={subcat}
          mesLabel={mesLabel}
        />
      )}
    </Modal>
  )
}
