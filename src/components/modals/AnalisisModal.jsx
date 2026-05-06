import { useState } from 'react'
import Modal from '../ui/Modal'
import { useHistorial } from '../../hooks/useHistorial'
import { formatMoney, formatUnits } from '../../utils/formatters'
import { ChevronRight, ArrowLeft, TrendingUp, TrendingDown } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const COLORS = ['#7a6020','#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16','#ec4899']
const CAT_COLOR = { Bebidas: '#3b82f6', Alimentos: '#f59e0b' }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function momPct(curr, prev) {
  if (!prev) return null
  return Math.round(((curr - prev) / prev) * 1000) / 10
}

function getVal(monthly, ym, vista) {
  return monthly?.[ym]?.[vista === '$$$' ? 'monto' : 'unidades'] || 0
}

function fmt(val, vista) {
  if (!val) return null
  return vista === '$$$' ? formatMoney(val) : formatUnits(val)
}

function monthLabel(ym) {
  const [y, m] = ym.split('-')
  return format(new Date(+y, +m - 1, 1), 'MMM-yy', { locale: es })
}

function catMonthlyFrom(tree, categoria, months) {
  const result = {}
  for (const ym of months) {
    result[ym] = { monto: 0, unidades: 0 }
    for (const node of Object.values(tree[categoria] || {})) {
      result[ym].monto    += node.monthly[ym]?.monto    || 0
      result[ym].unidades += node.monthly[ym]?.unidades || 0
    }
  }
  return result
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, mom, sub }) {
  const isPos = mom >= 0
  return (
    <div className="bg-white rounded-xl border border-gray-100 px-5 py-4 min-w-0">
      <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold truncate">{label}</p>
      <p className="text-xl font-bold text-gray-900 mt-1 tabular-nums truncate">{value ?? '—'}</p>
      {mom != null && (
        <p className={`text-xs font-semibold mt-1 flex items-center gap-0.5 ${isPos ? 'text-green-600' : 'text-red-500'}`}>
          {isPos ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {isPos ? '+' : ''}{mom.toFixed(1)}% vs mes ant.
        </p>
      )}
      {sub && <p className="text-xs text-gray-400 mt-0.5 truncate">{sub}</p>}
    </div>
  )
}

// ─── Badge MoM ───────────────────────────────────────────────────────────────

function MomBadge({ pct }) {
  if (pct == null) return <span className="text-gray-300 text-xs">--</span>
  const pos = pct >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-bold ${pos ? 'text-green-600 bg-green-50' : 'text-red-500 bg-red-50'}`}>
      {pos ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
      {pos ? '+' : ''}{pct.toFixed(1)}%
    </span>
  )
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ monthly, months, color = '#9ca3af' }) {
  const values = months.map(ym => getVal(monthly, ym, '$$$'))
  if (values.every(v => !v)) return <span className="text-gray-200 text-xs">—</span>
  const max = Math.max(...values, 1)
  const W = 64, H = 20
  const pts = values.map((v, i) => ({
    x: months.length === 1 ? W / 2 : (i / (months.length - 1)) * W,
    y: H - Math.max((v / max) * H, v > 0 ? 2 : 0),
  }))
  let d = ''
  let inLine = false
  pts.forEach((p, i) => {
    if (values[i] > 0) { d += `${inLine ? 'L' : 'M'} ${p.x} ${p.y} `; inLine = true }
    else inLine = false
  })
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      {pts.at(-1) && values.at(-1) > 0 && (
        <circle cx={pts.at(-1).x} cy={pts.at(-1).y} r={2} fill={color} />
      )}
    </svg>
  )
}

// ─── Line Chart ───────────────────────────────────────────────────────────────

function LineChart({ series, months, vista, height = 150 }) {
  const [hoverIdx, setHoverIdx] = useState(null)
  const PAD = { top: 16, right: 16, bottom: 28, left: 58 }
  const VW = 540, VH = height + PAD.top + PAD.bottom
  const CW = VW - PAD.left - PAD.right
  const CH = height

  const allVals = series.flatMap(s => months.map(ym => getVal(s.monthly, ym, vista)))
  const rawMax  = Math.max(...allVals, 1)
  const mag     = Math.pow(10, Math.floor(Math.log10(rawMax)))
  const niceMax = Math.ceil(rawMax / mag) * mag

  const xOf = i => months.length < 2 ? CW / 2 : (i / (months.length - 1)) * CW
  const yOf = v => CH - (v / niceMax) * CH

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(f * niceMax))

  const fmtY = v => {
    if (vista === '$$$') return v >= 1e6 ? `$${(v/1e6).toFixed(1)}M` : v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`
    return v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)
  }

  return (
    <div className="relative select-none">
      <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full">
        {/* Grid */}
        {yTicks.map(t => (
          <g key={t}>
            <line x1={PAD.left} y1={PAD.top + yOf(t)} x2={PAD.left + CW} y2={PAD.top + yOf(t)} stroke="#f3f4f6" strokeWidth={1} />
            <text x={PAD.left - 5} y={PAD.top + yOf(t) + 4} textAnchor="end" fill="#d1d5db" fontSize={9}>{fmtY(t)}</text>
          </g>
        ))}

        {/* Series */}
        {series.map((s, si) => {
          const pts = months.map((ym, i) => ({
            x: PAD.left + xOf(i), y: PAD.top + yOf(getVal(s.monthly, ym, vista)),
            v: getVal(s.monthly, ym, vista),
          }))
          let d = ''; let on = false
          pts.forEach(p => { if (p.v > 0) { d += `${on ? 'L' : 'M'} ${p.x} ${p.y} `; on = true } else on = false })
          const col = s.color || COLORS[si]
          return (
            <g key={s.label}>
              <path d={d} fill="none" stroke={col} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {pts.map((p, i) => p.v > 0 && (
                <circle key={i} cx={p.x} cy={p.y}
                  r={hoverIdx === i ? 5 : 3} fill={col} stroke="white"
                  strokeWidth={hoverIdx === i ? 2 : 1} />
              ))}
            </g>
          )
        })}

        {/* Hover line */}
        {hoverIdx !== null && (
          <line x1={PAD.left + xOf(hoverIdx)} y1={PAD.top}
            x2={PAD.left + xOf(hoverIdx)} y2={PAD.top + CH}
            stroke="#e5e7eb" strokeWidth={1} strokeDasharray="4,3" />
        )}

        {/* X labels */}
        {months.map((ym, i) => (
          <text key={ym} x={PAD.left + xOf(i)} y={VH - 5} textAnchor="middle" fill="#9ca3af" fontSize={9}>
            {monthLabel(ym)}
          </text>
        ))}

        {/* Invisible hover rects */}
        {months.map((ym, i) => {
          const sw = months.length < 2 ? CW : CW / months.length
          return (
            <rect key={ym} x={PAD.left + xOf(i) - sw / 2} y={PAD.top}
              width={sw} height={CH} fill="transparent"
              onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)} />
          )
        })}
      </svg>

      {/* Tooltip */}
      {hoverIdx !== null && (
        <div className={`absolute top-2 bg-white border border-gray-100 rounded-xl shadow-lg px-3 py-2.5 text-xs z-20 pointer-events-none min-w-[130px] ${hoverIdx < months.length / 2 ? 'right-2' : 'left-14'}`}>
          <p className="font-bold text-gray-600 mb-2">{monthLabel(months[hoverIdx])}</p>
          {series.map((s, si) => {
            const val = getVal(s.monthly, months[hoverIdx], vista)
            return (
              <div key={s.label} className="flex items-center justify-between gap-3 mb-1 last:mb-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color || COLORS[si] }} />
                  <span className="text-gray-500 truncate max-w-[90px]">{s.label}</span>
                </div>
                <span className="font-bold text-gray-800 tabular-nums">{val ? fmt(val, vista) : '—'}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Progress bar row ─────────────────────────────────────────────────────────

function ProgressRow({ label, value, total, color, onClick }) {
  const pct = total > 0 ? Math.round(value / total * 100) : 0
  return (
    <div className={`${onClick ? 'cursor-pointer group' : ''}`} onClick={onClick}>
      <div className="flex justify-between text-xs mb-1">
        <span className={`font-medium ${onClick ? 'group-hover:underline' : ''}`} style={{ color }}>{label}</span>
        <span className="text-gray-400 tabular-nums">{pct}%</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

// ─── NIVEL 0 — Overview general ───────────────────────────────────────────────

function VistaOverview({ tree, months, vista, onDrill }) {
  const bebMonthly = catMonthlyFrom(tree, 'Bebidas', months)
  const aliMonthly = catMonthlyFrom(tree, 'Alimentos', months)

  const totalMonthly = {}
  for (const ym of months) {
    totalMonthly[ym] = {
      monto:    (bebMonthly[ym]?.monto    || 0) + (aliMonthly[ym]?.monto    || 0),
      unidades: (bebMonthly[ym]?.unidades || 0) + (aliMonthly[ym]?.unidades || 0),
    }
  }

  const lastYm  = months.at(-1)
  const prevYm  = months.at(-2)
  const k       = vista === '$$$' ? 'monto' : 'unidades'
  const totLast = totalMonthly[lastYm]?.[k] || 0
  const totPrev = totalMonthly[prevYm]?.[k] || 0
  const bebLast = bebMonthly[lastYm]?.[k] || 0
  const aliLast = aliMonthly[lastYm]?.[k] || 0

  const totalPeriod = months.reduce((s, ym) => s + (totalMonthly[ym]?.[k] || 0), 0)

  const numProds = Object.values(tree).flatMap(cat =>
    Object.values(cat).flatMap(sub => Object.keys(sub.productos))
  ).length

  const lineSeries = [
    { label: 'Bebidas',   monthly: bebMonthly, color: CAT_COLOR.Bebidas },
    { label: 'Alimentos', monthly: aliMonthly, color: CAT_COLOR.Alimentos },
  ]

  return (
    <div className="overflow-auto flex-1 p-6 bg-gray-50/50 space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="Total mes actual" value={fmt(totLast, vista)} mom={momPct(totLast, totPrev)} />
        <KpiCard label="Bebidas MTD" value={fmt(bebLast, vista)}
          mom={momPct(bebLast, bebMonthly[prevYm]?.[k] || 0)}
          sub={totLast > 0 ? `${Math.round(bebLast/totLast*100)}% del total` : null} />
        <KpiCard label="Alimentos MTD" value={fmt(aliLast, vista)}
          mom={momPct(aliLast, aliMonthly[prevYm]?.[k] || 0)}
          sub={totLast > 0 ? `${Math.round(aliLast/totLast*100)}% del total` : null} />
        <KpiCard label="Productos activos" value={numProds}
          sub={`Total período: ${fmt(totalPeriod, vista)}`} />
      </div>

      {/* Line chart */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex justify-between items-center mb-4">
          <p className="text-sm font-bold text-gray-700">Tendencia por categoría</p>
          <div className="flex gap-4">
            {lineSeries.map(s => (
              <div key={s.label} className="flex items-center gap-1.5 text-xs text-gray-500">
                <div className="w-4 h-0.5 rounded" style={{ background: s.color }} />
                {s.label}
              </div>
            ))}
          </div>
        </div>
        <LineChart series={lineSeries} months={months} vista={vista} height={160} />
      </div>

      {/* Category cards */}
      <div className="grid grid-cols-2 gap-5">
        {['Bebidas', 'Alimentos'].map(cat => {
          const catM = cat === 'Bebidas' ? bebMonthly : aliMonthly
          const col  = CAT_COLOR[cat]
          const subcats = Object.entries(tree[cat] || {}).sort((a, b) => {
            const at = months.reduce((s, ym) => s + (a[1].monthly[ym]?.monto || 0), 0)
            const bt = months.reduce((s, ym) => s + (b[1].monthly[ym]?.monto || 0), 0)
            return bt - at
          })
          const catTotal = months.reduce((s, ym) => s + (catM[ym]?.monto || 0), 0)

          return (
            <div key={cat} className="bg-white rounded-xl border border-gray-100 p-5 hover:border-gray-300 transition-colors cursor-pointer"
              onClick={() => onDrill(cat)}>
              <div className="flex justify-between items-center mb-4">
                <div>
                  <p className="font-bold text-gray-800 text-base">{cat}</p>
                  <p className="text-xs text-gray-400">{subcats.length} subcategorías · {Object.values(tree[cat]||{}).reduce((s,n)=>s+Object.keys(n.productos).length,0)} productos</p>
                </div>
                <div className="flex items-center gap-1 text-xs font-semibold" style={{ color: col }}>
                  Ver detalle <ChevronRight size={12} />
                </div>
              </div>
              <div className="space-y-2.5">
                {subcats.slice(0, 5).map(([subcat, node]) => {
                  const val = months.reduce((s, ym) => s + (node.monthly[ym]?.monto || 0), 0)
                  return (
                    <ProgressRow key={subcat} label={subcat} value={val} total={catTotal} color={col} />
                  )
                })}
                {subcats.length > 5 && (
                  <p className="text-xs text-gray-300 pt-1">+{subcats.length - 5} subcategorías más</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── NIVEL 1 — Categoría ──────────────────────────────────────────────────────

function VistaCategoria({ categoria, tree, months, vista, onBack, onDrill }) {
  const col   = CAT_COLOR[categoria]
  const catM  = catMonthlyFrom(tree, categoria, months)
  const subcats = Object.entries(tree[categoria] || {}).sort((a, b) => {
    const at = months.reduce((s, ym) => s + (a[1].monthly[ym]?.monto || 0), 0)
    const bt = months.reduce((s, ym) => s + (b[1].monthly[ym]?.monto || 0), 0)
    return bt - at
  })

  const lastYm  = months.at(-1)
  const prevYm  = months.at(-2)
  const k       = vista === '$$$' ? 'monto' : 'unidades'
  const lastVal = catM[lastYm]?.[k] || 0
  const prevVal = catM[prevYm]?.[k] || 0
  const period  = months.reduce((s, ym) => s + (catM[ym]?.[k] || 0), 0)

  const top5 = subcats.slice(0, 6).map(([subcat, node], i) => ({
    label: subcat, monthly: node.monthly, color: COLORS[i],
  }))

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="p-6 border-b bg-gray-50/50 flex-shrink-0 space-y-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-semibold transition-colors" style={{ color: col }}>
          <ArrowLeft size={12} /> Overview
        </button>

        <div className="grid grid-cols-4 gap-4">
          <KpiCard label="Mes actual" value={fmt(lastVal, vista)} mom={momPct(lastVal, prevVal)} />
          <KpiCard label="Total período" value={fmt(period, vista)} />
          <KpiCard label="Subcategorías" value={subcats.length} />
          <KpiCard label="Top subcategoría" value={subcats[0]?.[0]}
            sub={subcats[0] ? fmt(months.reduce((s,ym)=>s+getVal(subcats[0][1].monthly,ym,vista),0),vista) : null} />
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm font-bold text-gray-700">Tendencia por subcategoría (top {top5.length})</p>
            <div className="flex flex-wrap gap-3">
              {top5.map(s => (
                <div key={s.label} className="flex items-center gap-1 text-xs text-gray-500">
                  <div className="w-3 h-0.5 rounded" style={{ background: s.color }} />
                  <span className="truncate max-w-[70px]">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
          <LineChart series={top5} months={months} vista={vista} height={120} />
        </div>
      </div>

      <div className="overflow-auto flex-1">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white border-b shadow-sm z-10">
            <tr>
              <th className="text-left px-4 py-2.5 font-semibold text-gray-500 text-xs sticky left-0 bg-white z-20 min-w-[160px]">Subcategoría</th>
              {months.map(ym => (
                <th key={ym} className="text-right px-3 py-2.5 font-semibold text-gray-500 text-xs whitespace-nowrap">{monthLabel(ym)}</th>
              ))}
              <th className="text-right px-3 py-2.5 font-semibold text-gray-500 text-xs">Total</th>
              <th className="text-right px-3 py-2.5 font-semibold text-gray-500 text-xs">MoM%</th>
              <th className="text-right px-4 py-2.5 font-semibold text-gray-500 text-xs">Tendencia</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {subcats.map(([subcat, node], si) => {
              const total = months.reduce((s, ym) => s + getVal(node.monthly, ym, vista), 0)
              const mom   = momPct(getVal(node.monthly, lastYm, vista), getVal(node.monthly, prevYm, vista))
              return (
                <tr key={subcat} onClick={() => onDrill(subcat)}
                  className="cursor-pointer hover:bg-gold-50 border-b border-gray-100 transition-colors select-none group">
                  <td className="px-4 py-2.5 font-bold text-sm sticky left-0 bg-white group-hover:bg-gold-50 z-[1] transition-colors"
                    style={{ color: COLORS[si % COLORS.length] }}>
                    {subcat}
                  </td>
                  {months.map(ym => {
                    const val = getVal(node.monthly, ym, vista)
                    return (
                      <td key={ym} className="px-3 py-2.5 text-right text-gray-600 text-xs tabular-nums whitespace-nowrap">
                        {val ? fmt(val, vista) : <span className="text-gray-100">—</span>}
                      </td>
                    )
                  })}
                  <td className="px-3 py-2.5 text-right font-bold text-gray-800 text-xs tabular-nums">{fmt(total, vista) || '—'}</td>
                  <td className="px-3 py-2.5 text-right"><MomBadge pct={mom} /></td>
                  <td className="px-4 py-2.5 text-right">
                    <Sparkline monthly={node.monthly} months={months} color={COLORS[si % COLORS.length]} />
                  </td>
                  <td className="pr-3 py-2.5 text-right text-gray-200 group-hover:text-gold-500 transition-colors"><ChevronRight size={13} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── NIVEL 2 — Subcategoría ───────────────────────────────────────────────────

function VistaSubcat({ categoria, subcat, node, months, vista, onBack, onDrill }) {
  const prods = Object.values(node.productos).sort((a, b) => {
    const at = months.reduce((s, ym) => s + getVal(a.monthly, ym, '$$$'), 0)
    const bt = months.reduce((s, ym) => s + getVal(b.monthly, ym, '$$$'), 0)
    return bt - at
  })

  const lastYm  = months.at(-1)
  const prevYm  = months.at(-2)
  const lastVal = getVal(node.monthly, lastYm, vista)
  const prevVal = getVal(node.monthly, prevYm, vista)
  const period  = months.reduce((s, ym) => s + getVal(node.monthly, ym, vista), 0)

  const top5 = prods.slice(0, 5).map((p, i) => ({
    label: p.nombre, monthly: p.monthly, color: COLORS[i],
  }))

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="p-6 border-b bg-gray-50/50 flex-shrink-0 space-y-4">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-gold-700 hover:text-gold-900 font-semibold transition-colors">
          <ArrowLeft size={12} /> {categoria}
        </button>

        <div className="grid grid-cols-4 gap-4">
          <KpiCard label="Mes actual" value={fmt(lastVal, vista)} mom={momPct(lastVal, prevVal)} />
          <KpiCard label="Total período" value={fmt(period, vista)} />
          <KpiCard label="Productos" value={prods.length} />
          <KpiCard label="Top producto" value={prods[0]?.nombre}
            sub={prods[0] ? fmt(months.reduce((s,ym)=>s+getVal(prods[0].monthly,ym,vista),0),vista) : null} />
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm font-bold text-gray-700">Top productos — tendencia</p>
            <div className="flex flex-wrap gap-3">
              {top5.map(s => (
                <div key={s.label} className="flex items-center gap-1 text-xs text-gray-500">
                  <div className="w-3 h-0.5 rounded" style={{ background: s.color }} />
                  <span className="truncate max-w-[80px]">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
          <LineChart series={top5} months={months} vista={vista} height={120} />
        </div>
      </div>

      <div className="overflow-auto flex-1">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white border-b shadow-sm z-10">
            <tr>
              <th className="text-left px-4 py-2.5 font-semibold text-gray-500 text-xs sticky left-0 bg-white z-20 min-w-[180px]">Producto</th>
              {months.map(ym => (
                <th key={ym} className="text-right px-3 py-2.5 font-semibold text-gray-500 text-xs whitespace-nowrap">{monthLabel(ym)}</th>
              ))}
              <th className="text-right px-3 py-2.5 font-semibold text-gray-500 text-xs">Total</th>
              <th className="text-right px-3 py-2.5 font-semibold text-gray-500 text-xs">MoM%</th>
              <th className="text-right px-4 py-2.5 font-semibold text-gray-500 text-xs">Tendencia</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {prods.map((prod, si) => {
              const total = months.reduce((s, ym) => s + getVal(prod.monthly, ym, vista), 0)
              const mom   = momPct(getVal(prod.monthly, lastYm, vista), getVal(prod.monthly, prevYm, vista))
              return (
                <tr key={prod.id} onClick={() => onDrill(prod.id)}
                  className="cursor-pointer hover:bg-blue-50/30 border-b border-gray-50 transition-colors select-none group">
                  <td className="px-4 py-2.5 text-gray-700 font-medium text-sm sticky left-0 bg-white group-hover:bg-blue-50/30 z-[1] transition-colors">
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
                  <td className="px-3 py-2.5 text-right font-bold text-gray-800 text-xs tabular-nums">{fmt(total, vista) || '—'}</td>
                  <td className="px-3 py-2.5 text-right"><MomBadge pct={mom} /></td>
                  <td className="px-4 py-2.5 text-right">
                    <Sparkline monthly={prod.monthly} months={months} color={COLORS[si % COLORS.length]} />
                  </td>
                  <td className="pr-3 py-2.5 text-right text-gray-200 group-hover:text-blue-400 transition-colors"><ChevronRight size={13} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── NIVEL 3 — Producto ───────────────────────────────────────────────────────

function VistaProducto({ prod, subcat, months, vista, onBack }) {
  const values  = months.map(ym => getVal(prod.monthly, ym, vista))
  const total   = values.reduce((s, v) => s + v, 0)
  const avg     = months.length ? Math.round(total / months.length) : 0
  const max     = Math.max(...values, 1)
  const bestIdx = values.indexOf(Math.max(...values))
  const lastVal = values.at(-1) || 0
  const prevVal = values.at(-2) || 0

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="p-6 border-b bg-gray-50/50 flex-shrink-0 space-y-4">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 font-semibold transition-colors">
          <ArrowLeft size={12} /> {subcat}
        </button>

        <div className="grid grid-cols-4 gap-4">
          <KpiCard label="Mes actual (MTD)" value={fmt(lastVal, vista)} mom={momPct(lastVal, prevVal)} />
          <KpiCard label="Promedio / mes"   value={fmt(avg, vista)} />
          <KpiCard label="Mejor mes"        value={fmt(values[bestIdx], vista)}
            sub={months[bestIdx] ? monthLabel(months[bestIdx]) : null} />
          <KpiCard label="Total período"    value={fmt(total, vista)} />
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-sm font-bold text-gray-700 mb-3">Tendencia mensual</p>
          <LineChart
            series={[{ label: prod.nombre, monthly: prod.monthly, color: COLORS[0] }]}
            months={months} vista={vista} height={140}
          />
        </div>
      </div>

      <div className="overflow-auto flex-1">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white border-b shadow-sm">
            <tr>
              <th className="text-left px-6 py-2.5 font-semibold text-gray-500 text-xs">Mes</th>
              <th className="text-right px-6 py-2.5 font-semibold text-gray-500 text-xs">{vista === '$$$' ? 'Monto' : 'Unidades'}</th>
              <th className="text-right px-6 py-2.5 font-semibold text-gray-500 text-xs">MoM%</th>
              <th className="text-right px-6 py-2.5 font-semibold text-gray-500 text-xs">vs Promedio</th>
              <th className="text-right px-6 py-2.5 font-semibold text-gray-500 text-xs w-32">Participación</th>
            </tr>
          </thead>
          <tbody>
            {[...months].reverse().map((ym, ri) => {
              const i      = months.length - 1 - ri
              const val    = values[i]
              const prev   = i > 0 ? values[i - 1] : null
              const mom    = momPct(val, prev)
              const vsProm = avg > 0 && val > 0 ? +((val - avg) / avg * 100).toFixed(1) : null
              const pct    = total > 0 ? Math.round(val / total * 100) : 0
              const isLast = i === months.length - 1

              return (
                <tr key={ym} className={`border-b border-gray-50 ${isLast ? 'bg-amber-50/30' : ''}`}>
                  <td className="px-6 py-3 text-gray-600 text-sm capitalize">
                    {format(new Date(+ym.split('-')[0], +ym.split('-')[1] - 1, 1), 'MMMM yyyy', { locale: es })}
                    {isLast && <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">MTD</span>}
                  </td>
                  <td className="px-6 py-3 text-right font-bold text-gray-800 tabular-nums">
                    {val ? fmt(val, vista) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-6 py-3 text-right"><MomBadge pct={mom} /></td>
                  <td className="px-6 py-3 text-right text-xs font-semibold tabular-nums">
                    {vsProm != null ? (
                      <span className={vsProm >= 0 ? 'text-green-600' : 'text-red-400'}>
                        {vsProm >= 0 ? '+' : ''}{vsProm}%
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-1.5 rounded-full bg-gold-400" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-gray-400 tabular-nums w-7 text-right">{pct}%</span>
                    </div>
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
  const [vista,    setVista]    = useState('$$$')
  const [numMeses, setNumMeses] = useState(6)
  const [drill,    setDrill]    = useState(null)
  // null | {level:'category', categoria}
  //      | {level:'subcat',   categoria, subcat}
  //      | {level:'product',  categoria, subcat, productId}

  const { data, loading, error } = useHistorial(numMeses)

  const months     = data?.months || []
  const tree       = data?.tree   || {}
  const subcatNode = drill?.subcat    ? tree[drill.categoria]?.[drill.subcat]                         : null
  const prodNode   = drill?.productId ? subcatNode?.productos?.[drill.productId]                      : null

  const go = updates => setDrill(prev => ({ ...prev, ...updates }))
  const back = level => {
    if (level === null)       setDrill(null)
    if (level === 'category') setDrill({ level: 'category', categoria: drill.categoria })
    if (level === 'subcat')   setDrill({ level: 'subcat',   categoria: drill.categoria, subcat: drill.subcat })
  }

  // Breadcrumb
  const crumb = (
    <div className="flex items-center gap-1 text-xs mt-0.5">
      <button onClick={() => setDrill(null)}
        className={drill ? 'text-gray-500 hover:text-gold-700 font-semibold transition-colors' : 'text-gray-400 font-semibold'}>
        Overview
      </button>
      {drill && (
        <>
          <ChevronRight size={10} className="text-gray-300" />
          <button onClick={() => back('category')}
            className={drill.level !== 'category' ? 'text-gray-500 hover:text-gold-700 font-semibold transition-colors' : 'text-gray-700 font-semibold'}>
            {drill.categoria}
          </button>
        </>
      )}
      {drill?.subcat && (
        <>
          <ChevronRight size={10} className="text-gray-300" />
          <button onClick={() => back('subcat')}
            className={drill.level !== 'subcat' ? 'text-gray-500 hover:text-gold-700 font-semibold transition-colors' : 'text-gray-700 font-semibold'}>
            {drill.subcat}
          </button>
        </>
      )}
      {drill?.productId && prodNode && (
        <>
          <ChevronRight size={10} className="text-gray-300" />
          <span className="text-gray-700 font-semibold truncate max-w-[200px]">{prodNode.nombre}</span>
        </>
      )}
    </div>
  )

  // Content
  let content
  if (loading) {
    content = <p className="text-center py-20 text-gray-400">Cargando historial...</p>
  } else if (error) {
    content = <p className="text-center py-20 text-red-400">{error}</p>
  } else if (drill?.level === 'product' && prodNode) {
    content = <VistaProducto prod={prodNode} subcat={drill.subcat} months={months} vista={vista}
      onBack={() => back('subcat')} />
  } else if (drill?.level === 'subcat' && subcatNode) {
    content = <VistaSubcat categoria={drill.categoria} subcat={drill.subcat} node={subcatNode}
      months={months} vista={vista} onBack={() => back('category')}
      onDrill={id => go({ level: 'product', productId: id })} />
  } else if (drill?.level === 'category') {
    content = <VistaCategoria categoria={drill.categoria} tree={tree} months={months} vista={vista}
      onBack={() => setDrill(null)}
      onDrill={subcat => go({ level: 'subcat', subcat })} />
  } else {
    content = <VistaOverview tree={tree} months={months} vista={vista}
      onDrill={cat => setDrill({ level: 'category', categoria: cat })} />
  }

  return (
    <Modal onClose={onClose} maxWidth="max-w-7xl">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b flex-shrink-0">
        <div className="mr-2">
          <h2 className="text-xl font-bold text-gray-900 leading-none">Análisis Detallado</h2>
          {crumb}
        </div>

        {/* Vista toggle */}
        <div className="flex rounded-lg border overflow-hidden">
          {['$$$', '###'].map(v => (
            <button key={v} onClick={() => setVista(v)}
              className={`px-3 py-1.5 text-sm font-semibold transition-colors ${vista === v ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
              {v}
            </button>
          ))}
        </div>

        {/* Months */}
        <select value={numMeses} onChange={e => setNumMeses(+e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-1 focus:ring-gold-400">
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
