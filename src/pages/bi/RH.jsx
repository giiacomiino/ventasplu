import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { startOfWeek, format } from 'date-fns'
import { ChevronRight, Plus, Users, RefreshCw, Clock, Wallet, TrendingUp } from 'lucide-react'
import { formatMoney } from '../../utils/formatters'
import { supabase } from '../../lib/supabase'
import { llamar, GOLD_RAMP, GOOD, WARNING, CRITICAL, refrescarBI } from './shared'
import { Card, PageHeader, LoadingState, ErrorState, DonutGauge } from './ui'
import Modal from '../../components/ui/Modal'

const AUSENCIAS_ESTILO = [
  { valor: 'falta', label: 'Falta', color: CRITICAL },
  { valor: 'incapacidad', label: 'Incapacidad', color: WARNING },
  { valor: 'vacaciones', label: 'Vacaciones', color: GOLD_RAMP[1] },
  { valor: 'descanso', label: 'Descanso', color: '#8a94a6' },
  { valor: 'permiso', label: 'Permiso', color: '#8a6fbd' },
]

function colorRotacion(pct) {
  if (pct == null) return '#9ca3af'
  if (pct >= 0.5) return CRITICAL
  if (pct >= 0.25) return '#ec835a'
  return GOOD
}

function DomainCard({ to, titulo, sub, children }) {
  return (
    <Link to={to} className="block group">
      <Card className="h-full transition-all group-hover:border-gray-200 group-hover:shadow-md">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="text-base font-bold text-gray-900">{titulo}</h2>
          <ChevronRight size={18} className="text-gray-300 group-hover:text-gray-500 group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-0.5" />
        </div>
        {sub && <p className="text-xs text-gray-400 mb-4 leading-relaxed">{sub}</p>}
        {children}
      </Card>
    </Link>
  )
}

