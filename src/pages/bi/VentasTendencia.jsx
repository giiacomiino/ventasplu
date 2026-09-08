import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, UploadCloud } from 'lucide-react'
import { formatMoney } from '../../utils/formatters'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { llamar, CRITICAL, WARNING, GOLD_RAMP, DIAS } from './shared'
import { Card, SectionHeader, PageHeader, KpiTile, DeltaPill, LoadingState, ErrorState } from './ui'
import { useMesSeleccionado, SelectorMes } from './mesContext'

const DIAS_CORTOS = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const METRICAS = [
  { key: 'venta_neta', label: 'Venta neta', formato: 'dinero' },
  { key: 'venta_bruta', label: 'Venta bruta (con IVA)', formato: 'dinero' },
  { key: 'cortesias', label: 'Cortesías', formato: 'dinero' },
  { key: 'cancelaciones', label: 'Cancelaciones', formato: 'dinero' },
  { key: 'ticket_promedio', label: 'Ticket promedio', formato: 'dinero' },
  { key: 'clientes', label: 'Clientes', formato: 'entero' },
  { key: 'cuentas', label: 'Cuentas', formato: 'entero' },
]

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

function YoYChart({ serie, promedioGeneral }) {
  const [hover, setHover] = useState(null)
  const valores = serie.flatMap(s => [s.actual ?? 0, s.anterior ?? 0])
  // headroom del 12% para que la barra más alta no toque el borde del área
  const max = Math.max(...valores, promedioGeneral ?? 0, 1) * 1.12
  const alturaPromedio = promedioGeneral != null ? (promedioGeneral / max) * 100 : null

  return (
    <div>
    <div className="overflow-x-auto -mx-1 px-1">
    <div style={{ minWidth: `${Math.max(serie.length * 90, 360)}px` }}>
      <div className="flex gap-1 sm:gap-3 mb-2">
        {serie.map((s, i) => {
          const yoyPct = s.anterior ? ((s.actual - s.anterior) / s.anterior) * 100 : null
          return (
            <div key={i} className="flex-1 flex justify-center">
              <DeltaPill pct={yoyPct} suffix=" YoY" />
            </div>
          )
        })}
      </div>
      <div className="relative h-64">
        {alturaPromedio != null && (
          <div
            className="absolute left-0 right-0 border-t-2 border-dashed z-10"
            style={{ bottom: `${alturaPromedio}%`, borderColor: CRITICAL }}
          >
            <span className="absolute right-0 -translate-y-1/2 text-[10px] font-bold bg-white pl-1.5 tabular-nums" style={{ color: CRITICAL }}>
              Promedio general: {formatK(promedioGeneral)}
            </span>
          </div>
        )}
        <div className="absolute inset-0 flex items-end gap-3">
          {serie.map((s, i) => (
            <div key={s.mes} className="flex-1 h-full flex items-end justify-center gap-1">
              {[
                { key: 'actual', val: s.actual, color: GOLD_RAMP[1], text: '#ffffff', etiqueta: 'Este año' },
                { key: 'anterior', val: s.anterior, color: '#d1d5db', text: '#4b5563', etiqueta: 'Año anterior' },
              ].map(bar => {
                const h = Math.max(((bar.val ?? 0) / max) * 100, bar.val ? 8 : 0)
                const key = `${i}-${bar.key}`
                return (
                  <div
                    key={bar.key}
                    className="flex-1 relative rounded-t cursor-pointer transition-opacity"
                    style={{ height: `${h}%`, background: bar.color, opacity: hover === key ? 0.75 : 1 }}
                    onMouseEnter={() => setHover(key)}
                    onMouseLeave={() => setHover(null)}
                  >
                    {hover === key && (
                      <Tooltip>
                        <p className="font-semibold">{s.mes} · {bar.etiqueta}</p>
                        <p className="text-gray-300 tabular-nums">{formatMoney(bar.val)}</p>
                      </Tooltip>
                    )}
                    {bar.val != null && (
                      <span
                        className="absolute top-1/2 left-0 right-0 -translate-y-1/2 text-center text-[11px] font-bold whitespace-nowrap tabular-nums"
                        style={{ color: bar.text }}
                      >
                        {formatK(bar.val)}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-1 sm:gap-3 mt-2">
        {serie.map(s => (
          <div key={s.mes} className="flex-1 text-center text-[10px] text-gray-400 font-medium">{s.mes}</div>
        ))}
      </div>
    </div>
    </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: GOLD_RAMP[1] }} /> Venta promedio del mes
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-gray-300" /> Mismo mes, año anterior (YoY)
        </span>
      </div>
    </div>
  )
}

// Igual que YoYChart, pero con la métrica seleccionable por el usuario y
// mostrando el YoY en monto Y en porcentaje al mismo tiempo (YoYChart solo
// trae venta neta y solo el %). Venta neta se arma fusionando Bubble
// (histórico) con Supabase (lo capturado con el reporte Sierra en
// adelante); las demás métricas son nuevas y solo tienen lo que se ha
// subido — por eso se ven "vacías" en los meses de antes.
function MetricaMensualChart({ serie, promedioGeneral, formato }) {
  const [hover, setHover] = useState(null)
  const fmt = v => v == null ? '—' : formato === 'entero' ? Math.round(v).toLocaleString('es-MX') : formatK(v)
  const fmtCompleto = v => formato === 'entero' ? Math.round(v).toLocaleString('es-MX') : formatMoney(v)
  const valores = serie.flatMap(s => [s.actual ?? 0, s.anterior ?? 0])
  const max = Math.max(...valores, promedioGeneral ?? 0, 1) * 1.15
  const alturaPromedio = promedioGeneral != null ? (promedioGeneral / max) * 100 : null

  return (
    <div>
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="min-w-[820px]">
          <div className="flex gap-1 sm:gap-3 mb-2">
            {serie.map((s, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                <DeltaPill pct={s.deltaPct} suffix=" YoY" compact />
                {s.deltaMonto != null && (
                  <span className={`text-[10px] font-semibold tabular-nums ${s.deltaMonto >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {s.deltaMonto >= 0 ? '+' : ''}{fmt(s.deltaMonto)}
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="relative h-56">
            {alturaPromedio != null && (
              <div className="absolute left-0 right-0 border-t-2 border-dashed z-10" style={{ bottom: `${alturaPromedio}%`, borderColor: '#9ca3af' }}>
                <span className="absolute right-0 -translate-y-1/2 text-[10px] font-bold text-gray-500 bg-white pl-1.5 tabular-nums">Prom. {fmt(promedioGeneral)}</span>
              </div>
            )}
            <div className="absolute inset-0 flex items-end gap-3">
              {serie.map((s, i) => (
                <div key={s.mes} className="flex-1 h-full flex items-end justify-center gap-1">
                  {[
                    { key: 'actual', val: s.actual, color: GOLD_RAMP[1], text: '#ffffff', etiqueta: 'Este año' },
                    { key: 'anterior', val: s.anterior, color: '#d1d5db', text: '#4b5563', etiqueta: 'Año anterior' },
                  ].map(bar => {
                    const h = Math.max(((bar.val ?? 0) / max) * 100, bar.val ? 6 : 0)
                    const key = `${i}-${bar.key}`
                    return (
                      <div
                        key={bar.key}
                        className="flex-1 relative rounded-t cursor-pointer transition-opacity"
                        style={{ height: `${h}%`, background: bar.color, opacity: hover === key ? 0.75 : 1 }}
                        onMouseEnter={() => setHover(key)}
                        onMouseLeave={() => setHover(null)}
                      >
                        {hover === key && (
                          <Tooltip>
                            <p className="font-semibold">{s.mes} · {bar.etiqueta}</p>
                            <p className="text-gray-300 tabular-nums">{bar.val == null ? 'Sin datos' : fmtCompleto(bar.val)}</p>
                          </Tooltip>
                        )}
                        {bar.val != null && (
                          <span className="absolute top-1/2 left-0 right-0 -translate-y-1/2 text-center text-[10px] font-bold whitespace-nowrap tabular-nums" style={{ color: bar.text }}>
                            {fmt(bar.val)}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-1 sm:gap-3 mt-2">
            {serie.map(s => (
              <div key={s.mes} className="flex-1 text-center text-[10px] text-gray-400 font-medium">{s.mes}</div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: GOLD_RAMP[1] }} /> Este año</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-gray-300" /> Año anterior</span>
      </div>
    </div>
  )
}

function TendenciaChart({ data }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(...data.map(d => d.ventaNeta), 1) * 1.1

  return (
    <div>
      <div className="overflow-x-auto -mx-1 px-1">
        <div style={{ minWidth: `${Math.max(data.length * 34, 640)}px` }}>
          <div className="relative flex items-end gap-1.5 h-56">
            {data.map((d, i) => {
              const h = Math.max((d.ventaNeta / max) * 100, 8)
              const bueno = d.buenDia
              return (
                <div
                  key={d.fecha}
                  className="flex-1 h-full flex flex-col justify-end items-center relative cursor-pointer"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                >
                  {hover === i && (
                    <Tooltip>
                      <p className="font-semibold">{format(new Date(d.fecha), "EEEE d MMM", { locale: es })}</p>
                      <p className="text-gray-300 tabular-nums">
                        {formatMoney(d.ventaNeta)}
                        {d.diferenciaPct != null && (
                          <span className="ml-1" style={{ color: d.buenDia ? '#4ade80' : '#f87171' }}>
                            ({d.diferenciaPct >= 0 ? '+' : ''}{d.diferenciaPct.toFixed(0)}%)
                          </span>
                        )}
                      </p>
                    </Tooltip>
                  )}
                  <div
                    className="w-full relative rounded-t transition-opacity"
                    style={{
                      height: `${h}%`,
                      background: bueno == null ? '#e5e7eb' : bueno ? GOLD_RAMP[1] : '#e5e7eb',
                      opacity: hover === i ? 0.75 : 1,
                    }}
                  >
                    <span
                      className="absolute top-1/2 left-0 right-0 -translate-y-1/2 text-center text-[10px] font-bold whitespace-nowrap tabular-nums"
                      style={{ color: bueno ? '#ffffff' : '#6b7280' }}
                    >
                      {formatK(d.ventaNeta)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex gap-1.5 mt-1.5">
            {data.map(d => (
              <div key={d.fecha} className="flex-1 text-center text-[10px] text-gray-400">
                {format(new Date(d.fecha), 'd')}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: GOLD_RAMP[1] }} /> Arriba del promedio de su día
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-gray-200" /> Abajo del promedio
        </span>
      </div>
    </div>
  )
}

// Serie diaria de lo que se ha capturado con el reporte de venta Sierra —
// solo tiene los días subidos hasta ahora (no hay histórico), pero trae
// datos que Bubble nunca tuvo: cancelaciones marcadas encima de la barra.
function SerieDiariaChart({ serie }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(...serie.map(d => d.venta_neta || 0), 1) * 1.15

  return (
    <div>
      <div className="relative flex items-end gap-1.5 h-56">
        {serie.map((d, i) => {
          const h = Math.max(((d.venta_neta || 0) / max) * 100, d.venta_neta ? 8 : 0)
          return (
            <div
              key={d.fecha}
              className="flex-1 h-full flex flex-col justify-end items-center relative cursor-pointer"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {hover === i && (
                <Tooltip>
                  <p className="font-semibold">{format(new Date(`${d.fecha}T12:00:00`), "EEEE d MMM", { locale: es })}</p>
                  <p className="text-gray-300 tabular-nums">Venta neta: {formatMoney(d.venta_neta)}</p>
                  {d.ticket_promedio != null && <p className="text-gray-300 tabular-nums">Ticket promedio: {formatMoney(d.ticket_promedio)}</p>}
                  {d.cancelaciones > 0 && <p className="text-red-300 tabular-nums">Cancelaciones: {formatMoney(d.cancelaciones)}</p>}
                </Tooltip>
              )}
              {d.cancelaciones > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 mb-1 flex-shrink-0" title="Hubo cancelaciones ese día" />
              )}
              <div
                className="w-full relative rounded-t transition-opacity"
                style={{ height: `${h}%`, background: GOLD_RAMP[1], opacity: hover === i ? 0.75 : 1 }}
              >
                <span className="absolute top-1/2 left-0 right-0 -translate-y-1/2 text-center text-[10px] font-bold text-white whitespace-nowrap tabular-nums">
                  {formatK(d.venta_neta)}
                </span>
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex gap-1.5 mt-1.5">
        {serie.map(d => (
          <div key={d.fecha} className="flex-1 text-center text-[10px] text-gray-400">
            {format(new Date(`${d.fecha}T12:00:00`), 'd MMM')}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400" /> Hubo cancelaciones ese día
      </div>
    </div>
  )
}

function MixDonut({ items, palette }) {
  const [hover, setHover] = useState(null)
  const total = items.reduce((s, i) => s + i.monto, 0)
  if (items.length === 0 || !total) return <p className="text-xs text-gray-300 py-8 text-center">Sin datos todavía</p>

  const R = 58, ri = 38, cx = 68, cy = 68
  let angle = -Math.PI / 2
  const slices = items.map((item, i) => {
    const pct = item.monto / total
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
    return { ...item, d, pct, color: palette[i % palette.length], idx: i }
  })

  return (
    <div className="flex flex-col items-center gap-4">
      <svg viewBox="0 0 136 136" width={128} height={128} className="flex-shrink-0">
        {slices.map(s => (
          <path
            key={s.nombre} d={s.d} fill={s.color} stroke="white" strokeWidth={2}
            opacity={hover === null || hover === s.idx ? 1 : 0.4}
            className="cursor-pointer transition-opacity"
            onMouseEnter={() => setHover(s.idx)} onMouseLeave={() => setHover(null)}
          />
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" fill="#111827" fontSize={13} fontWeight="700" className="tabular-nums">{formatK(total)}</text>
        <text x={cx} y={cy + 11} textAnchor="middle" fill="#9ca3af" fontSize={8}>total</text>
      </svg>
      <div className="w-full space-y-1.5 min-w-0">
        {slices.map(s => (
          <div
            key={s.nombre}
            className={`flex items-center gap-2 text-xs rounded px-1 py-0.5 transition-colors ${hover === s.idx ? 'bg-gray-50' : ''}`}
            onMouseEnter={() => setHover(s.idx)} onMouseLeave={() => setHover(null)}
          >
            <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: s.color }} />
            <span className="text-gray-600 truncate flex-1">{s.nombre}</span>
            <span className="text-gray-700 font-semibold tabular-nums flex-shrink-0">{formatMoney(s.monto)}</span>
            <span className="text-gray-400 tabular-nums w-10 text-right flex-shrink-0">{(s.pct * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const PALETA_ZONAS = [WARNING, '#9ca3af', '#c49a2e', '#d1d5db']
const PALETA_PAGOS = ['#5b7fb8', '#8a5a3a', '#c49a2e', '#6b9080', '#9ca3af', '#d1d5db']

function DiaSemanaChart({ porDiaSemana }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(...porDiaSemana.flatMap(d => [d.promedioReal ?? 0, d.promedioHistorico ?? 0]), 1) * 1.15

  return (
    <div>
      <div className="relative flex items-end gap-1 sm:gap-4 h-56">
        {porDiaSemana.map((d, i) => {
          const real = d.promedioReal ?? 0
          const hist = d.promedioHistorico ?? 0
          const alturaReal = Math.max((real / max) * 100, real ? 8 : 0)
          const alturaHist = (hist / max) * 100
          const faltante = Math.max(alturaHist - alturaReal, 0)
          return (
            <div
              key={d.diaSemana}
              className="flex-1 h-full flex flex-col justify-end items-center relative cursor-pointer"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {hover === i && (
                <Tooltip>
                  <p className="font-semibold">{DIAS[d.diaSemana]}</p>
                  <p className="text-gray-300 tabular-nums">Promedio del mes: {formatMoney(real)}</p>
                  <p className="text-gray-300 tabular-nums">Promedio histórico: {formatMoney(hist)}</p>
                </Tooltip>
              )}
              {faltante > 0 && (
                <div
                  className="w-full rounded-t border-2 border-dashed border-b-0"
                  style={{ height: `${faltante}%`, borderColor: GOLD_RAMP[1] }}
                />
              )}
              <div
                className="w-full relative"
                style={{
                  height: `${alturaReal}%`,
                  background: GOLD_RAMP[1],
                  borderRadius: faltante > 0 ? '0' : '0.25rem 0.25rem 0 0',
                }}
              >
                {real > 0 && (
                  <span className="absolute top-1/2 left-0 right-0 -translate-y-1/2 text-center text-[10px] font-bold text-white whitespace-nowrap tabular-nums">
                    {formatK(real)}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex gap-1 sm:gap-4 mt-1.5">
        {porDiaSemana.map(d => (
          <div key={d.diaSemana} className="flex-1 text-center text-[10px] text-gray-400 font-medium">
            {DIAS_CORTOS[d.diaSemana]}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: GOLD_RAMP[1] }} /> Promedio real del mes
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm border-2 border-dashed" style={{ borderColor: GOLD_RAMP[1] }} /> Falta para el promedio histórico
        </span>
      </div>
    </div>
  )
}

export default function BIVentasTendencia() {
  const { anio, mes } = useMesSeleccionado()
  const [data, setData] = useState(null)
  const [anual, setAnual] = useState(null)
  const [insights, setInsights] = useState(null)
  const [metrica, setMetrica] = useState('venta_neta')
  const [tendenciaMetrica, setTendenciaMetrica] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.allSettled([llamar('resumen-ventas', { anio, mes }), llamar('resumen-ventas-anual')]).then(([r1, r2]) => {
      if (r1.status === 'fulfilled') setData(r1.value)
      if (r2.status === 'fulfilled') setAnual(r2.value)
      setError(r1.status === 'rejected' ? r1.reason.message : r2.status === 'rejected' ? r2.reason.message : '')
      setLoading(false)
    })
  }, [anio, mes])

  useEffect(() => {
    setInsights(null)
    llamar('insights-venta-diaria', { anio, mes }).then(setInsights).catch(() => {})
  }, [anio, mes])

  useEffect(() => {
    setTendenciaMetrica(null)
    llamar('tendencia-metrica-mensual', { metrica }).then(setTendenciaMetrica).catch(() => {})
  }, [metrica])

  const metricaInfo = METRICAS.find(m => m.key === metrica)

  const ayer = data?.ayer
  const mtd = data?.mtd

  return (
    <div className="w-full px-4 py-4 sm:px-8 sm:py-8 max-w-[1600px] mx-auto space-y-8">
      <div>
        <Link to="/ventas" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-700 mb-3 transition-colors">
          <ArrowLeft size={15} /> Ventas
        </Link>
        <PageHeader
          title="Tendencia de venta"
          sub="Desempeño diario y tendencia contra el histórico"
          right={
            <div className="flex items-center gap-2">
              <Link
                to="/ventas/reporte-diario"
                className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-500 hover:bg-gray-50 transition-colors"
              >
                <UploadCloud size={14} /> Subir reporte diario
              </Link>
              <SelectorMes />
            </div>
          }
        />
      </div>

      {loading && <LoadingState>Cargando...</LoadingState>}
      {error && <ErrorState message={error} />}

      {ayer && (
        <Card>
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
            Ayer · {DIAS[ayer.diaSemana]} {format(new Date(ayer.fecha), "d 'de' MMMM", { locale: es })}
          </p>
          <div className="flex items-baseline gap-3">
            <p className="text-3xl font-bold text-gray-900 tabular-nums">{formatMoney(ayer.ventaNeta)}</p>
            <DeltaPill pct={ayer.diferenciaPct} />
          </div>
          <p className="text-sm text-gray-400 mt-1.5">
            vs. promedio histórico de {DIAS[ayer.diaSemana]}: <span className="tabular-nums">{formatMoney(ayer.promedioVenta)}</span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-6 pt-6 border-t border-gray-100">
            <div>
              <p className="text-xs text-gray-400 mb-1">Personas</p>
              <p className="text-lg font-bold text-gray-800 tabular-nums">{Math.round(ayer.personas)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Ticket promedio</p>
              <p className="text-lg font-bold text-gray-800 tabular-nums">{formatMoney(ayer.ticketPromedio)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Venta bruta</p>
              <p className="text-lg font-bold text-gray-800 tabular-nums">{formatMoney(ayer.ventaBruta)}</p>
            </div>
          </div>
        </Card>
      )}

      {mtd && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {mtd.esMesActual ? (
            <>
              <KpiTile
                label="Proyección de cierre del mes"
                value={formatMoney(mtd.proyeccionCierreMes)}
                sub={`MTD real ${formatMoney(mtd.ventaNeta)} + promedio histórico por día de la semana de lo que falta del mes`}
              />
              <KpiTile
                label="Mismo mes, año anterior (real)"
                value={mtd.ventaTotalMesAnioAnterior ? formatMoney(mtd.ventaTotalMesAnioAnterior) : '—'}
                sub="con lo que se compara la proyección de cierre"
                delta={<DeltaPill pct={mtd.proyeccionVsAnioAnteriorPct} suffix=" vs. proyección" />}
              />
            </>
          ) : (
            <>
              <KpiTile
                label="Venta neta del mes (cerrado)"
                value={formatMoney(mtd.ventaNeta)}
                sub="mes completo, ya cerrado"
                delta={<DeltaPill pct={mtd.momPct} suffix=" vs. mes anterior" />}
              />
              <KpiTile
                label="Mismo mes, año anterior (real)"
                value={mtd.ventaTotalMesAnioAnterior ? formatMoney(mtd.ventaTotalMesAnioAnterior) : '—'}
                sub="comparación año contra año"
                delta={<DeltaPill pct={mtd.yoyPct} suffix=" YoY" />}
              />
            </>
          )}
        </div>
      )}

      {data?.tendenciaMes && (
        <Card>
          <SectionHeader
            title={data.mtd?.esMesActual ? 'Últimos 30 días' : `Mes completo — ${data.tendenciaMes.length} días`}
            sub="Venta neta diaria, comparada contra el promedio histórico de cada día de la semana"
          />
          <TendenciaChart data={data.tendenciaMes} />
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {data?.porDiaSemana && (
          <Card>
            <SectionHeader
              title="Venta promedio por día de la semana"
              sub="Promedio real de este mes vs. el promedio histórico de cada día — el punteado marca lo que falta para alcanzarlo"
            />
            <DiaSemanaChart porDiaSemana={data.porDiaSemana} />
          </Card>
        )}

        {anual?.serie && (
          <Card>
            <SectionHeader title="Venta promedio mensual — año contra año" sub="Últimos 6 meses vs. el mismo mes del año anterior, con el promedio general como referencia" />
            <YoYChart serie={anual.serie.slice(-6)} promedioGeneral={anual.promedioGeneral} />
          </Card>
        )}
      </div>

      <Card>
        <SectionHeader
          title="Tendencia por métrica — últimos 12 meses"
          sub="Venta neta fusiona Bubble + lo capturado con el reporte Sierra; las demás solo tienen los días ya subidos"
          right={
            <select
              value={metrica} onChange={e => setMetrica(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white font-semibold text-gray-700"
            >
              {METRICAS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          }
        />
        {tendenciaMetrica ? (
          <MetricaMensualChart serie={tendenciaMetrica.serie} promedioGeneral={tendenciaMetrica.promedioGeneral} formato={metricaInfo.formato} />
        ) : (
          <p className="text-xs text-gray-300 py-8 text-center">Cargando...</p>
        )}
      </Card>

      {insights && insights.dias > 0 && (
        <>
          <div>
            <SectionHeader
              title="Detalle del reporte de venta diaria"
              sub={`${insights.dias} día${insights.dias === 1 ? '' : 's'} capturado${insights.dias === 1 ? '' : 's'} del mes seleccionado — cancelaciones, ticket promedio y mix que Bubble no tenía`}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
            <KpiTile
              label="Cancelaciones (periodo)"
              value={formatMoney(insights.totales.cancelaciones)}
              sub={`${insights.dias} día${insights.dias === 1 ? '' : 's'} capturados`}
            />
            <KpiTile
              label="Cortesías / venta neta"
              value={insights.totales.cortesiasPct != null ? `${(insights.totales.cortesiasPct * 100).toFixed(1)}%` : '—'}
              sub={formatMoney(insights.totales.cortesias)}
            />
            <KpiTile
              label="Ticket promedio"
              value={insights.totales.ticketPromedio != null ? formatMoney(insights.totales.ticketPromedio) : '—'}
              sub="promedio del periodo capturado"
            />
          </div>

          <Card>
            <SectionHeader title="Venta neta por día" sub="Punto rojo arriba de la barra = hubo cancelaciones ese día" />
            <SerieDiariaChart serie={insights.serieDiaria} />
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <Card>
              <SectionHeader title="Mix por categoría" sub="% de venta" />
              <MixDonut items={insights.mixCategorias} palette={GOLD_RAMP} />
            </Card>
            <Card>
              <SectionHeader title="Comedor vs. para llevar" sub="% de venta por zona" />
              <MixDonut items={insights.mixZonas} palette={PALETA_ZONAS} />
            </Card>
            <Card>
              <SectionHeader title="Formas de pago" sub="% del cobrado" />
              <MixDonut items={insights.mixPagos} palette={PALETA_PAGOS} />
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
