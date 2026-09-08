import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { formatMoney } from '../../utils/formatters'
import { llamar, CRITICAL, GOOD } from './shared'
import { Card, PageHeader, KpiTile, LoadingState, ErrorState } from './ui'
import { useMesSeleccionado, SelectorMes } from './mesContext'

const INGRESO_COLOR = '#8a94a6'
const PRESUPUESTO_COLOR = '#dbb75c'
const GASTO_COLOR = '#7a6020'

const W = 1000
const H = 360
const PAD_TOP = 36
const PAD_BOTTOM = 28
const PAD_X = 8

function GraficaRitmo({ serie, diaCorte, diasDelMes, sobreRitmo }) {
  const [hover, setHover] = useState(null)
  const valores = serie.flatMap(d => [d.gastoAcumulado, d.ritmoPresupuesto, d.ritmoIngreso]).filter(v => v != null)
  const max = Math.max(...valores, 1) * 1.14

  const x = dia => PAD_X + ((dia - 1) / Math.max(diasDelMes - 1, 1)) * (W - PAD_X * 2)
  const y = valor => H - PAD_BOTTOM - (valor / max) * (H - PAD_TOP - PAD_BOTTOM)
  const anchoBarra = Math.max(((W - PAD_X * 2) / diasDelMes) * 0.55, 3)

  const puntosPresupuesto = serie.filter(d => d.ritmoPresupuesto != null).map(d => [x(d.dia), y(d.ritmoPresupuesto)])
  const puntosIngreso = serie.filter(d => d.ritmoIngreso != null).map(d => [x(d.dia), y(d.ritmoIngreso)])
  const lineaPath = pts => pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')

  const diaHover = hover != null ? serie[hover] : null
  const ultimoConGasto = [...serie].reverse().find(d => d.gastoAcumulado != null)

  return (
    <div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" style={{ aspectRatio: `${W} / ${H}` }}>
          {/* Grid horizontal recesivo */}
          {[0.25, 0.5, 0.75, 1].map(f => (
            <line key={f} x1={PAD_X} x2={W - PAD_X} y1={y(max * f)} y2={y(max * f)} stroke="#f1f0ec" strokeWidth={1} />
          ))}

          {/* Gasto real acumulado: barras, no línea — cada una es el corte a ese día */}
          {serie.filter(d => d.gastoAcumulado != null).map(d => {
            const esHoy = d.dia === diaCorte
            const py = y(d.gastoAcumulado)
            return (
              <rect
                key={d.dia}
                x={x(d.dia) - anchoBarra / 2} y={py}
                width={anchoBarra} height={Math.max(H - PAD_BOTTOM - py, 1)}
                rx={2}
                fill={esHoy ? (sobreRitmo > 0 ? CRITICAL : GOOD) : GASTO_COLOR}
                opacity={hover != null && hover !== serie.indexOf(d) ? 0.55 : 1}
              />
            )
          })}

          {puntosPresupuesto.length > 1 && <path d={lineaPath(puntosPresupuesto)} fill="none" stroke={PRESUPUESTO_COLOR} strokeWidth={1.75} strokeDasharray="5 4" strokeLinecap="round" />}
          {puntosIngreso.length > 1 && <path d={lineaPath(puntosIngreso)} fill="none" stroke={INGRESO_COLOR} strokeWidth={1.75} strokeDasharray="5 4" strokeLinecap="round" />}

          {/* Etiqueta del corte de hoy, integrada en la gráfica (no flotando afuera) */}
          {ultimoConGasto && sobreRitmo != null && (
            <text
              className="tabular-nums"
              x={Math.min(x(ultimoConGasto.dia), W - 130)} y={y(ultimoConGasto.gastoAcumulado) - 10}
              fontSize="15" fontWeight="700" fill={sobreRitmo > 0 ? CRITICAL : GOOD}
            >
              {sobreRitmo > 0 ? '+' : ''}{formatMoney(sobreRitmo)} {sobreRitmo > 0 ? 'sobre ritmo' : 'bajo ritmo'}
            </text>
          )}

          {/* Hit areas invisibles para el tooltip, una franja por día */}
          {serie.map((d, i) => (
            <rect
              key={d.dia}
              x={x(d.dia) - (W / diasDelMes) / 2} y={0} width={W / diasDelMes} height={H}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
          {diaHover && (
            <line x1={x(diaHover.dia)} x2={x(diaHover.dia)} y1={PAD_TOP} y2={H - PAD_BOTTOM} stroke="#d1d5db" strokeWidth={1} strokeDasharray="3 3" />
          )}
        </svg>

        {diaHover && (
          <div
            className="absolute z-20 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none -translate-x-1/2"
            style={{ left: `${(x(diaHover.dia) / W) * 100}%`, top: 0 }}
          >
            <p className="font-semibold">Día {diaHover.dia}</p>
            {diaHover.gastoAcumulado != null && <p className="tabular-nums" style={{ color: '#e3c780' }}>Gasto: {formatMoney(diaHover.gastoAcumulado)}</p>}
            {diaHover.ritmoPresupuesto != null && <p className="tabular-nums text-gray-300">Ritmo presup.: {formatMoney(diaHover.ritmoPresupuesto)}</p>}
            {diaHover.ritmoIngreso != null && <p className="tabular-nums text-gray-400">Ritmo ingreso: {formatMoney(diaHover.ritmoIngreso)}</p>}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-2 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: GASTO_COLOR }} /> Gasto real acumulado</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded-full border-t-2 border-dashed" style={{ borderColor: PRESUPUESTO_COLOR }} /> Ritmo ideal (presupuesto)</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded-full border-t-2 border-dashed" style={{ borderColor: INGRESO_COLOR }} /> Ritmo ideal (ingreso)</span>
      </div>
    </div>
  )
}

export default function BICxPRitmo() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const { anio, mes } = useMesSeleccionado()

  useEffect(() => {
    setLoading(true)
    llamar('ritmo-gasto', { anio, mes }).then(setDatos).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [anio, mes])

  return (
    <div className="w-full px-4 py-4 sm:px-8 sm:py-8 max-w-[1600px] mx-auto space-y-8">
      <div>
        <Link to="/pagos" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-700 mb-3 transition-colors">
          <ArrowLeft size={15} /> Cuentas por pagar
        </Link>
        <PageHeader
          title="Ritmo de gasto"
          sub="Gasto real acumulado vs. el ritmo ideal para no exceder presupuesto ni ingreso"
          right={<SelectorMes />}
        />
      </div>

      {loading && <LoadingState>Cargando...</LoadingState>}
      {error && <ErrorState message={error} />}

      {datos && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <KpiTile label="Gasto acumulado a hoy" value={formatMoney(datos.gastoAcumuladoHoy)} sub={`día ${datos.diaCorte} de ${datos.diasDelMes}`} />
            <KpiTile label="Presupuesto global del mes" value={formatMoney(datos.presupuestoGlobal)} sub="suma de todas las categorías" />
            <KpiTile
              label={datos.sobreRitmo > 0 ? 'Sobre ritmo' : 'Bajo ritmo'}
              value={
                <span style={{ color: datos.sobreRitmo > 0 ? CRITICAL : GOOD }}>
                  {datos.sobreRitmo > 0 ? '+' : ''}{formatMoney(datos.sobreRitmo)}
                </span>
              }
              sub={datos.sobreRitmo > 0 ? (
                <span className="inline-flex items-center gap-1 font-semibold" style={{ color: CRITICAL }}><AlertTriangle size={12} /> vs. ritmo ideal de presupuesto</span>
              ) : (
                <span className="inline-flex items-center gap-1 font-semibold" style={{ color: GOOD }}><CheckCircle2 size={12} /> vs. ritmo ideal de presupuesto</span>
              )}
            />
          </div>

          <Card>
            <GraficaRitmo serie={datos.serie} diaCorte={datos.diaCorte} diasDelMes={datos.diasDelMes} sobreRitmo={datos.sobreRitmo} />
          </Card>
        </>
      )}
    </div>
  )
}