function MetricCard({ icono: Icono, label, value, sub, color = GOLD_RAMP[1] }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center gap-4">
      <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${color}14` }}>
        <Icono size={20} style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider truncate">{label}</p>
        <p className="text-xl font-bold text-gray-900 tabular-nums leading-tight">{value}</p>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  )
}

function ModalRegistrarPago({ onClose, onGuardado }) {
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [monto, setMonto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function guardar() {
    if (!monto || Number(monto) <= 0) { setError('Captura un monto válido'); return }
    setGuardando(true)
    setError('')
    try {
      const { error } = await supabase.functions.invoke('rh-pagos-nomina', {
        body: { action: 'create', fechaPago: fecha, monto: Number(monto) },
      })
      if (error) throw new Error(error.message)
      refrescarBI()
      onGuardado()
    } catch (e) {
      setError(e.message)
    }
    setGuardando(false)
  }

  return (
    <Modal onClose={onClose} maxWidth="max-w-sm">
      <div className="p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Registrar pago de nómina</h3>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Fecha</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Monto transferido</label>
            <input type="number" value={monto} onChange={e => setMonto(e.target.value)} placeholder="0.00" className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm tabular-nums" />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold text-gray-500 hover:bg-gray-50">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#7a6020] hover:bg-[#5c4718] disabled:opacity-50">
            {guardando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function BIRH() {
  const [rh, setRh] = useState(null)
  const [nomina, setNomina] = useState(null)
  const [rotacion, setRotacion] = useState(null)
  const [asistencia, setAsistencia] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [modalPago, setModalPago] = useState(false)

  const lunesStr = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')

  function cargar() {
    setLoading(true)
    Promise.allSettled([
      llamar('resumen-rh'),
      supabase.functions.invoke('rh-pagos-nomina', { body: { action: 'list' } }),
      llamar('rh-rotacion'),
      llamar('rh-asistencia', { action: 'list', lunes: lunesStr }),
    ]).then(([r1, r2, r3, r4]) => {
      if (r1.status === 'fulfilled') setRh(r1.value)
      else setError(r1.reason.message)
      if (r2.status === 'fulfilled' && !r2.value.error && !r2.value.data?.error) setNomina(r2.value.data)
      if (r3.status === 'fulfilled') setRotacion(r3.value)
      if (r4.status === 'fulfilled') setAsistencia(r4.value)
      setLoading(false)
    })
  }

  useEffect(cargar, [])

  const maxRotacion = rotacion?.areas?.length ? Math.max(...rotacion.areas.map(a => a.rotacion ?? 0), 0.01) : 0.01

  const totalCeldas = asistencia ? asistencia.empleados.length * 7 : 0
  const totalAusencias = asistencia
    ? AUSENCIAS_ESTILO.reduce((s, e) => s + (asistencia.resumenSemana[e.valor] ?? 0), 0)
    : 0
  const pctAsistencia = totalCeldas > 0 ? Math.max(totalCeldas - totalAusencias, 0) / totalCeldas : 1
  const desgloseAusencias = asistencia
    ? AUSENCIAS_ESTILO.map(e => ({ ...e, valor2: asistencia.resumenSemana[e.valor] ?? 0 })).filter(e => e.valor2 > 0)
    : []

  return (
    <div className="w-full px-4 py-4 sm:px-8 sm:py-8 max-w-[1600px] mx-auto space-y-8">
      <PageHeader
        title="Recursos Humanos"
        sub="Headcount, rotación, asistencia y nómina"
        right={
          <button onClick={() => setModalPago(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-[#7a6020] text-white rounded-lg text-sm font-semibold hover:bg-[#5c4718] transition-colors shadow-sm">
            <Plus size={15} /> Registrar Pago Nómina
          </button>
        }
      />

      {loading && <LoadingState>Cargando...</LoadingState>}
      {error && <ErrorState message={error} />}

      {rh && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <MetricCard icono={Users} label="Headcount activo" value={rh.headcountActivo} color={GOLD_RAMP[1]} />
            <MetricCard
              icono={RefreshCw}
              label="Rotación del año"
              value={rh.rotacionAnual != null ? `${(rh.rotacionAnual * 100).toFixed(0)}%` : '—'}
              sub={`${rh.bajasDelAnio} bajas este año`}
              color={colorRotacion(rh.rotacionAnual)}
            />
            <MetricCard
              icono={Clock}
              label="Antigüedad promedio"
              value={rh.antiguedadPromedio != null ? `${rh.antiguedadPromedio.toFixed(1)} años` : '—'}
              color="#8a94a6"
            />
            <MetricCard
              icono={Wallet}
              label="Nómina YTD (real)"
              value={nomina ? formatMoney(nomina.nominaYtd) : '—'}
              sub={nomina?.ultimoPago ? `último: ${nomina.ultimoPago.fecha}` : 'sin registros aún'}
              color={GOOD}
            />
            <MetricCard
              icono={TrendingUp}
              label="Nómina estimada / mes"
              value={formatMoney(rh.nominaEstimadaMensual)}
              sub="headcount × sueldo diario × 30"
              color="#8a6fbd"
            />
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            *Rotación aproximada: bajas cuyo último cambio de estatus fue este año — Bubble no expone una fecha de baja explícita.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <DomainCard to="/rh/rotacion" titulo="Rotación por área" sub="Desglose por área, puesto, costo mensual y lista de colaboradores">
              {rotacion?.areas?.length ? (
                <div className="space-y-2.5">
                  {rotacion.areas.slice(0, 5).map(a => (
                    <div key={a.area}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium text-gray-700 truncate">{a.area}</span>
                        <span className="flex items-center gap-2 flex-shrink-0 ml-2">
                          <span className="text-gray-400 tabular-nums">{a.activos}</span>
                          <span className="font-bold tabular-nums" style={{ color: colorRotacion(a.rotacion) }}>
                            {a.rotacion != null ? `${(a.rotacion * 100).toFixed(0)}%` : '—'}
                          </span>
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-50 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${((a.rotacion ?? 0) / maxRotacion) * 100}%`, background: colorRotacion(a.rotacion) }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-300 py-6 text-center">Cargando...</p>
              )}
            </DomainCard>

            <DomainCard to="/rh/asistencia" titulo="Asistencia semanal" sub="Registra descansos, vacaciones, faltas e incapacidades por empleado">
              {asistencia ? (
                <div className="flex items-center gap-5">
                  <DonutGauge pct={pctAsistencia} color={pctAsistencia >= 0.9 ? GOOD : pctAsistencia >= 0.75 ? WARNING : CRITICAL} size={68} stroke={8} label="asistió" />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    {desgloseAusencias.length === 0 ? (
                      <p className="text-xs text-gray-400">Sin ausencias registradas esta semana.</p>
                    ) : desgloseAusencias.map(e => (
                      <div key={e.valor} className="flex items-center gap-1.5 text-[11px]">
                        <span className="w-1.5 h-1.5 rounded-sm flex-shrink-0" style={{ background: e.color }} />
                        <span className="text-gray-600 flex-1">{e.label}</span>
                        <span className="text-gray-700 font-bold tabular-nums flex-shrink-0">{e.valor2}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-300 py-6 text-center">Cargando...</p>
              )}
            </DomainCard>
          </div>
        </>
      )}

      {modalPago && (
        <ModalRegistrarPago
          onClose={() => setModalPago(false)}
          onGuardado={() => { setModalPago(false); cargar() }}
        />
      )}
    </div>
  )
}
