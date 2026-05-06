import { useState } from 'react'
import { useVentasPlu } from '../hooks/useVentasPlu'
import MonthPicker from '../components/ui/MonthPicker'
import SubcatModal from '../components/modals/SubcatModal'
import RegistrarDiaModal   from '../components/modals/RegistrarDiaModal'
import ListaProductosModal from '../components/modals/ListaProductosModal'
import VerErroresModal     from '../components/modals/VerErroresModal'
import AuditarDiaModal     from '../components/modals/AuditarDiaModal'
import AnalisisModal       from '../components/modals/AnalisisModal'
import { Plus, List, AlertCircle, Eye, BarChart2, TrendingUp, TrendingDown } from 'lucide-react'
import { formatMoney, formatUnits } from '../utils/formatters'
import { toLabel } from '../utils/dateHelpers'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const COLORS = [
  '#dc2626','#ea580c','#d97706','#65a30d','#16a34a',
  '#0d9488','#0284c7','#7c3aed','#c026d3','#db2777','#64748b',
]

const MODAL = {
  REGISTRAR: 'registrar', PRODUCTOS: 'productos',
  ERRORES: 'errores', AUDITAR: 'auditar', ANALISIS: 'analisis',
}

// ─── MoM badge ────────────────────────────────────────────────────────────────

