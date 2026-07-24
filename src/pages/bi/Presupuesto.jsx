import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { formatMoney } from '../../utils/formatters'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { llamar, estadoPresupuesto, GOLD_RAMP, CRITICAL } from './shared'
import { Card, SectionHeader, PageHeader, MiniBar, DeltaPill, LoadingState, ErrorState } from './ui'
import { useMesSeleccionado, SelectorMes } from './mesContext'

function formatK(n) {
  if (n == null) return '—'
  return `$${(n / 1000).toFixed(0)}k`
}

function Tooltip({ children }) {
  return (
    <div className="absolute -top-2 -translate-y-full z-20 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg pointer-events-none left-1/2 -translate-x-1/2">
      {children}
    </div>
  )
}

function iconoPresupuesto(pct) {
  if (pct == null) return CheckCircle2
  if (pct >= 1) return XCircle
  if (pct >= 0.7) return AlertTriangle
  return CheckCircle2
}

function EstadoBadge({ pct, size = 12 }) {
  const { color, label } = estadoPresupuesto(pct)
  const Icon = iconoPresupuesto(pct)
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0" style={{ color, background: `${color}14` }}>
      <Icon size={size} />
      {label} · {pct != null ? `${(pct * 100).toFixed(0)}%` : '—'}
    </span>
  )
}

