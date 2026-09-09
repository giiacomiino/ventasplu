import { Fragment, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { WARNING, CRITICAL, GOLD_RAMP, refrescarBI } from './shared'
import { Card, PageHeader, KpiTile, LoadingState, ErrorState, EmptyState } from './ui'
import { useSemanaSeleccionada } from './useSemanaSeleccionada'

const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

// Sin fila = asistió (default). Al desmarcar el checkbox se guarda como
// "falta" y se puede afinar a una razón más específica con el selector.
const RAZONES = [
  { valor: 'falta', label: 'Falta', color: CRITICAL },
  { valor: 'descanso', label: 'Descanso', color: '#8a94a6' },
  { valor: 'vacaciones', label: 'Vacaciones', color: GOLD_RAMP[1] },
  { valor: 'incapacidad', label: 'Incapacidad', color: WARNING },
  { valor: 'permiso', label: 'Permiso', color: '#8a6fbd' },
]

function agruparPorAreaPuesto(empleados) {
  const porArea = new Map()
  for (const emp of empleados) {
    if (!porArea.has(emp.area)) porArea.set(emp.area, new Map())
    const porPuesto = porArea.get(emp.area)
    if (!porPuesto.has(emp.puesto)) porPuesto.set(emp.puesto, [])
    porPuesto.get(emp.puesto).push(emp)
  }
  return [...porArea.entries()]
    .map(([area, porPuesto]) => {
      const puestos = [...porPuesto.entries()]
        .map(([puesto, lista]) => ({ puesto, empleados: lista }))
        .sort((a, b) => b.empleados.length - a.empleados.length)
      const total = puestos.reduce((s, p) => s + p.empleados.length, 0)
      return { area, total, puestos }
    })
    .sort((a, b) => b.total - a.total)
}

function CeldaAsistencia({ estado, onChange, guardando }) {
  const asistio = estado == null
  const cfg = RAZONES.find(r => r.valor === estado)

  return (
    <div className="flex flex-col items-center gap-1">
      <input
        type="checkbox"
        checked={asistio}
        disabled={guardando}
        onChange={() => onChange(asistio ? 'falta' : null)}
        className="w-4 h-4 rounded accent-[#7a6020] cursor-pointer disabled:opacity-50"
      />
      {!asistio && (
        <select
          value={estado}
          disabled={guardando}
          onChange={e => onChange(e.target.value)}
          className="w-full text-[10px] font-bold text-center rounded-md border-0 py-1 cursor-pointer focus:outline-none focus:ring-1 focus:ring-offset-1 disabled:opacity-50"
          style={{ background: cfg ? `${cfg.color}22` : '#f3f4f6', color: cfg ? cfg.color : '#9ca3af' }}
        >
          {RAZONES.map(r => <option key={r.valor} value={r.valor}>{r.label}</option>)}
        </select>
      )}
    </div>
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

  const grupos = agruparPorAreaPuesto(empleados)
  const totalCeldas = empleados.length * 7
  const ausencias = resumenSemana
    ? RAZONES.reduce((s, r) => s + (resumenSemana[r.valor] ?? 0), 0)
    : 0
  const asistieron = totalCeldas - ausencias

  return (
    <div className="w-full px-4 py-4 sm:px-8 sm:py-8 max-w-[1600px] mx-auto space-y-8">
      <div>
        <Link to="/rh" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-700 mb-3 transition-colors">
          <ArrowLeft size={15} /> RH
        </Link>
        <PageHeader
          title="Asistencia semanal"
          sub="Por defecto todos asisten — desmarca un día para registrar la razón"
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
          <KpiTile label="Asistió" value={asistieron} />
          {RAZONES.map(r => (
            <KpiTile key={r.valor} label={r.label} value={resumenSemana[r.valor] ?? 0} />
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
                {grupos.map(grupo => (
                  <Fragment key={`area-${grupo.area}`}>
                    <tr className="bg-gray-50">
                      <td colSpan={9} className="px-4 py-2 text-[11px] font-bold text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50">
                        {grupo.area} · {grupo.total}
                      </td>
                    </tr>
                    {grupo.puestos.map(p => (
                      <Fragment key={`puesto-${grupo.area}-${p.puesto}`}>
                        <tr>
                          <td colSpan={9} className="px-6 py-1.5 text-[11px] font-semibold text-gray-400 sticky left-0 bg-white">
                            {p.puesto}
                          </td>
                        </tr>
                        {p.empleados.map(emp => (
                          <tr key={emp.empleadoBubbleId} className="border-b border-gray-50 last:border-0">
                            <td className="pl-9 pr-4 py-2 sticky left-0 bg-white">
                              <p className="font-medium text-gray-700 truncate max-w-[170px]">{emp.nombre}</p>
                            </td>
                            {emp.dias.map(d => (
                              <td key={d.fecha} className="px-1.5 py-2">
                                <CeldaAsistencia
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
                      </Fragment>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
