import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { startOfWeek, format } from 'date-fns'
import { ChevronRight, Plus, Users, RefreshCw, Clock, TrendingUp, Wallet } from 'lucide-react'
import { formatMoney } from '../../utils/formatters'
import { supabase } from '../../lib/supabase'
import { llamar, GOLD_RAMP, GOOD, WARNING, CRITICAL, refrescarBI } from './shared'
import { Card, PageHeader, SectionHeader, LoadingState, ErrorState, DonutGauge, DeltaPill } from './ui'
import { useMesSeleccionado, SelectorMes } from './mesContext'
import Modal from '../../components/ui/Modal'

const AUSENCIAS_ESTILO = [
  { valor: 'falta', label: 'Falta', color: CRITICAL },
  { valor: 'incapacidad', label: 'Incapacidad', color: WARNING },
  { valor: 'vacaciones', label: 'Vacaciones', color: GOLD_RAMP[1] },
  { valor: 'descanso', label: 'Descanso', color: '#8a94a6' },
  { valor: 'permiso', label: 'Permiso', color: '#8a6fbd' },
]

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function colorRotacion(pct) {
  if (pct == null) return '#9ca3af'
  if (pct >= 0.5) return CRITICAL
  if (pct >= 0.25) return '#ec835a'
  return GOOD
}

// Catmull-Rom a Bézier: suaviza una polilínea de puntos [x,y] sin cambiar
// los valores reales en cada punto, solo cómo se conectan.
function pathSuave(puntos) {
  if (puntos.length < 2) return ''
  let d = `M ${puntos[0][0].toFixed(1)},${puntos[0][1].toFixed(1)}`
  for (let i = 0; i < puntos.length - 1; i++) {
    const p0 = puntos[i === 0 ? i : i - 1]
    const p1 = puntos[i]
    const p2 = puntos[i + 1]
    const p3 = puntos[i + 2 < puntos.length ? i + 2 : i + 1]
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }
  return d
}

