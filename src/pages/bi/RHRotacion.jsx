import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronRight, X, Users, RefreshCw, Wallet, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatMoney } from '../../utils/formatters'
import { llamar, CRITICAL, GOOD, GOLD_RAMP, WARNING } from './shared'
import { Card, PageHeader, SectionHeader, LoadingState, ErrorState, EmptyState } from './ui'
import Modal from '../../components/ui/Modal'

function colorRotacion(pct) {
  if (pct == null) return '#9ca3af'
  if (pct >= 0.5) return CRITICAL
  if (pct >= 0.25) return '#ec835a'
  return GOOD
}

function fechaCorta(iso) {
  if (!iso) return '—'
  try { return format(new Date(iso), 'd MMM yyyy', { locale: es }) } catch { return '—' }
}

function agruparPorPuesto(colaboradores) {
  const m = new Map()
  for (const c of colaboradores) {
    if (!m.has(c.puesto)) m.set(c.puesto, [])
    m.get(c.puesto).push(c)
  }
  return [...m.entries()].map(([titulo, lista]) => ({ titulo, colaboradores: lista }))
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
        {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function FilaClicable({ onClick, children }) {
  return (
    <tr onClick={onClick} className="border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50 transition-colors group">
      {children}
    </tr>
  )
}

function ListaNombres({ grupos, onClickNombre }) {
  return (
    <Card>
      <SectionHeader title="Colaboradores" sub="Click en un nombre para ver su detalle completo" />
      <div className="space-y-4">
        {grupos.map(g => (
          <div key={g.titulo}>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">{g.titulo} · {g.colaboradores.length}</p>
            <div className="flex flex-wrap gap-2">
              {g.colaboradores.map((c, i) => (
                <button
                  key={`${c.nombre}-${i}`}
                  onClick={() => onClickNombre(c, g.titulo)}
                  className="inline-flex items-center gap-1.5 pl-2.5 pr-3 py-1.5 rounded-full bg-gray-50 hover:bg-gray-100 border border-gray-100 hover:border-gray-200 text-xs font-semibold text-gray-700 transition-colors"
                >
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: c.estatus === 'Activo' ? GOOD : '#d1d5db' }} />
                  {c.nombre}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function ColaboradorModal({ c, onClose }) {
  return (
    <Modal onClose={onClose} maxWidth="max-w-lg">
      <div className="p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-xl font-bold text-gray-900">{c.nombre}</h3>
            <p className="text-sm text-gray-400">{c.puesto} · {c.area}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0"><X size={20} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="rounded-xl px-4 py-3" style={{ background: c.estatus === 'Activo' ? `${GOOD}14` : '#f3f4f6' }}>
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: c.estatus === 'Activo' ? GOOD : '#6b7280' }}>Estatus</p>
            <p className="text-sm font-bold mt-0.5" style={{ color: c.estatus === 'Activo' ? GOOD : '#6b7280' }}>{c.estatus}</p>
          </div>
          <div className="rounded-xl bg-gray-50 px-4 py-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Costo mensual</p>
            <p className="text-sm font-bold text-gray-800 mt-0.5 tabular-nums">{c.costoMensual ? formatMoney(c.costoMensual) : '—'}</p>
          </div>
          <div className="rounded-xl bg-gray-50 px-4 py-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Fecha ingreso</p>
            <p className="text-sm font-bold text-gray-800 mt-0.5">{fechaCorta(c.fechaIngreso)}</p>
          </div>
          <div className="rounded-xl bg-gray-50 px-4 py-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Antigüedad</p>
            <p className="text-sm font-bold text-gray-800 mt-0.5 tabular-nums">{c.antiguedadMeses} meses · {(c.antiguedadMeses / 12).toFixed(1)} años</p>
          </div>
          {c.estatus !== 'Activo' && (
            <div className="rounded-xl bg-gray-50 px-4 py-3 col-span-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Fecha salida</p>
              <p className="text-sm font-bold text-gray-800 mt-0.5">{fechaCorta(c.fechaSalida)}</p>
            </div>
          )}
        </div>

        {c.vacaciones && (
          <div className="mb-5">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Vacaciones (por antigüedad)</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-gray-50 px-3 py-2.5 text-center">
                <p className="text-lg font-bold text-gray-800 tabular-nums">{c.vacaciones.correspondientes}</p>
                <p className="text-[10px] text-gray-400">correspondientes</p>
              </div>
              <div className="rounded-xl bg-gray-50 px-3 py-2.5 text-center">
                <p className="text-lg font-bold text-gray-800 tabular-nums">{c.vacaciones.tomados}</p>
                <p className="text-[10px] text-gray-400">tomados</p>
              </div>
              <div className="rounded-xl px-3 py-2.5 text-center" style={{ background: `${GOLD_RAMP[1]}14` }}>
                <p className="text-lg font-bold tabular-nums" style={{ color: GOLD_RAMP[1] }}>{c.vacaciones.disponibles}</p>
                <p className="text-[10px] text-gray-400">disponibles</p>
              </div>
            </div>
          </div>
        )}

        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Ausencias este año</p>
          <div className="grid grid-cols-4 gap-2">
            <div className="rounded-xl bg-gray-50 px-2 py-2.5 text-center">
              <p className="text-base font-bold text-gray-700 tabular-nums">{c.ausenciasAnio?.descanso ?? 0}</p>
              <p className="text-[10px] text-gray-400">Descansos</p>
            </div>
            <div className="rounded-xl px-2 py-2.5 text-center" style={{ background: `${CRITICAL}14` }}>
              <p className="text-base font-bold tabular-nums" style={{ color: CRITICAL }}>{c.ausenciasAnio?.falta ?? 0}</p>
              <p className="text-[10px] text-gray-400">Faltas</p>
            </div>
            <div className="rounded-xl px-2 py-2.5 text-center" style={{ background: `${WARNING}14` }}>
              <p className="text-base font-bold tabular-nums" style={{ color: WARNING }}>{c.ausenciasAnio?.incapacidad ?? 0}</p>
              <p className="text-[10px] text-gray-400">Incapacidades</p>
            </div>
            <div className="rounded-xl bg-gray-50 px-2 py-2.5 text-center">
              <p className="text-base font-bold text-gray-700 tabular-nums">{c.ausenciasAnio?.permiso ?? 0}</p>
              <p className="text-[10px] text-gray-400">Permisos</p>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default function BIRHRotacion() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [vista, setVista] = useState('areas')
  const [areaSel, setAreaSel] = useState(null)
  const [puestoSel, setPuestoSel] = useState(null)
  const [colaboradorAbierto, setColaboradorAbierto] = useState(null)

  useEffect(() => {
    llamar('rh-rotacion').then(setDatos).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [])

  const area = datos?.areas?.find(a => a.area === areaSel)
  const colaboradoresDelPuesto = area?.colaboradores.filter(c => c.puesto === puestoSel) ?? []
  const puestoInfo = area?.porPuesto.find(p => p.puesto === puestoSel)

  function irAArea(nombreArea) {
    setAreaSel(nombreArea)
    setVista('puestos')
  }
  function irAPuesto(nombrePuesto) {
    setPuestoSel(nombrePuesto)
    setVista('colaboradores')
  }
  function abrirColaborador(c, areaNombre) {
    setColaboradorAbierto({ ...c, area: areaNombre ?? areaSel })
  }

  const totales = datos?.areas?.reduce((acc, a) => ({
    activos: acc.activos + a.activos,
    bajasDelAnio: acc.bajasDelAnio + a.bajasDelAnio,
    costoMensual: acc.costoMensual + a.costoMensual,
  }), { activos: 0, bajasDelAnio: 0, costoMensual: 0 })

  const gruposAreas = datos?.areas?.map(a => ({ titulo: a.area, colaboradores: a.colaboradores })) ?? []
  const gruposPuestos = area ? agruparPorPuesto(area.colaboradores) : []

  return (
    <div className="w-full px-4 py-4 sm:px-8 sm:py-8 max-w-[1600px] mx-auto space-y-8">
      <div>
        <Link to="/rh" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-700 mb-3 transition-colors">
          <ArrowLeft size={15} /> RH
        </Link>
        <div className="flex items-center gap-1.5 text-sm font-medium mb-1">
          <button onClick={() => { setVista('areas'); setAreaSel(null); setPuestoSel(null) }} className={vista === 'areas' ? 'text-gray-900 font-bold' : 'text-gray-400 hover:text-gray-700'}>
            Áreas
          </button>
          {areaSel && (
            <>
              <ChevronRight size={14} className="text-gray-300" />
              <button onClick={() => { setVista('puestos'); setPuestoSel(null) }} className={vista === 'puestos' ? 'text-gray-900 font-bold' : 'text-gray-400 hover:text-gray-700'}>
                {areaSel}
              </button>
            </>
          )}
          {puestoSel && (
            <>
              <ChevronRight size={14} className="text-gray-300" />
              <span className="text-gray-900 font-bold">{puestoSel}</span>
            </>
          )}
        </div>
        <PageHeader
          title="Rotación por área"
          sub={
            vista === 'areas' ? 'Colaboradores, rotación y costo mensual por área'
            : vista === 'puestos' ? `Desglose por puesto dentro de ${areaSel}`
            : `Colaboradores en ${puestoSel} · ${areaSel}`
          }
        />
      </div>

      {loading && <LoadingState>Cargando...</LoadingState>}
      {error && <ErrorState message={error} />}

      {!loading && vista === 'areas' && datos && (
        <>
          {totales && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <MetricCard icono={Users} label="Colaboradores activos" value={totales.activos} color={GOLD_RAMP[1]} />
              <MetricCard icono={AlertTriangle} label="Bajas del año" value={totales.bajasDelAnio} color={CRITICAL} />
              <MetricCard icono={Wallet} label="Costo mensual total" value={formatMoney(totales.costoMensual)} color={GOOD} />
            </div>
          )}
          <Card padded={false}>
            {datos.areas.length === 0 ? (
              <EmptyState>Sin áreas registradas.</EmptyState>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Área</th>
                    <th className="text-right px-6 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Colaboradores</th>
                    <th className="text-right px-6 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Rotación</th>
                    <th className="text-right px-6 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Costo mensual</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {datos.areas.map(a => (
                    <FilaClicable key={a.area} onClick={() => irAArea(a.area)}>
                      <td className="px-6 py-3.5 text-gray-800 font-bold">{a.area}</td>
                      <td className="px-6 py-3.5 text-right text-gray-600 tabular-nums">{a.activos}</td>
                      <td className="px-6 py-3.5 text-right font-semibold tabular-nums" style={{ color: colorRotacion(a.rotacion) }}>
                        {a.rotacion != null ? `${(a.rotacion * 100).toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-6 py-3.5 text-right text-gray-800 font-bold tabular-nums">{formatMoney(a.costoMensual)}</td>
                      <td className="px-2"><ChevronRight size={16} className="text-gray-300 group-hover:text-gray-500 transition-colors" /></td>
                    </FilaClicable>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {gruposAreas.length > 0 && <ListaNombres grupos={gruposAreas} onClickNombre={abrirColaborador} />}
        </>
      )}

      {!loading && vista === 'puestos' && area && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MetricCard icono={Users} label="Colaboradores activos" value={area.activos} color={GOLD_RAMP[1]} />
            <MetricCard
              icono={RefreshCw}
              label="Rotación"
              value={area.rotacion != null ? `${(area.rotacion * 100).toFixed(1)}%` : '—'}
              sub={`${area.bajasDelAnio} bajas del año`}
              color={colorRotacion(area.rotacion)}
            />
            <MetricCard icono={Wallet} label="Costo mensual" value={formatMoney(area.costoMensual)} color={GOOD} />
          </div>
          <Card padded={false}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Puesto</th>
                  <th className="text-right px-6 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Colaboradores</th>
                  <th className="text-right px-6 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Rotación</th>
                  <th className="text-right px-6 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Costo mensual</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {area.porPuesto.map(p => (
                  <FilaClicable key={p.puesto} onClick={() => irAPuesto(p.puesto)}>
                    <td className="px-6 py-3.5 text-gray-800 font-bold">{p.puesto}</td>
                    <td className="px-6 py-3.5 text-right text-gray-600 tabular-nums">{p.activos}</td>
                    <td className="px-6 py-3.5 text-right font-semibold tabular-nums" style={{ color: colorRotacion(p.rotacion) }}>
                      {p.rotacion != null ? `${(p.rotacion * 100).toFixed(0)}%` : '—'}
                    </td>
                    <td className="px-6 py-3.5 text-right text-gray-800 font-bold tabular-nums">{formatMoney(p.costoMensual)}</td>
                    <td className="px-2"><ChevronRight size={16} className="text-gray-300 group-hover:text-gray-500 transition-colors" /></td>
                  </FilaClicable>
                ))}
              </tbody>
            </table>
          </Card>

          {gruposPuestos.length > 0 && <ListaNombres grupos={gruposPuestos} onClickNombre={c => abrirColaborador(c, areaSel)} />}
        </>
      )}

      {!loading && vista === 'colaboradores' && area && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MetricCard icono={Users} label="Colaboradores" value={puestoInfo?.activos ?? colaboradoresDelPuesto.length} color={GOLD_RAMP[1]} />
            <MetricCard
              icono={RefreshCw}
              label="Rotación"
              value={puestoInfo?.rotacion != null ? `${(puestoInfo.rotacion * 100).toFixed(1)}%` : '—'}
              sub={`${puestoInfo?.bajasDelAnio ?? 0} bajas del año`}
              color={colorRotacion(puestoInfo?.rotacion)}
            />
            <MetricCard icono={Wallet} label="Costo mensual" value={formatMoney(puestoInfo?.costoMensual ?? 0)} color={GOOD} />
          </div>
          <Card padded={false}>
            {colaboradoresDelPuesto.length === 0 ? (
              <EmptyState>Sin colaboradores en este puesto.</EmptyState>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Nombre</th>
                    <th className="text-right px-6 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Antigüedad</th>
                    <th className="text-right px-6 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Vacaciones</th>
                    <th className="text-right px-6 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Disponibles</th>
                    <th className="text-right px-6 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Estatus</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {colaboradoresDelPuesto.map((c, i) => (
                    <FilaClicable key={`${c.nombre}-${i}`} onClick={() => abrirColaborador(c)}>
                      <td className="px-6 py-3 text-gray-700 font-medium">{c.nombre}</td>
                      <td className="px-6 py-3 text-right text-gray-500 tabular-nums">{c.antiguedadMeses} meses</td>
                      <td className="px-6 py-3 text-right text-gray-500 tabular-nums">{c.vacaciones ? `${c.vacaciones.correspondientes} días` : '—'}</td>
                      <td className="px-6 py-3 text-right font-bold tabular-nums" style={{ color: c.vacaciones ? GOLD_RAMP[1] : '#9ca3af' }}>
                        {c.vacaciones ? `${c.vacaciones.disponibles} días` : '—'}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span
                          className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold"
                          style={{
                            background: c.estatus === 'Activo' ? `${GOOD}1a` : '#f3f4f6',
                            color: c.estatus === 'Activo' ? GOOD : '#6b7280',
                          }}
                        >
                          {c.estatus}
                        </span>
                      </td>
                      <td className="px-2"><ChevronRight size={16} className="text-gray-300 group-hover:text-gray-500 transition-colors" /></td>
                    </FilaClicable>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}

      {colaboradorAbierto && (
        <ColaboradorModal c={colaboradorAbierto} onClose={() => setColaboradorAbierto(null)} />
      )}
    </div>
  )
}
