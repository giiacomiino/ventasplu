import { TrendingUp, TrendingDown } from 'lucide-react'
import { GOOD, CRITICAL } from './shared'

// ─── Layout primitives ──────────────────────────────────────────────────────

export function Card({ children, className = '', padded = true }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(16,24,40,0.04)] ${padded ? 'p-6' : ''} ${className}`}>
      {children}
    </div>
  )
}

export function SectionHeader({ title, sub, right }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div>
        <h2 className="text-base font-bold text-gray-900 tracking-tight">{title}</h2>
        {sub && <p className="text-sm text-gray-400 mt-0.5">{sub}</p>}
      </div>
      {right && <div className="flex-shrink-0">{right}</div>}
    </div>
  )
}

export function PageHeader({ title, sub, right }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{title}</h1>
        {sub && <p className="text-sm text-gray-400 mt-1">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

// ─── KPI tiles ──────────────────────────────────────────────────────────────

export function DeltaPill({ pct, suffix = '', invert = false, compact = false }) {
  if (pct == null) return null
  const bueno = invert ? pct < 0 : pct >= 0
  return (
    <span
      className={`inline-flex items-center flex-shrink-0 gap-1 font-bold rounded-full whitespace-nowrap ${
        compact ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'
      }`}
      style={{ color: bueno ? GOOD : CRITICAL, background: bueno ? '#f0fdf4' : '#fef2f2' }}
    >
      {bueno ? <TrendingUp size={compact ? 10 : 12} /> : <TrendingDown size={compact ? 10 : 12} />}
      {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%{suffix}
    </span>
  )
}

export function KpiTile({ label, value, delta, sub }) {
  return (
    <Card className="flex flex-col gap-3 h-full">
      {/* min-h reserva espacio para 2 líneas: así el número arranca a la
          misma altura sin importar si la etiqueta es corta o larga */}
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider leading-tight min-h-[28px] flex items-start">{label}</p>
      <p className="text-3xl font-bold text-gray-900 tabular-nums leading-none">{value}</p>
      {(delta || sub) && (
        <div className="flex items-center gap-1.5 mt-auto pt-1 min-w-0">
          {delta}
          {sub && <span className="text-xs text-gray-400 truncate">{sub}</span>}
        </div>
      )}
    </Card>
  )
}

// ─── Table primitives ───────────────────────────────────────────────────────

export function Table({ children }) {
  return (
    <div className="overflow-x-auto -mx-6 px-6">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  )
}

export function Thead({ columns }) {
  return (
    <thead>
      <tr className="border-b border-gray-100">
        {columns.map((c, i) => (
          <th
            key={i}
            className={`pb-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider ${i === 0 ? 'text-left' : 'text-right'}`}
          >
            {c}
          </th>
        ))}
      </tr>
    </thead>
  )
}

export function MiniBar({ pct, color }) {
  return (
    <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden inline-block align-middle">
      <div className="h-full rounded-full" style={{ width: `${Math.min(Math.max(pct, 0) * 100, 100)}%`, background: color }} />
    </div>
  )
}

export function EmptyState({ children }) {
  return <p className="text-sm text-gray-300 text-center py-8">{children}</p>
}

export function LoadingState({ children = 'Cargando...' }) {
  return <p className="text-sm text-gray-400 py-2">{children}</p>
}

export function ErrorState({ message }) {
  return (
    <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">{message}</div>
  )
}

// ─── Gauges & donuts ────────────────────────────────────────────────────────

export function DonutGauge({ pct, color, size = 96, stroke = 10, label }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.min(Math.max(pct, 0), 1)
  const offset = c * (1 - clamped)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f0ec" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.4s ease' }}
      />
      <text x="50%" y={label ? '46%' : '50%'} textAnchor="middle" dominantBaseline="central" fontSize={size * 0.22} fontWeight="700" fill="#111827">
        {Math.round(clamped * 100)}%
      </text>
      {label && (
        <text x="50%" y="66%" textAnchor="middle" dominantBaseline="central" fontSize={size * 0.09} fontWeight="600" fill="#9ca3af">
          {label}
        </text>
      )}
    </svg>
  )
}

export function SemicircleGauge({ pct, target, color, size = 160 }) {
  const r = size / 2 - 14
  const cx = size / 2
  const cy = size / 2
  const clamped = Math.min(Math.max(pct, 0), 1)

  const point = (t) => {
    const angle = Math.PI - t * Math.PI
    return [cx + r * Math.cos(angle), cy - r * Math.sin(angle)]
  }
  const [x0, y0] = point(0)
  const [x1, y1] = point(clamped)
  const largeArc = clamped > 0.5 ? 1 : 0

  const targetPoint = target != null ? point(target) : null

  return (
    <svg width={size} height={size / 2 + 24} viewBox={`0 0 ${size} ${size / 2 + 24}`} className="flex-shrink-0">
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="#f1f0ec" strokeWidth={14} strokeLinecap="round" />
      <path d={`M ${x0} ${y0} A ${r} ${r} 0 ${largeArc} 1 ${x1} ${y1}`} fill="none" stroke={color} strokeWidth={14} strokeLinecap="round" />
      {targetPoint && (
        <line
          x1={cx + (r - 12) * Math.cos(Math.PI - target * Math.PI)}
          y1={cy - (r - 12) * Math.sin(Math.PI - target * Math.PI)}
          x2={cx + (r + 12) * Math.cos(Math.PI - target * Math.PI)}
          y2={cy - (r + 12) * Math.sin(Math.PI - target * Math.PI)}
          stroke="#374151" strokeWidth={2.5}
        />
      )}
      <text x="50%" y={cy - 4} textAnchor="middle" fontSize={size * 0.19} fontWeight="700" fill="#111827">
        {Math.round(clamped * 100)}%
      </text>
    </svg>
  )
}

export function StackedUrgencyBar({ segments }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1
  return (
    <div>
      <div className="h-11 rounded-xl overflow-hidden flex bg-gray-50">
        {segments.map((s, i) => {
          const pct = (s.value / total) * 100
          return (
            <div key={i} className="relative flex items-center justify-center" style={{ width: `${pct}%`, background: s.color }}>
              {pct >= 12 && s.value > 0 && (
                <span
                  className="text-xs font-bold whitespace-nowrap px-1 truncate"
                  style={{ color: s.labelColor || '#ffffff' }}
                >
                  {s.amountLabel}
                </span>
              )}
            </div>
          )
        })}
      </div>
      <div className="mt-4 space-y-3">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center justify-between text-sm gap-3">
            <span className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
              <span className="text-gray-600 font-medium truncate">{s.label}</span>
              {s.badge}
            </span>
            <span className="font-bold tabular-nums flex-shrink-0" style={{ color: s.textColor || '#111827' }}>
              {s.amountLabel}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