// HC activo como barras (nivel del mes, fondo) y altas/bajas como líneas
// suaves con etiqueta de valor en cada punto — sin ejes ni gridlines, los
// números se leen directo sobre la gráfica.
function TendenciaHCChart({ serie }) {
  const [hover, setHover] = useState(null)
  const W = 1000, H = 260, PAD_X = 10, PAD_TOP = 26, PAD_BOTTOM = 30

  // Escala de las barras de HC activo recortada al rango real de la serie
  // (no desde 0) — así se nota si el promedio de activos sube o baja mes a
  // mes, en vez de verse todas las barras casi iguales por estar cerca de
  // un total grande.
  const valoresHC = serie.map(s => s.hcActivo)
  const minHCval = Math.min(...valoresHC)
  const maxHCval = Math.max(...valoresHC)
  const rangoHC = Math.max(maxHCval - minHCval, 1)
  const baseHC = Math.max(minHCval - rangoHC * 0.6, 0)
  const topHC = maxHCval + rangoHC * 0.35

  const maxEventos = Math.max(...serie.flatMap(s => [s.altas, s.bajas]), 1) * 1.35

  const anchoSlot = (W - PAD_X * 2) / serie.length
  const x = i => PAD_X + anchoSlot * (i + 0.5)
  const anchoBarra = anchoSlot * 0.46

  const yHC = v => H - PAD_BOTTOM - ((v - baseHC) / (topHC - baseHC)) * (H - PAD_TOP - PAD_BOTTOM)
  const yEv = v => H - PAD_BOTTOM - (v / maxEventos) * (H - PAD_TOP - PAD_BOTTOM)

  const puntosAltas = serie.map((s, i) => [x(i), yEv(s.altas)])
  const puntosBajas = serie.map((s, i) => [x(i), yEv(s.bajas)])

  const hoverInfo = hover != null ? serie[hover] : null

  return (
    <div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" style={{ aspectRatio: `${W} / ${H}` }}>
          {serie.map((s, i) => (
            <rect
              key={`bar-${i}`}
              x={x(i) - anchoBarra / 2} y={yHC(s.hcActivo)}
              width={anchoBarra} height={Math.max(H - PAD_BOTTOM - yHC(s.hcActivo), 1)}
              rx={4} fill={GOLD_RAMP[1]} opacity={hover === i ? 0.32 : 0.16}
            />
          ))}
          {serie.map((s, i) => (
            <text key={`th-${i}`} x={x(i)} y={yHC(s.hcActivo) - 8} textAnchor="middle" fontSize="11" fontWeight="700" fill={GOLD_RAMP[1]} className="tabular-nums">{s.hcActivo}</text>
          ))}

          <path d={pathSuave(puntosAltas)} fill="none" stroke={GOOD} strokeWidth={2.5} strokeLinecap="round" />
          <path d={pathSuave(puntosBajas)} fill="none" stroke={CRITICAL} strokeWidth={2.5} strokeLinecap="round" />

          {serie.map((s, i) => (
            <circle key={`ca-${i}`} cx={x(i)} cy={yEv(s.altas)} r={3} fill={GOOD} />
          ))}
          {serie.map((s, i) => (
            <circle key={`cb-${i}`} cx={x(i)} cy={yEv(s.bajas)} r={3} fill={CRITICAL} />
          ))}
          {serie.map((s, i) => (
            <text key={`ta-${i}`} x={x(i)} y={yEv(s.altas) - 9} textAnchor="middle" fontSize="11" fontWeight="700" fill={GOOD} className="tabular-nums">{s.altas}</text>
          ))}
          {serie.map((s, i) => (
            <text key={`tb-${i}`} x={x(i)} y={yEv(s.bajas) + 17} textAnchor="middle" fontSize="11" fontWeight="700" fill={CRITICAL} className="tabular-nums">{s.bajas}</text>
          ))}

          {serie.map((s, i) => (
            <rect
              key={`hit-${i}`} x={x(i) - anchoSlot / 2} y={0} width={anchoSlot} height={H} fill="transparent"
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
            />
          ))}
        </svg>
        {hoverInfo && (
          <div
            className="absolute z-20 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none -translate-x-1/2"
            style={{ left: `${(x(hover) / W) * 100}%`, top: 0 }}
          >
            <p className="font-semibold">{MESES_CORTOS[hoverInfo.mes]}</p>
            <p className="tabular-nums" style={{ color: '#e3c780' }}>HC activo: {hoverInfo.hcActivo}</p>
            <p className="tabular-nums" style={{ color: '#86efac' }}>Altas: {hoverInfo.altas}</p>
            <p className="tabular-nums" style={{ color: '#fca5a5' }}>Bajas: {hoverInfo.bajas}</p>
          </div>
        )}
      </div>
      <div className="flex mt-1">
        {serie.map((s, i) => (
          <div key={i} className="flex-1 text-center text-[10px] text-gray-400 font-medium">{MESES_CORTOS[s.mes]}</div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-3 pt-3 border-t border-gray-50 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded-full" style={{ background: GOOD }} /> Altas</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded-full" style={{ background: CRITICAL }} /> Bajas</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: `${GOLD_RAMP[1]}30` }} /> HC activo</span>
      </div>
    </div>
  )
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

function MetricCard({ icono: Icono, label, value, sub, color = GOLD_RAMP[1], delta }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center gap-4">
      <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${color}14` }}>
        <Icono size={20} style={{ color }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider truncate">{label}</p>
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <p className="text-xl font-bold text-gray-900 tabular-nums leading-tight">{value}</p>
          {delta}
        </div>
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
      const { error } = await supabase.functions.invoke('crear-factura', {
        body: {
          proveedor: 'Fonda La Trattoria',
          categoria: 'NOMINA',
          montoSinIva: Number(monto),
          descripcion: 'Pago de nómina',
          fechaIngreso: fecha,
        },
      })
      if (error) {
        const detalle = await error.context?.json?.().catch(() => null)
        throw new Error(detalle?.error || error.message)
      }
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

function Campo({ label, hint, children }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">{label}</label>
        {hint && <span className="text-[11px] text-gray-300">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

const inputBase = 'mt-1.5 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#7a6020]/15 focus:border-[#7a6020]/40 transition-colors'

function ModalRegistrarEmpleado({ onClose, onGuardado }) {
  const [catalogos, setCatalogos] = useState(null)
  const [nombre, setNombre] = useState('')
  const [nss, setNss] = useState('')
  const [area, setArea] = useState('')
  const [puesto, setPuesto] = useState('')
  const [fechaIngreso, setFechaIngreso] = useState(new Date().toISOString().slice(0, 10))
  const [sueldoDiario, setSueldoDiario] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [creado, setCreado] = useState(null)

  useEffect(() => {
    supabase.functions.invoke('rh-empleados', { body: { action: 'catalogos' } })
      .then(({ data }) => setCatalogos(data))
      .catch(() => setCatalogos({ areas: [], puestos: [] }))
  }, [])

  const puestoExistente = catalogos?.puestos?.find(p => p.nombre === puesto)

  function elegirPuesto(nombrePuesto) {
    setPuesto(nombrePuesto)
    const info = catalogos?.puestos?.find(p => p.nombre === nombrePuesto)
    setSueldoDiario(info ? String(info.sueldoDiario) : '')
  }

  async function guardar() {
    const sueldo = puestoExistente ? puestoExistente.sueldoDiario : Number(sueldoDiario)
    if (!nombre.trim() || !area.trim() || !puesto.trim() || !sueldo || sueldo <= 0 || !fechaIngreso) {
      setError(puestoExistente
        ? 'Completa nombre, área, puesto y fecha de ingreso'
        : 'Completa nombre, área, puesto, fecha de ingreso y el sueldo diario del puesto nuevo')
      return
    }
    setGuardando(true)
    setError('')
    try {
      const { data, error } = await supabase.functions.invoke('rh-empleados', {
        body: { action: 'crear', nombre: nombre.trim(), area: area.trim(), puesto: puesto.trim(), sueldoDiario: sueldo, fechaIngreso, nss: nss.trim() },
      })
      if (error) throw new Error(error.message)
      refrescarBI()
      setCreado(data.numeroColaborador)
    } catch (e) {
      setError(e.message)
    }
    setGuardando(false)
  }

  if (creado != null) {
    return (
      <Modal onClose={onGuardado} maxWidth="max-w-sm">
        <div className="p-8 text-center">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: `${GOOD}14` }}>
            <Users size={24} style={{ color: GOOD }} />
          </div>
          <h3 className="text-lg font-bold text-gray-900">Empleado registrado</h3>
          <p className="text-sm text-gray-500 mt-1">Colaborador #{creado} · {nombre.trim()}</p>
          <button onClick={onGuardado} className="mt-6 w-full px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-[#7a6020] hover:bg-[#5c4718]">
            Listo
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal onClose={onClose} maxWidth="max-w-3xl">
      <div className="p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${GOLD_RAMP[1]}14` }}>
            <Users size={18} style={{ color: GOLD_RAMP[1] }} />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">Registrar nuevo empleado</h3>
            <p className="text-xs text-gray-400">Se agrega a headcount, rotación y asistencia junto con los de Bubble</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1.3fr_1fr] gap-8">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Campo label="Nombre completo">
                  <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Apellido Apellido Nombre" className={inputBase} />
                </Campo>
              </div>
              <Campo label="Número de seguro social" hint="opcional">
                <input value={nss} onChange={e => setNss(e.target.value)} placeholder="NSS" className={inputBase} />
              </Campo>
              <Campo label="Fecha de ingreso">
                <input type="date" value={fechaIngreso} onChange={e => setFechaIngreso(e.target.value)} className={inputBase} />
              </Campo>
              <Campo label="Área" hint="o escribe una nueva">
                <input list="rh-areas-existentes" value={area} onChange={e => setArea(e.target.value)} placeholder="Cocina, Comedor..." className={inputBase} />
                <datalist id="rh-areas-existentes">
                  {catalogos?.areas?.map(a => <option key={a} value={a} />)}
                </datalist>
              </Campo>
              <Campo label="Puesto" hint="o escribe uno nuevo">
                <input
                  list="rh-puestos-existentes" value={puesto}
                  onChange={e => elegirPuesto(e.target.value)}
                  placeholder="Mesero, Cocinero..."
                  className={inputBase}
                />
                <datalist id="rh-puestos-existentes">
                  {catalogos?.puestos?.map(p => <option key={p.nombre} value={p.nombre} />)}
                </datalist>
              </Campo>
            </div>

            {puestoExistente ? (
              <div className="flex items-center gap-3 rounded-lg px-3.5 py-3" style={{ background: `${GOOD}0d` }}>
                <Wallet size={16} style={{ color: GOOD }} className="flex-shrink-0" />
                <p className="text-sm text-gray-700">
                  Sueldo diario <span className="font-bold tabular-nums" style={{ color: GOOD }}>{formatMoney(puestoExistente.sueldoDiario)}</span>, según el puesto "{puesto}"
                </p>
              </div>
            ) : puesto.trim() ? (
              <Campo label="Sueldo diario" hint={`"${puesto}" es un puesto nuevo — captúralo`}>
                <input type="number" value={sueldoDiario} onChange={e => setSueldoDiario(e.target.value)} placeholder="0.00" className={`${inputBase} tabular-nums`} />
              </Campo>
            ) : null}

            {error && <p className="text-xs text-red-500">{error}</p>}

            <div className="flex gap-2 pt-2">
              <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold text-gray-500 hover:bg-gray-50">Cancelar</button>
              <button onClick={guardar} disabled={guardando} className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#7a6020] hover:bg-[#5c4718] disabled:opacity-50">
                {guardando ? 'Guardando...' : 'Registrar empleado'}
              </button>
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2.5">Sueldos diarios por puesto</p>
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="max-h-80 overflow-y-auto">
                {!catalogos ? (
                  <p className="text-xs text-gray-300 p-4">Cargando...</p>
                ) : catalogos.puestos.length === 0 ? (
                  <p className="text-xs text-gray-300 p-4">Sin datos aún.</p>
                ) : (
                  catalogos.puestos.map(p => (
                    <button
                      key={p.nombre}
                      type="button"
                      onClick={() => elegirPuesto(p.nombre)}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 text-left border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${puesto === p.nombre ? 'bg-gray-50' : ''}`}
                    >
                      <span className="text-xs text-gray-600 truncate">{p.nombre}</span>
                      <span className="text-xs font-bold text-gray-800 tabular-nums flex-shrink-0 ml-2">{formatMoney(p.sueldoDiario)}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
            <p className="text-[11px] text-gray-300 mt-2">Click en un puesto para usarlo en el formulario.</p>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default function BIRH() {
  const [rh, setRh] = useState(null)
  const [rotacion, setRotacion] = useState(null)
  const [asistencia, setAsistencia] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [modalPago, setModalPago] = useState(false)
  const [modalEmpleado, setModalEmpleado] = useState(false)

  const lunesStr = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const { anio, mes } = useMesSeleccionado()

  function cargar() {
    setLoading(true)
    Promise.allSettled([
      llamar('resumen-rh', { anio, mes }),
      llamar('rh-rotacion'),
      llamar('rh-asistencia', { action: 'list', lunes: lunesStr }),
    ]).then(([r1, r2, r3]) => {
      if (r1.status === 'fulfilled') setRh(r1.value)
      else setError(r1.reason.message)
      if (r2.status === 'fulfilled') setRotacion(r2.value)
      if (r3.status === 'fulfilled') setAsistencia(r3.value)
      setLoading(false)
    })
  }

  useEffect(cargar, [anio, mes])

  const totalCeldas = asistencia ? asistencia.empleados.length * 7 : 0
  const totalAusencias = asistencia
    ? AUSENCIAS_ESTILO.reduce((s, e) => s + (asistencia.resumenSemana[e.valor] ?? 0), 0)
    : 0
  const sinPlanear = asistencia?.resumenSemana?.sinPlanear ?? 0
  const diasDeterminados = totalCeldas - sinPlanear
  const pctAsistencia = diasDeterminados > 0 ? Math.max(diasDeterminados - totalAusencias, 0) / diasDeterminados : 1
  const desgloseAusencias = asistencia
    ? AUSENCIAS_ESTILO.map(e => ({ ...e, valor2: asistencia.resumenSemana[e.valor] ?? 0 })).filter(e => e.valor2 > 0)
    : []

  return (
    <div className="w-full px-4 py-4 sm:px-8 sm:py-8 max-w-[1600px] mx-auto space-y-8">
      <PageHeader
        title="Recursos Humanos"
        sub="Headcount, rotación, asistencia y nómina"
        right={
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setModalEmpleado(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors shadow-sm">
              <Plus size={15} /> Registrar Nuevo Empleado
            </button>
            <button onClick={() => setModalPago(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-[#7a6020] text-white rounded-lg text-sm font-semibold hover:bg-[#5c4718] transition-colors shadow-sm">
              <Plus size={15} /> Registrar Pago Nómina
            </button>
          </div>
        }
      />

      {loading && <LoadingState>Cargando...</LoadingState>}
      {error && <ErrorState message={error} />}

      {rh && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              icono={Users}
              label="Headcount activo"
              value={rh.headcountActivo}
              color={GOLD_RAMP[1]}
              delta={<DeltaPill pct={rh.comparativas?.headcountActivo?.deltaPct} suffix=" YoY" compact />}
            />
            <MetricCard
              icono={RefreshCw}
              label="Rotación del año"
              value={rh.rotacionAnual != null ? `${(rh.rotacionAnual * 100).toFixed(0)}%` : '—'}
              sub={`${rh.bajasDelAnio} bajas este año`}
              color={colorRotacion(rh.rotacionAnual)}
              delta={<DeltaPill pct={rh.comparativas?.rotacionAnual?.deltaPct} suffix=" YoY" invert compact />}
            />
            <MetricCard
              icono={Clock}
              label="Antigüedad promedio"
              value={rh.antiguedadPromedio != null ? `${rh.antiguedadPromedio.toFixed(1)} años` : '—'}
              color="#8a94a6"
              delta={<DeltaPill pct={rh.comparativas?.antiguedadPromedio?.deltaPct} suffix=" YoY" compact />}
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

          {rh.serieAnual && (
            <Card>
              <SectionHeader title="Altas, bajas y headcount activo" sub="Últimos 12 meses" right={<SelectorMes />} />
              <TendenciaHCChart serie={rh.serieAnual} />
            </Card>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <DomainCard to="/rh/rotacion" titulo="Rotación por área" sub="Desglose por área, puesto, costo mensual y lista de colaboradores">
              {rotacion?.areas?.length ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {rotacion.areas.slice(0, 6).map(a => (
                    <div key={a.area} className="rounded-xl p-3.5 flex flex-col" style={{ background: `${colorRotacion(a.rotacion)}0d` }}>
                      <p className="text-[11px] font-semibold text-gray-500 truncate">{a.area}</p>
                      <p className="text-2xl font-bold tabular-nums mt-1.5 leading-none" style={{ color: colorRotacion(a.rotacion) }}>
                        {a.rotacion != null ? `${Math.round(a.rotacion * 100)}%` : '—'}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-1.5 tabular-nums">{a.activos} colaboradores</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-300 py-6 text-center">Cargando...</p>
              )}
            </DomainCard>

            <DomainCard to="/rh/asistencia" titulo="Asistencia semanal" sub="Registra descansos, vacaciones, faltas e incapacidades por empleado">
              {asistencia ? (
                <div className="flex items-center gap-6">
                  <DonutGauge pct={pctAsistencia} color={pctAsistencia >= 0.9 ? GOOD : pctAsistencia >= 0.75 ? WARNING : CRITICAL} size={84} stroke={9} label="asistió" />
                  <div className="flex-1 min-w-0">
                    {desgloseAusencias.length === 0 ? (
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${GOOD}14` }}>
                          <Users size={16} style={{ color: GOOD }} />
                        </div>
                        <p className="text-sm font-semibold text-gray-600">Semana completa, sin ausencias</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {desgloseAusencias.map(e => (
                          <div key={e.valor} className="flex items-center gap-2 text-xs">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: e.color }} />
                            <span className="text-gray-600 flex-1">{e.label}</span>
                            <span className="text-gray-800 font-bold tabular-nums flex-shrink-0">{e.valor2}</span>
                          </div>
                        ))}
                      </div>
                    )}
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

      {modalEmpleado && (
        <ModalRegistrarEmpleado
          onClose={() => setModalEmpleado(false)}
          onGuardado={() => { setModalEmpleado(false); cargar() }}
        />
      )}
    </div>
  )
}
