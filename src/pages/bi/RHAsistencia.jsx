import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { GOOD, WARNING, CRITICAL, GOLD_RAMP, refrescarBI } from './shared'
import { Card, PageHeader, KpiTile, LoadingState, ErrorState, EmptyState } from './ui'
import { useSemanaSeleccionada } from './useSemanaSeleccionada'

const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const ESTADOS = [
  { valor: 'trabajo', label: 'Trabajó', color: GOOD },
  { valor: 'descanso', label: 'Descanso', color: '#8a94a6' },
  { valor: 'vacaciones', label: 'Vacaciones', color: GOLD_RAMP[1] },
  { valor: 'falta', label: 'Falta', color: CRITICAL },
  { valor: 'incapacidad', label: 'Incapacidad', color: WARNING },
  { valor: 'permiso', label: 'Permiso', color: '#8a6fbd' },
]

function CeldaEstado({ estado, onChange, guardando }) {
  const cfg = ESTADOS.find(e => e.valor === estado)
  return (
    <select
      value={estado || ''}
      disabled={guardando}
      onChange={e => onChange(e.target.value || null)}
      className="w-full text-[11px] font-bold text-center rounded-md border-0 py-1.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50"
      style={{
        background: cfg ? `${cfg.color}22` : '#f3f4f6',
        color: cfg ? cfg.color : '#9ca3af',
      }}
    >
      <option value="">—</option>
      {ESTADOS.map(e => <option key={e.valor} value={e.valor}>{e.label}</option>)}
    </select>
  )
}

export default function BIRHAsistencia() {
  const { lunesStr, esSemanaActual, anterior, siguiente, label } = useSemanaSeleccionada()
  const [empleados, setEmpleados] = useState([])
  const [resumenSemana, setResumenSemana] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [guardandoCelda, setGuardandoCelda] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError('')
    supabase.functions.invoke('rh-asistencia', { body: { action: 'list', lunes: lunesStr } })
      .then(({ data, error }) => {
        if (error) throw new Error(error.message)
        if (data?.error) throw new Error(data.error)
        setEmpleados(data.empleados)
        setResumenSemana(data.resumenSemana)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [lunesStr])

  async function cambiarEstado(empleado, fecha, estado) {
    const clave = `${empleado.empleadoBubbleId}:${fecha}`
    const empleadosPrevios = empleados
    setGuardandoCelda(clave)
    setEmpleados(lista => lista.map(e => e.empleadoBubbleId !== empleado.empleadoBubbleId ? e : {
      ...e,
      dias: e.dias.map(d => d.fecha === fecha ? { ...d, estado } : d),
    }))
    try {
      const { error } = await supabase.functions.invoke('rh-asistencia', {
        body: { action: 'save', empleadoBubbleId: empleado.empleadoBubbleId, empleadoNombre: empleado.nombre, fecha, estado },
      })
      if (error) throw new Error(error.message)
      refrescarBI()
    } catch (e) {
      setEmpleados(empleadosPrevios)
      setError(`No se pudo guardar: ${e.message}`)
    }
    setGuardandoCelda(null)
  }

  return (
    <div className="w-full px-4 py-4 sm:px-8 sm:py-8 max-w-[1600px] mx-auto space-y-8">
      <div>
        <Link to="/rh" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-700 mb-3 transition-colors">
          <ArrowLeft size={15} /> RH
        </Link>
        <PageHeader
          title="Asistencia semanal"
          sub="Trabajó, descanso, vacaciones y ausencias por empleado"
          right={
            <div className="flex items-center gap-2">
              <button onClick={anterior} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"><ChevronLeft size={16} /></button>
              <span className="text-sm font-semibold text-gray-700 min-w-[180px] text-center capitalize">{label}</span>
              <button onClick={siguiente} disabled={esSemanaActual} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"><ChevronRight size={16} /></button>
            </div>
          }
        />
      </div>

      {loading && <LoadingState>Cargando...</LoadingState>}
      {error && <ErrorState message={error} />}

      {!loading && resumenSemana && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {ESTADOS.map(e => (
            <KpiTile key={e.valor} label={e.label} value={resumenSemana[e.valor] ?? 0} />
          ))}
        </div>
      )}

      {!loading && empleados.length === 0 && <EmptyState>No hay empleados activos.</EmptyState>}

      {!loading && empleados.length > 0 && (
        <Card padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider sticky left-0 bg-white">Empleado</th>
                  {DIAS_CORTOS.map(d => (
                    <th key={d} className="px-2 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider text-center min-w-[110px]">{d}</th>
                  ))}
                  <th className="px-3 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider text-center">Vacaciones</th>
                </tr>
              </thead>
              <tbody>
                {empleados.map(emp => (
                  <tr key={emp.empleadoBubbleId} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-2 sticky left-0 bg-white">
                      <p className="font-medium text-gray-700 truncate max-w-[180px]">{emp.nombre}</p>
                      <p className="text-[11px] text-gray-400 truncate max-w-[180px]">{emp.puesto}</p>
                    </td>
                    {emp.dias.map(d => (
                      <td key={d.fecha} className="px-1.5 py-2">
                        <CeldaEstado
                          estado={d.estado}
                          guardando={guardandoCelda === `${emp.empleadoBubbleId}:${d.fecha}`}
                          onChange={estado => cambiarEstado(emp, d.fecha, estado)}
                        />
                      </td>
                    ))}
                    <td className="px-3 py-2 text-center">
                      <span className="text-xs font-bold text-gray-600 tabular-nums">
                        {emp.saldoVacaciones.restantes}/{emp.saldoVacaciones.correspondientes}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