function GraficaProveedor({ serieMensual, impliedBudget }) {
  const [hover, setHover] = useState(null)
  // headroom del 12% para que la barra más alta no toque el borde del área
  const max = Math.max(...serieMensual.map(s => s.monto), impliedBudget || 0, 1) * 1.12
  const alturaLinea = impliedBudget ? Math.min((impliedBudget / max) * 100, 100) : null

  return (
    <div>
      <div className="flex gap-2.5 mb-2">
        {serieMensual.map((s, i) => {
          const yoyPct = s.montoAnterior ? ((s.monto - s.montoAnterior) / s.montoAnterior) * 100 : null
          return (
            <div key={i} className="flex-1 flex justify-center">
              {yoyPct != null && <DeltaPill pct={yoyPct} invert compact suffix=" YoY" />}
            </div>
          )
        })}
      </div>
      <div className="relative flex items-end gap-2.5 h-32">
        {alturaLinea != null && (
          <div
            className="absolute left-0 right-0 border-t-2 border-dashed z-10"
            style={{ bottom: `${alturaLinea}%`, borderColor: CRITICAL }}
          >
            <span className="absolute -top-4 left-0 text-[10px] font-bold whitespace-nowrap bg-white pr-1" style={{ color: CRITICAL }}>
              implícito {formatMoney(impliedBudget)}
            </span>
          </div>
        )}
        {serieMensual.map((s, i) => {
          const h = Math.max((s.monto / max) * 100, s.monto ? 10 : 0)
          return (
            <div
              key={s.mes}
              className="flex-1 h-full flex flex-col justify-end items-center relative cursor-pointer"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {hover === i && (
                <Tooltip>
                  <p className="font-semibold capitalize">{format(new Date(`${s.mes}-01T00:00:00`), 'MMMM yyyy', { locale: es })}</p>
                  <p className="text-gray-300">{formatMoney(s.monto)}</p>
                  {s.montoAnterior > 0 && <p className="text-gray-400">Año anterior: {formatMoney(s.montoAnterior)}</p>}
                </Tooltip>
              )}
              <div
                className="w-full rounded-t-md relative transition-opacity"
                style={{ height: `${h}%`, background: GOLD_RAMP[1], opacity: hover === i ? 0.75 : 1 }}
              >
                {s.monto > 0 && (
                  <span className="absolute top-1/2 left-0 right-0 -translate-y-1/2 text-center text-[10px] font-bold text-white whitespace-nowrap">
                    {formatK(s.monto)}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex gap-2.5 mt-1.5">
        {serieMensual.map(s => (
          <div key={s.mes} className="flex-1 text-center text-[10px] text-gray-400 font-medium">{s.mes.slice(5)}</div>
        ))}
      </div>
    </div>
  )
}

function FacturasProveedor({ facturas }) {
  if (facturas.length === 0) return <p className="text-xs text-gray-300 py-3">Sin facturas pagadas este mes</p>
  return (
    <table className="w-full text-xs mt-1">
      <thead>
        <tr className="text-gray-400 border-b border-gray-100">
          <th className="text-left font-bold uppercase tracking-wide pb-2">Fecha</th>
          <th className="text-left font-bold uppercase tracking-wide pb-2">Descripción</th>
          <th className="text-right font-bold uppercase tracking-wide pb-2">Remisión</th>
          <th className="text-right font-bold uppercase tracking-wide pb-2">Monto</th>
        </tr>
      </thead>
      <tbody>
        {facturas.map((f, i) => (
          <tr key={i} className="border-b border-gray-50 last:border-0">
            <td className="py-2 text-gray-500 whitespace-nowrap">{format(new Date(f.fecha), 'd MMM', { locale: es })}</td>
            <td className="py-2 text-gray-600 truncate max-w-[220px]">{f.descripcion || '—'}</td>
            <td className="py-2 text-right text-gray-400">{f.remision ?? '—'}</td>
            <td className="py-2 text-right font-bold text-gray-800 tabular-nums">{formatMoney(f.monto)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ProveedorRolling({ p }) {
  const [abierto, setAbierto] = useState(false)
  const { color } = estadoPresupuesto(p.pct)

  return (
    <div className={`rounded-lg border bg-white transition-colors ${abierto ? 'border-gray-200 shadow-sm' : 'border-gray-100'}`}>
      <button
        onClick={() => setAbierto(a => !a)}
        className="w-full text-left p-3 rounded-lg hover:bg-gray-50/80 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-400"
      >
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="min-w-0 flex items-center gap-2">
            {abierto ? <ChevronUp size={13} className="text-gray-300 flex-shrink-0" /> : <ChevronDown size={13} className="text-gray-300 flex-shrink-0" />}
            <span className="text-sm font-semibold text-gray-800 truncate">{p.nombre}</span>
          </div>
          <EstadoBadge pct={p.pct} size={11} />
        </div>
        <div className="flex items-center gap-3 pl-5">
          <MiniBar pct={p.pct ?? 0} color={color} />
          <p className="text-xs text-gray-400 flex-shrink-0">
            {formatMoney(p.gastoActual)} de {p.impliedBudget != null ? formatMoney(p.impliedBudget) : '—'}
            <span className="text-gray-300"> · {p.share != null ? `${(p.share * 100).toFixed(1)}% hist.` : 'sin historial'}</span>
          </p>
        </div>
      </button>

      {abierto && (
        <div className="px-4 pb-4 pt-3 mt-1 border-t border-gray-100">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
            Últimos 6 meses vs. presupuesto implícito
          </p>
          <GraficaProveedor serieMensual={p.serieMensual} impliedBudget={p.impliedBudget} />
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mt-4 mb-1">Facturas pagadas del mes en curso</p>
          <FacturasProveedor facturas={p.facturas} />
        </div>
      )}
    </div>
  )
}

function CategoriaRow({ c, detalle, cargandoArbol }) {
  const [abierto, setAbierto] = useState(false)
  const { color } = estadoPresupuesto(c.porcentajeUtilizado)

  return (
    <div className="border-b border-gray-50 last:border-0">
      <button
        onClick={() => setAbierto(a => !a)}
        className="w-full text-left py-4 hover:bg-gray-50/60 transition-colors px-1 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-400"
      >
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <div className="min-w-0 flex items-center gap-2">
            {abierto ? <ChevronUp size={15} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={15} className="text-gray-400 flex-shrink-0" />}
            <span className="text-sm font-bold text-gray-900">{c.nombre}</span>
            {c.tipo && <span className="text-xs text-gray-400 font-medium">{c.tipo}</span>}
          </div>
          <EstadoBadge pct={c.porcentajeUtilizado} />
        </div>
        <div className="flex items-center gap-3 pl-6">
          <MiniBar pct={c.porcentajeUtilizado ?? 0} color={color} />
          <p className="text-xs text-gray-400 flex-shrink-0 tabular-nums">
            {formatMoney(c.gastoReal)} <span className="text-gray-300">de</span> {formatMoney(c.limiteMes)}
          </p>
        </div>
      </button>

      {abierto && (
        <div className="ml-6 mr-1 mb-4 p-3 rounded-xl bg-gray-50/70">
          {cargandoArbol && !detalle && <LoadingState>Cargando proveedores...</LoadingState>}
          {detalle && (
            <>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">
                Proveedores de esta categoría · reparto según su % histórico (últimos 6 meses)
              </p>
              <div className="space-y-2">
                {detalle.proveedores.length === 0 ? (
                  <p className="text-xs text-gray-300 py-3">Sin proveedores en el periodo</p>
                ) : (
                  detalle.proveedores.map(p => <ProveedorRolling key={p.nombre} p={p} />)
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Sparkline({ serie }) {
  const vals = serie.map(s => s.pct ?? 0)
  const max = Math.max(...vals, 1, 1)
  const w = 200, h = 56, step = w / Math.max(serie.length - 1, 1)
  const points = vals.map((v, i) => `${i * step},${h - Math.min(v / max, 1.3) * h}`).join(' ')
  const ultimo = serie[serie.length - 1]
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
        <line x1="0" y1={h - Math.min(1 / max, 1.3) * h} x2={w} y2={h - Math.min(1 / max, 1.3) * h} stroke="#e5e7eb" strokeDasharray="3,3" strokeWidth="1" />
        <polyline points={points} fill="none" stroke={GOLD_RAMP[1]} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <p className="text-xs text-gray-400 mt-2">
        último: <span className="font-bold text-gray-600">{ultimo?.pct != null ? `${(ultimo.pct * 100).toFixed(0)}%` : '—'}</span>
      </p>
    </div>
  )
}

export default function BIPresupuesto() {
  const { anio, mes } = useMesSeleccionado()
  const [negocio, setNegocio] = useState(null)
  const [tendencias, setTendencias] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [arbol, setArbol] = useState(null)
  const [cargandoArbol, setCargandoArbol] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.allSettled([llamar('resumen-negocio', { anio, mes }), llamar('resumen-tendencias')]).then(([r1, r2]) => {
      if (r1.status === 'fulfilled') setNegocio(r1.value)
      if (r2.status === 'fulfilled') setTendencias(r2.value)
      setError(r1.status === 'rejected' ? r1.reason.message : r2.status === 'rejected' ? r2.reason.message : '')
      setLoading(false)
    })
  }, [anio, mes])

  useEffect(() => {
    setArbol(null)
    setCargandoArbol(true)
    llamar('presupuesto-arbol', { anio, mes })
      .then(setArbol)
      .catch(() => {})
      .finally(() => setCargandoArbol(false))
  }, [anio, mes])

  return (
    <div className="w-full px-8 py-8 max-w-[1600px] mx-auto space-y-8">
      <div>
        <Link to="/business-intelligence" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-700 mb-3 transition-colors">
          <ArrowLeft size={15} /> Business Intelligence
        </Link>
        <PageHeader title="Presupuesto" sub="Control de gasto vs. límite mensual, por categoría y proveedor" right={<SelectorMes />} />
      </div>

      {loading && <LoadingState>Cargando...</LoadingState>}
      {error && <ErrorState message={error} />}

      <div className="grid grid-cols-3 gap-6">
        {negocio?.presupuesto && (
          <div className="col-span-2">
            <Card padded={false}>
              <div className="p-6 pb-0">
                <SectionHeader
                  title={format(new Date(negocio.presupuesto.mes), 'MMMM yyyy', { locale: es })}
                  sub="Click en una categoría para ver el desglose por proveedor"
                  right={
                    <span className="text-sm font-bold text-gray-800 tabular-nums">
                      {formatMoney(negocio.presupuesto.totalGastoReal)}
                      <span className="text-gray-300 font-normal"> / </span>
                      {formatMoney(negocio.presupuesto.totalLimite)}
                    </span>
                  }
                />
              </div>
              <div className="px-6 pb-2">
                {negocio.presupuesto.categorias.map(c => (
                  <CategoriaRow
                    key={`${c.nombre}-${anio}-${mes}`}
                    c={c}
                    detalle={arbol?.categorias.find(a => a.nombre === c.nombre) ?? null}
                    cargandoArbol={cargandoArbol}
                  />
                ))}
              </div>
            </Card>
          </div>
        )}

        {tendencias?.mensual && (
          <Card>
            <SectionHeader title="Gasto total vs. límite" sub="% usado por mes, histórico" />
            <Sparkline serie={tendencias.mensual.map(m => ({ pct: m.pct }))} />
          </Card>
        )}
      </div>

      {tendencias?.porCategoria && (
        <Card>
          <SectionHeader title="Tendencia — top 4 categorías" sub="% del límite mensual usado, mes a mes (histórico de BudgetSnapshot)" />
          <div className="grid grid-cols-4 gap-8">
            {tendencias.porCategoria.map(c => (
              <div key={c.nombre}>
                <p className="text-sm font-bold text-gray-700 mb-2">{c.nombre}</p>
                <Sparkline serie={c.serie} />
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
