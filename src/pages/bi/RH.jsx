import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Plus } from 'lucide-react'
import { formatMoney } from '../../utils/formatters'
import { supabase } from '../../lib/supabase'
import { llamar, GOLD_RAMP, refrescarBI } from './shared'
import { Card, PageHeader, KpiTile, LoadingState, ErrorState } from './ui'
import Modal from '../../components/ui/Modal'

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
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [modalPago, setModalPago] = useState(false)

  function cargar() {
    setLoading(true)
    Promise.allSettled([
      llamar('resumen-rh'),
      supabase.functions.invoke('rh-pagos-nomina', { body: { action: 'list' } }),
    ]).then(([r1, r2]) => {
      if (r1.status === 'fulfilled') setRh(r1.value)
      else setError(r1.reason.message)
      if (r2.status === 'fulfilled' && !r2.value.error && !r2.value.data?.error) setNomina(r2.value.data)
      setLoading(false)
    })
  }

  useEffect(cargar, [])

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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-5">
            <KpiTile label="Headcount activo" value={rh.headcountActivo} />
            <KpiTile
              label="Rotación del año"
              value={rh.rotacionAnual != null ? `${(rh.rotacionAnual * 100).toFixed(0)}%` : '—'}
              sub={`${rh.bajasDelAnio} bajas este año`}
            />
            <KpiTile
              label="Antigüedad promedio"
              value={rh.antiguedadPromedio != null ? `${rh.antiguedadPromedio.toFixed(1)} años` : '—'}
            />
            <KpiTile
              label="Nómina YTD (real)"
              value={nomina ? formatMoney(nomina.nominaYtd) : '—'}
              sub={nomina?.ultimoPago ? `último registro: ${nomina.ultimoPago.fecha}` : 'sin registros aún'}
            />
            <KpiTile
              label="Nómina estimada / mes"
              value={formatMoney(rh.nominaEstimadaMensual)}
              sub="Headcount activo × sueldo diario × 30"
            />
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            *Rotación aproximada: bajas cuyo último cambio de estatus fue este año — Bubble no expone una fecha de baja explícita.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <DomainCard to="/rh/rotacion" titulo="Rotación por área" sub="Desglose por área, puesto y lista de colaboradores">
              <div className="space-y-2.5">
                {rh.hcPorArea.slice(0, 4).map((a, i) => (
                  <div key={a.nombre}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-gray-700 truncate">{a.nombre}</span>
                      <span className="font-bold text-gray-800 flex-shrink-0 ml-2 tabular-nums">{a.headcount}</span>
                    </div>
                    <div className="h-1.5 bg-gray-50 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(a.headcount / rh.hcPorArea[0].headcount) * 100}%`, background: GOLD_RAMP[i % GOLD_RAMP.length] }} />
                    </div>
                  </div>
                ))}
              </div>
            </DomainCard>

            <DomainCard to="/rh/asistencia" titulo="Asistencia semanal" sub="Registra trabajo, descansos, vacaciones y faltas por empleado">
              <p className="text-sm text-gray-400">Cuadrícula semanal editable, con saldo de vacaciones por ley calculado por antigüedad.</p>
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