function MomBadge({ pct }) {
  if (pct == null) return <span className="text-gray-300 text-xs">--</span>
  const pos = pct >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-bold
      ${pos ? 'text-green-600 bg-green-50' : 'text-red-500 bg-red-50'}`}>
      {pos ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
      {pos ? '+' : ''}{Number(pct).toFixed(1)}%
    </span>
  )
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, mom, sub, accent }) {
  const pos = mom >= 0
  return (
    <div
      className={`bg-white rounded-xl px-5 py-4 border ${accent ? 'border-l-4 border-gray-100' : 'border-gray-100'}`}
      style={accent ? { borderLeftColor: accent } : {}}
    >
      <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{value ?? '—'}</p>
      {mom != null && (
        <p className={`text-xs font-semibold mt-1 flex items-center gap-0.5 ${pos ? 'text-green-600' : 'text-red-500'}`}>
          {pos ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {pos ? '+' : ''}{Number(mom).toFixed(1)}% vs mes ant.
        </p>
      )}
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Donut chart ──────────────────────────────────────────────────────────────

function DonutChart({ data, colorStart = 0, onSliceClick }) {
  const [hover, setHover] = useState(null)
  const total = data.reduce((s, r) => s + Number(r.unidades || 0), 0)
  if (!total) return <p className="text-xs text-gray-300 text-center py-4">Sin datos</p>

  const R = 60, ri = 36, cx = 68, cy = 68
  let angle = -Math.PI / 2

  const slices = data.map((row, i) => {
    const val = Number(row.unidades || 0)
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
    return { ...row, d, pct, color: COLORS[(i + colorStart) % COLORS.length], idx: i }
  })

  return (
    <div className="flex items-start gap-4">
      {/* Donut SVG */}
      <svg viewBox="0 0 136 136" width={136} height={136} className="flex-shrink-0">
        {slices.map(s => (
          <path key={s.subcategoria} d={s.d}
            fill={s.color} stroke="white" strokeWidth={2}
            opacity={hover === null || hover === s.idx ? 1 : 0.45}
            className="cursor-pointer transition-opacity"
            onMouseEnter={() => setHover(s.idx)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onSliceClick(s.subcategoria)}
          />
        ))}
        {/* Center */}
        <text x={cx} y={cx - 7} textAnchor="middle" fill="#374151" fontSize={13} fontWeight="700">
          {total.toLocaleString('es-MX')}
        </text>
        <text x={cx} y={cx + 9} textAnchor="middle" fill="#9ca3af" fontSize={9}>
          unidades
        </text>
      </svg>

      {/* Legend */}
      <div className="flex-1 space-y-1.5 pt-1 min-w-0">
        {slices.map(s => (
          <div
            key={s.subcategoria}
            className={`flex items-center gap-2 text-xs cursor-pointer rounded px-1 py-0.5 transition-colors ${hover === s.idx ? 'bg-gray-50' : ''}`}
            onMouseEnter={() => setHover(s.idx)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onSliceClick(s.subcategoria)}
          >
            <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: s.color }} />
            <span className="text-gray-600 truncate flex-1">{s.subcategoria}</span>
            <span className="text-gray-400 tabular-nums">{(s.pct * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Subcategory table ────────────────────────────────────────────────────────

function SubcatTable({ titulo, data, colorStart = 0, onRowClick }) {
  const total = data.reduce((s, r) => s + Number(r.unidades || 0), 0)
  const totalMonto = data.reduce((s, r) => s + Number(r.monto || 0), 0)

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="px-5 py-3 border-b bg-gray-50 flex justify-between items-center">
        <h3 className="font-bold text-gray-800 text-sm">{titulo}</h3>
        <span className="text-xs text-gray-400">{formatMoney(totalMonto)}</span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="px-3 py-2 text-xs font-semibold text-gray-400 text-right w-8">#</th>
            <th className="px-4 py-2 text-xs font-semibold text-gray-400 text-left">Subcategoría</th>
            <th className="px-3 py-2 text-xs font-semibold text-gray-400 text-right">%</th>
            <th className="px-3 py-2 text-xs font-semibold text-gray-400 text-right">Unidades</th>
            <th className="px-3 py-2 text-xs font-semibold text-gray-400 text-right">MoM%</th>
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-gray-300 text-sm">
                Sin datos para este mes
              </td>
            </tr>
          ) : data.map((row, i) => {
            const pct = total > 0 ? (Number(row.unidades) / total * 100).toFixed(1) : '0.0'
            const color = COLORS[(i + colorStart) % COLORS.length]
            return (
              <tr key={row.subcategoria}
                onClick={() => onRowClick(row.subcategoria)}
                className="border-b border-gray-50 hover:bg-amber-50/60 cursor-pointer transition-colors group">
                <td className="px-3 py-2.5 text-gray-300 text-xs text-right">{i + 1}</td>
                <td className="px-4 py-2.5 font-semibold text-sm group-hover:underline" style={{ color }}>
                  {row.subcategoria}
                </td>
                <td className="px-3 py-2.5 text-right text-gray-400 text-xs tabular-nums">{pct}%</td>
                <td className="px-3 py-2.5 text-right text-gray-700 font-medium tabular-nums">{formatUnits(row.unidades)}</td>
                <td className="px-3 py-2.5 text-right">
                  <MomBadge pct={row.mom_pct != null ? Number(row.mom_pct) : null} />
                </td>
              </tr>
            )
          })}
        </tbody>
        {data.length > 0 && (
          <tfoot>
            <tr className="bg-gray-50 border-t">
              <td colSpan={3} className="px-4 py-2 text-xs font-bold text-gray-500">TOTAL</td>
              <td className="px-3 py-2 text-right font-bold text-gray-800 tabular-nums text-sm">
                {formatUnits(total)}
              </td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function VentasPlu() {
  const [mes, setMes]     = useState(new Date())
  const [modal, setModal] = useState(null)
  const [subcat, setSubcat] = useState(null)  // { subcat, categoria }

  const { bebidas, alimentos, bTotales, aTotales, loading, error } = useVentasPlu(mes)

  const totUnidades = (aTotales?.unidades || 0) + (bTotales?.unidades || 0)
  const totMonto    = (aTotales?.monto    || 0) + (bTotales?.monto    || 0)
  const mesLabel    = format(mes, "MMMM yyyy", { locale: es })

  const btnClass    = "flex items-center gap-2 px-4 py-2 bg-[#7a6020] text-white rounded-lg text-sm font-semibold hover:bg-[#5c4718] transition-colors shadow-sm"
  const btnAltClass = "flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg text-sm font-semibold hover:bg-gray-50 hover:border-gray-300 transition-colors shadow-sm"

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-6">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Ventas por PLU</h1>
            <p className="text-xs text-gray-400 mt-0.5 capitalize">{mesLabel} · datos al {toLabel(new Date())}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setModal(MODAL.REGISTRAR)} className={btnClass}>
              <Plus size={15} /> Registrar día
            </button>
            <button onClick={() => setModal(MODAL.PRODUCTOS)} className={btnClass}>
              <List size={15} /> Productos
            </button>
            <button onClick={() => setModal(MODAL.ERRORES)} className={btnClass}>
              <AlertCircle size={15} /> Errores
            </button>
            <button onClick={() => setModal(MODAL.AUDITAR)} className={btnClass}>
              <Eye size={15} /> Auditar
            </button>
            <div className="w-px h-6 bg-gray-200" />
            <button onClick={() => setModal(MODAL.ANALISIS)} className={btnAltClass}>
              <BarChart2 size={15} className="text-gold-600" /> Análisis
            </button>
            <MonthPicker value={mes} onChange={setMes} />
          </div>
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
            Error al cargar datos: {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-32 text-gray-300">
            <p className="text-sm">Cargando {mesLabel}...</p>
          </div>
        ) : (
          <>
            {/* ── KPI row ── */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <KpiCard
                label="Total unidades"
                value={formatUnits(totUnidades)}
                sub="MTD comparado vs mes anterior"
              />
              <KpiCard
                label="Alimentos"
                value={formatUnits(aTotales?.unidades)}
                mom={aTotales?.mom}
                accent="#f59e0b"
                sub={totUnidades > 0 ? `${Math.round((aTotales?.unidades || 0) / totUnidades * 100)}% del total` : null}
              />
              <KpiCard
                label="Bebidas"
                value={formatUnits(bTotales?.unidades)}
                mom={bTotales?.mom}
                accent="#3b82f6"
                sub={totUnidades > 0 ? `${Math.round((bTotales?.unidades || 0) / totUnidades * 100)}% del total` : null}
              />
              <KpiCard
                label="Total monto"
                value={formatMoney(totMonto)}
                sub={totUnidades > 0 ? `${formatMoney(Math.round(totMonto / totUnidades))} prom/unidad` : null}
              />
            </div>

            {/* ── Main grid ── */}
            <div className="grid grid-cols-5 gap-6">

              {/* Tables — left 3 cols */}
              <div className="col-span-3 space-y-6">
                <SubcatTable
                  titulo="Alimentos"
                  data={alimentos}
                  colorStart={0}
                  onRowClick={s => setSubcat({ subcat: s, categoria: 'Alimentos' })}
                />
                <SubcatTable
                  titulo="Bebidas"
                  data={bebidas}
                  colorStart={0}
                  onRowClick={s => setSubcat({ subcat: s, categoria: 'Bebidas' })}
                />
              </div>

              {/* Donuts — right 2 cols */}
              <div className="col-span-2 space-y-6">
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide text-center mb-4">
                    Mix Alimentos
                  </p>
                  <DonutChart
                    data={alimentos}
                    colorStart={0}
                    onSliceClick={s => setSubcat({ subcat: s, categoria: 'Alimentos' })}
                  />
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide text-center mb-4">
                    Mix Bebidas
                  </p>
                  <DonutChart
                    data={bebidas}
                    colorStart={4}
                    onSliceClick={s => setSubcat({ subcat: s, categoria: 'Bebidas' })}
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Modales ── */}
      {modal === MODAL.REGISTRAR && <RegistrarDiaModal   onClose={() => setModal(null)} />}
      {modal === MODAL.PRODUCTOS && <ListaProductosModal onClose={() => setModal(null)} />}
      {modal === MODAL.ERRORES   && <VerErroresModal     onClose={() => setModal(null)} />}
      {modal === MODAL.AUDITAR   && <AuditarDiaModal     onClose={() => setModal(null)} />}
      {modal === MODAL.ANALISIS  && <AnalisisModal       onClose={() => setModal(null)} />}

      {subcat && (
        <SubcatModal
          subcat={subcat.subcat}
          categoria={subcat.categoria}
          mes={mes}
          onClose={() => setSubcat(null)}
        />
      )}
    </div>
  )
}
