import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatMoney } from '../../utils/formatters'
import { llamar, GOLD_RAMP, DIAS } from './shared'
import { Card, SectionHeader, PageHeader, KpiTile, LoadingState, ErrorState, EmptyState } from './ui'

const DIAS_CORTOS = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function Tooltip({ children }) {
  return (
    <div className="absolute -top-2 -translate-y-full z-20 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg pointer-events-none left-1/2 -translate-x-1/2">
      {children}
    </div>
  )
}

function formatK(n) {
  if (n == null) return '—'
  return `$${(n / 1000).toFixed(0)}k`
}

function SelectorAnio({ anio, setAnio }) {
  const anioActual = new Date().getFullYear()
  return (
    <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
      <button onClick={() => setAnio(a => a - 1)} className="text-gray-400 hover:text-gold-700 p-1"><ChevronLeft size={15} /></button>
      <span className="text-sm font-semibold text-gray-700 min-w-[50px] text-center">{anio}</span>
      <button onClick={() => setAnio(a => a + 1)} disabled={anio >= anioActual} className="text-gray-400 hover:text-gold-700 p-1 disabled:opacity-30">
        <ChevronRight size={15} />
      </button>
    </div>
  )
}

function MensualChart({ serie, color, mesSeleccionado, onClickMes }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(...serie.map(m => m.total), 1) * 1.15
  const hayFiltro = mesSeleccionado != null

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div style={{ minWidth: '720px' }}>
        <div className="relative h-56 flex items-end gap-2">
          {serie.map((m, i) => {
            const h = Math.max((m.total / max) * 100, m.total ? 4 : 0)
            const seleccionado = mesSeleccionado === i
            return (
              <div
                key={m.mes} className="flex-1 h-full flex flex-col justify-end items-center relative cursor-pointer"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                onClick={() => onClickMes(i)}
              >
                {hover === i && <Tooltip><p className="font-semibold capitalize">{m.mes}</p><p className="text-gray-300 tabular-nums">{formatMoney(m.total)}</p></Tooltip>}
                <div
                  className="w-full relative rounded-t transition-opacity"
                  style={{
                    height: `${h}%`,
                    background: color,
                    opacity: seleccionado ? 1 : hayFiltro ? 0.3 : hover === i ? 0.75 : 1,
                    outline: seleccionado ? `2px solid ${color}` : 'none',
                    outlineOffset: 2,
                  }}
                >
                  {m.total > 0 && (
                    <span className="absolute top-1/2 left-0 right-0 -translate-y-1/2 text-center text-[10px] font-bold text-white whitespace-nowrap tabular-nums">
                      {formatK(m.total)}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex gap-2 mt-2">
          {serie.map((m, i) => (
            <div key={m.mes} className={`flex-1 text-center text-[10px] font-medium capitalize ${mesSeleccionado === i ? 'text-gray-700 font-bold' : 'text-gray-400'}`}>{m.mes}</div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Detalle día por día de UN mes — se muestra al hacer click en una barra
// de MensualChart. Reusa serieDiaria (ya viene completa del año en la
// misma respuesta), solo se filtra al mes elegido.
function DiariaMesChart({ dias, color }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(...dias.map(d => d.valor ?? 0), 1) * 1.15

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div style={{ minWidth: `${Math.max(dias.length * 24, 480)}px` }}>
        <div className="relative h-48 flex items-end gap-1">
          {dias.map((d, i) => {
            const valor = d.valor ?? 0
            const h = Math.max((valor / max) * 100, valor ? 4 : 0)
            return (
              <div
                key={d.fecha} className="flex-1 h-full flex flex-col justify-end items-center relative cursor-pointer"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              >
                {hover === i && (
                  <Tooltip>
                    <p className="font-semibold capitalize">{format(new Date(`${d.fecha}T12:00:00`), "EEEE d 'de' MMMM", { locale: es })}</p>
                    <p className="text-gray-300 tabular-nums">{formatMoney(valor)}</p>
                  </Tooltip>
                )}
                <div className="w-full rounded-t transition-opacity" style={{ height: `${h}%`, background: color, opacity: hover === i ? 0.75 : 1 }} />
              </div>
            )
          })}
        </div>
        <div className="flex gap-1 mt-2">
          {dias.map(d => (
            <div key={d.fecha} className="flex-1 text-center text-[9px] text-gray-300 font-medium tabular-nums">{Number(d.fecha.slice(8, 10))}</div>
          ))}
        </div>
      </div>
    </div>
  )
}

function DiaSemanaChart({ porDiaSemana, color }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(...porDiaSemana.map(d => d.promedio ?? 0), 1) * 1.15

  return (
    <div className="relative h-48 flex items-end gap-2 sm:gap-4">
      {porDiaSemana.map((d, i) => {
        const h = Math.max(((d.promedio ?? 0) / max) * 100, d.promedio ? 4 : 0)
        return (
          <div
            key={d.diaSemana} className="flex-1 h-full flex flex-col justify-end items-center relative cursor-pointer"
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
          >
            {hover === i && <Tooltip><p className="font-semibold">{DIAS[d.diaSemana]}</p><p className="text-gray-300 tabular-nums">Promedio: {formatMoney(d.promedio)}</p></Tooltip>}
            <div className="w-full relative rounded-t transition-opacity" style={{ height: `${h}%`, background: color, opacity: hover === i ? 0.75 : 1 }}>
              {d.promedio > 0 && (
                <span className="absolute top-1/2 left-0 right-0 -translate-y-1/2 text-center text-[10px] font-bold text-white whitespace-nowrap tabular-nums">
                  {formatK(d.promedio)}
                </span>
              )}
            </div>
            <p className="text-[10px] text-gray-400 font-medium mt-1.5">{DIAS_CORTOS[d.diaSemana]}</p>
          </div>
        )
      })}
    </div>
  )
}

export function DetalleMetrica({ campo, titulo, sub, color = GOLD_RAMP[1] }) {
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [mesSeleccionado, setMesSeleccionado] = useState(null)

  useEffect(() => {
    setLoading(true)
    setMesSeleccionado(null)
    llamar('detalle-metrica-venta', { campo, anio }).then(setDatos).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [campo, anio])

  const diasDelMes = mesSeleccionado != null && datos
    ? datos.serieDiaria.filter(d => Number(d.fecha.slice(5, 7)) - 1 === mesSeleccionado)
    : []
  const nombreMes = mesSeleccionado != null
    ? format(new Date(Date.UTC(anio, mesSeleccionado, 1)), 'MMMM yyyy', { locale: es })
    : ''

  return (
    <div className="w-full px-4 py-4 sm:px-8 sm:py-8 max-w-[1400px] mx-auto space-y-6">
      <div>
        <Link to="/ventas" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-700 mb-3 transition-colors">
          <ArrowLeft size={15} /> Ventas
        </Link>
        <PageHeader title={titulo} sub={sub} right={<SelectorAnio anio={anio} setAnio={setAnio} />} />
      </div>

      {loading && <LoadingState>Cargando...</LoadingState>}
      {error && <ErrorState message={error} />}

      {datos && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
            <KpiTile label={`Total ${datos.anio}`} value={formatMoney(datos.totales.suma)} sub={`${datos.totales.diasConValor} días con registro`} />
            <KpiTile label="Promedio por día" value={datos.totales.promedio != null ? formatMoney(datos.totales.promedio) : '—'} sub="solo días con registro" />
            <KpiTile label="% de la venta neta" value={datos.totales.pctDeVenta != null ? `${(datos.totales.pctDeVenta * 100).toFixed(2)}%` : '—'} sub="del año" />
            <KpiTile
              label="Día con más"
              value={datos.totales.maxDia ? formatMoney(datos.totales.maxDia.valor) : '—'}
              sub={datos.totales.maxDia ? format(new Date(`${datos.totales.maxDia.fecha}T12:00:00`), "d MMM yyyy", { locale: es }) : ''}
            />
          </div>

          <Card>
            <SectionHeader title={`${titulo} por mes`} sub={`Año ${datos.anio} — click en un mes para ver el detalle por día`} />
            <MensualChart
              serie={datos.serieMensual}
              color={color}
              mesSeleccionado={mesSeleccionado}
              onClickMes={i => setMesSeleccionado(m => m === i ? null : i)}
            />
          </Card>

          {mesSeleccionado != null && (
            <Card>
              <SectionHeader
                title={`${titulo} por día`}
                sub={<span className="capitalize">{nombreMes}</span>}
                right={
                  <button onClick={() => setMesSeleccionado(null)} className="text-xs font-semibold text-gray-400 hover:text-gray-700">
                    Ver todo el año ✕
                  </button>
                }
              />
              {diasDelMes.every(d => !d.valor) ? (
                <EmptyState>Sin registros este mes</EmptyState>
              ) : (
                <DiariaMesChart dias={diasDelMes} color={color} />
              )}
            </Card>
          )}

          <Card>
            <SectionHeader title="Comportamiento por día de la semana" sub="Promedio histórico del año seleccionado" />
            <DiaSemanaChart porDiaSemana={datos.porDiaSemana} color={color} />
          </Card>

          <Card>
            <SectionHeader title="Top 10 días" sub={`Los días con más ${titulo.toLowerCase()} del año`} />
            {datos.topDias.length === 0 ? (
              <EmptyState>Sin registros este año</EmptyState>
            ) : (
              <div className="space-y-1.5">
                {datos.topDias.map((d, i) => (
                  <div key={d.fecha} className="flex items-center justify-between gap-3 text-sm py-1.5 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-gray-50 text-gray-400 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                      <span className="text-gray-600 capitalize">{format(new Date(`${d.fecha}T12:00:00`), "EEEE d 'de' MMMM", { locale: es })}</span>
                    </div>
                    <span className="font-bold text-gray-800 tabular-nums">{formatMoney(d.valor)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
