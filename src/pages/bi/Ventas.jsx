import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { formatMoney } from '../../utils/formatters'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { llamar, CRITICAL, GOLD_RAMP, DIAS } from './shared'
import { Card, SectionHeader, PageHeader, DeltaPill, LoadingState, ErrorState } from './ui'

function formatK(n) {
  if (n == null) return '—'
  return `$${(n / 1000).toFixed(0)}k`
}

function YoYChart({ serie, promedioGeneral }) {
  const [hover, setHover] = useState(null)
  const valores = serie.flatMap(s => [s.actual ?? 0, s.anterior ?? 0])
  // headroom del 12% para que la barra más alta no toque el borde del área
  const max = Math.max(...valores, promedioGeneral ?? 0, 1) * 1.12
  const alturaPromedio = promedioGeneral != null ? (promedioGeneral / max) * 100 : null

  return (
    <div>
      <div className="flex gap-3 mb-2">
        {serie.map((s, i) => {
          const yoyPct = s.anterior ? ((s.actual - s.anterior) / s.anterior) * 100 : null
          return (
            <div key={i} className="flex-1 flex justify-center">
              <DeltaPill pct={yoyPct} suffix=" YoY" />
            </div>
          )
        })}
      </div>
      <div className="relative h-60">
        {alturaPromedio != null && (
          <div
            className="absolute left-0 right-0 border-t-2 border-dashed z-10"
            style={{ bottom: `${alturaPromedio}%`, borderColor: CRITICAL }}
          >
            <span className="absolute right-0 -translate-y-1/2 text-[10px] font-bold bg-white pl-1.5" style={{ color: CRITICAL }}>
              Promedio general: {formatK(promedioGeneral)}
            </span>
          </div>
        )}
        <div className="absolute inset-0 flex items-end gap-3">
          {serie.map((s, i) => (
            <div key={s.mes} className="flex-1 h-full flex items-end justify-center gap-1">
              {[
                { key: 'actual', val: s.actual, color: GOLD_RAMP[1], text: '#ffffff' },
                { key: 'anterior', val: s.anterior, color: '#d1d5db', text: '#4b5563' },
              ].map(bar => {
                const h = Math.max(((bar.val ?? 0) / max) * 100, bar.val ? 8 : 0)
                return (
                  <div
                    key={bar.key}
                    className="flex-1 relative rounded-t cursor-pointer transition-opacity"
                    style={{ height: `${h}%`, background: bar.color, opacity: hover === `${i}-${bar.key}` ? 0.75 : 1 }}
                    onMouseEnter={() => setHover(`${i}-${bar.key}`)}
                    onMouseLeave={() => setHover(null)}
                  >
                    {bar.val != null && (
                      <span
                        className="absolute top-1/2 left-0 right-0 -translate-y-1/2 text-center text-[9px] font-bold whitespace-nowrap"
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
      <div className="flex gap-3 mt-2">
        {serie.map(s => (
          <div key={s.mes} className="flex-1 text-center text-[10px] text-gray-400 font-medium">{s.mes}</div>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
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

function TendenciaChart({ data }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(...data.map(d => d.ventaNeta), 1)

  return (
    <div>
      <div className="relative flex items-end gap-1.5 h-52">
        {data.map((d, i) => {
          const h = Math.max((d.ventaNeta / max) * 100, 4)
          return (
            <div
              key={d.fecha}
              className="flex-1 h-full flex flex-col justify-end items-center relative cursor-pointer"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {hover === i && (
                <div className="absolute -top-2 -translate-y-full z-10 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg pointer-events-none">
                  <p className="font-semibold">{format(new Date(d.fecha), "EEEE d MMM", { locale: es })}</p>
                  <p className="text-gray-300">
                    {formatMoney(d.ventaNeta)}
                    {d.diferenciaPct != null && (
                      <span className="ml-1" style={{ color: d.buenDia ? '#4ade80' : '#f87171' }}>
                        ({d.diferenciaPct >= 0 ? '+' : ''}{d.diferenciaPct.toFixed(0)}%)
                      </span>
                    )}
                  </p>
                </div>
              )}
              <div
                className="w-full rounded-t transition-opacity"
                style={{
                  height: `${h}%`,
                  background: d.buenDia == null ? '#e5e7eb' : d.buenDia ? GOLD_RAMP[1] : '#e5e7eb',
                  opacity: hover === i ? 0.75 : 1,
                }}
              />
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
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
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

export default function BIVentas() {
  const [data, setData] = useState(null)
  const [anual, setAnual] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.allSettled([llamar('resumen-ventas'), llamar('resumen-ventas-anual')]).then(([r1, r2]) => {
      if (r1.status === 'fulfilled') setData(r1.value)
      if (r2.status === 'fulfilled') setAnual(r2.value)
      setError(r1.status === 'rejected' ? r1.reason.message : r2.status === 'rejected' ? r2.reason.message : '')
      setLoading(false)
    })
  }, [])

  const ayer = data?.ayer

  return (
    <div className="w-full px-8 py-8 max-w-[1600px] mx-auto space-y-8">
      <div>
        <Link to="/business-intelligence" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-700 mb-3 transition-colors">
          <ArrowLeft size={15} /> Business Intelligence
        </Link>
        <PageHeader title="Ventas" sub="Desempeño diario y tendencia contra el histórico" />
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
            vs. promedio histórico de {DIAS[ayer.diaSemana]}: {formatMoney(ayer.promedioVenta)}
          </p>
          <div className="grid grid-cols-3 gap-6 mt-6 pt-6 border-t border-gray-100">
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

      {data?.tendencia && (
        <Card>
          <SectionHeader title="Últimos 14 días" sub="Venta neta diaria, comparada contra el promedio histórico de cada día de la semana" />
          <TendenciaChart data={data.tendencia} />
        </Card>
      )}

      {anual?.serie && (
        <Card>
          <SectionHeader title="Venta promedio mensual — año contra año" sub="Últimos 12 meses vs. el mismo mes del año anterior, con el promedio general como referencia" />
          <YoYChart serie={anual.serie} promedioGeneral={anual.promedioGeneral} />
        </Card>
      )}
    </div>
  )
}
