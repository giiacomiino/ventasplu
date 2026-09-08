import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, AlertTriangle, ChevronRight, Clock, CheckCircle2, Plus, Landmark, FileWarning } from 'lucide-react'
import { formatMoney } from '../../utils/formatters'
import { llamar, CRITICAL, WARNING, GOOD } from './shared'
import { Card, PageHeader, LoadingState, ErrorState, StackedUrgencyBar } from './ui'
import { ModalRegistrarFactura } from './cxpShared'

// Egresos LTM: barras pareadas año actual/anterior, mismo patrón que la
// gráfica de Ventas del Dashboard general — para poder comparar de un
// vistazo. A propósito SÍ incluye "Fonda La Trattoria": ese proveedor se
// excluye de rankings por proveedor porque no es un vendor real, pero la
// nómina que pasa por ahí es gasto real de la empresa y debe contar aquí.
function EgresosLTM({ serie, promedioMensual }) {
  const [hover, setHover] = useState(null)
  const fmtK = n => n == null ? '—' : `$${(n / 1000).toFixed(0)}k`
  const valores = serie.flatMap(s => [s.actual ?? 0, s.anterior ?? 0])
  const max = Math.max(...valores, promedioMensual ?? 0, 1) * 1.12
  const alturaPromedio = promedioMensual != null ? (promedioMensual / max) * 100 : null

  return (
    <div>
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="min-w-[720px]">
          <div className="flex gap-1 sm:gap-3 mb-2">
            {serie.map((s, i) => {
              const yoyPct = s.anterior ? ((s.actual - s.anterior) / s.anterior) * 100 : null
              return (
                <div key={i} className="flex-1 flex justify-center">
                  {yoyPct != null && (
                    <span
                      className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap tabular-nums"
                      style={{ color: yoyPct <= 0 ? GOOD : CRITICAL, background: yoyPct <= 0 ? '#f0fdf4' : '#fef2f2' }}
                    >
                      {yoyPct >= 0 ? '+' : ''}{yoyPct.toFixed(0)}%
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          <div className="relative h-40">
            {alturaPromedio != null && (
              <div className="absolute left-0 right-0 border-t-2 border-dashed z-10" style={{ bottom: `${alturaPromedio}%`, borderColor: '#9ca3af' }}>
                <span className="absolute right-0 -translate-y-1/2 text-[10px] font-bold text-gray-500 bg-white pl-1.5 tabular-nums">Prom. {fmtK(promedioMensual)}</span>
              </div>
            )}
            <div className="absolute inset-0 flex items-end gap-3">
              {serie.map((s, i) => (
                <div key={i} className="flex-1 h-full flex items-end justify-center gap-1">
                  {[
                    { key: 'actual', val: s.actual, color: '#8a5a3a', text: '#ffffff' },
                    { key: 'anterior', val: s.anterior, color: '#e5e2da', text: '#57534e' },
                  ].map(bar => {
                    const h = Math.max(((bar.val ?? 0) / max) * 100, bar.val ? 8 : 0)
                    const hk = `${i}-${bar.key}`
                    return (
                      <div
                        key={bar.key}
                        className="flex-1 relative rounded-t-sm cursor-pointer transition-opacity"
                        style={{ height: `${h}%`, background: bar.color, opacity: hover === hk ? 0.75 : 1 }}
                        onMouseEnter={() => setHover(hk)}
                        onMouseLeave={() => setHover(null)}
                      >
                        {hover === hk && (
                          <div className="absolute -top-2 -translate-y-full left-1/2 -translate-x-1/2 z-20 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg pointer-events-none">
                            <p className="font-semibold">{s.mes} · {bar.key === 'actual' ? 'Este año' : 'Año anterior'}</p>
                            <p className="text-gray-300 tabular-nums">{formatMoney(bar.val)}</p>
                          </div>
                        )}
                        {bar.val != null && bar.val > 0 && (
                          <span className="absolute top-1/2 left-0 right-0 -translate-y-1/2 text-center text-[10px] font-bold whitespace-nowrap tabular-nums" style={{ color: bar.text }}>
                            {fmtK(bar.val)}
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
            {serie.map((s, i) => (
              <div key={i} className="flex-1 text-center text-[10px] text-gray-400 font-medium">{s.mes}</div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-4 pt-4 border-t border-gray-50 text-xs text-gray-400">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: '#8a5a3a' }} /> Este año</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm flex-shrink-0 bg-[#e5e2da]" /> Año anterior</span>
      </div>
    </div>
  )
}

// Tarjetas de alerta: solo lectura (no navegan a ningún lado), centradas,
// con un fondo tenue del color del estado en vez del blanco plano de KpiTile.
function AlertaKpi({ label, value, valorColor, sub, tinte }) {
  return (
    <div className="rounded-2xl p-5 text-center flex flex-col items-center gap-1.5" style={{ background: tinte ? `${tinte}0f` : '#f9fafb' }}>
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className="text-2xl sm:text-3xl font-bold tabular-nums" style={{ color: valorColor }}>{value}</p>
      {sub}
    </div>
  )
}

function Bloque({ to, titulo, sub, children, className = '' }) {
  return (
    <Link to={to} className={`block group h-full ${className}`}>
      <Card className="h-full flex flex-col transition-all group-hover:border-[#c49a2e]/40 group-hover:shadow-md">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-gray-900">{titulo}</h2>
            {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
          </div>
          <ChevronRight size={16} className="text-gray-300 group-hover:text-[#c49a2e] group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-0.5" />
        </div>
        <div className="flex-1 min-h-0">{children}</div>
      </Card>
    </Link>
  )
}

export default function BICxP() {
  const [datos, setDatos] = useState(null)
  const [presupuesto, setPresupuesto] = useState(null)
  const [egresos, setEgresos] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [modalRegistro, setModalRegistro] = useState(false)

  useEffect(() => {
    cargarDatos()
    llamar('presupuesto-arbol').then(setPresupuesto).catch(() => {})
    llamar('egresos-ltm').then(setEgresos).catch(() => {})
  }, [])

  function cargarDatos() {
    llamar('pagos-cxp').then(setDatos).catch(e => setError(e.message)).finally(() => setLoading(false))
  }

  // Recurrentes mensuales (cadenciaMeses === 1, según su propio historial)
  // que este mes todavía tienen $0 registrado — recordatorio de qué falta
  // subir. No decide qué pagar (eso es del dueño); solo avisa qué falta
  // capturar. No aplica a proveedores trimestrales/anuales: para esos, $0
  // la mayoría de los meses es normal.
  const pendientesPorSubir = useMemo(() => {
    if (!presupuesto) return []
    return presupuesto.categorias
      .flatMap(c => c.proveedores
        .filter(p => p.cadenciaMeses === 1 && p.gastoActual === 0)
        .map(p => ({ ...p, categoria: c.nombre })))
      .sort((a, b) => (b.impliedBudget ?? 0) - (a.impliedBudget ?? 0))
  }, [presupuesto])

  const mosaicoProveedores = useMemo(() => {
    if (!datos) return []
    const top3 = datos.saldoPorProveedor.slice(0, 3)
    const resto = datos.saldoPorProveedor.slice(3)
    const otros = resto.length > 0
      ? [{ proveedor: `Otros ${resto.length} proveedores`, monto: resto.reduce((s, p) => s + p.monto, 0), facturas: resto.reduce((s, p) => s + p.facturas, 0) }]
      : []
    return [...top3, ...otros]
  }, [datos])

  const salidasPorCuenta = useMemo(() => {
    if (!datos) return []
    const porCuenta = new Map()
    for (const f of datos.pagadas) {
      const cuenta = f.cuentaPago || 'Sin cuenta registrada'
      porCuenta.set(cuenta, (porCuenta.get(cuenta) ?? 0) + f.monto)
    }
    return [...porCuenta.entries()].map(([cuenta, monto]) => ({ cuenta, monto })).sort((a, b) => b.monto - a.monto)
  }, [datos])

  return (
    <div className="w-full px-4 py-4 sm:px-8 sm:py-6 max-w-[1600px] mx-auto space-y-5">
      <div>
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-700 mb-2 transition-colors">
          <ArrowLeft size={15} /> Dashboard
        </Link>
        <PageHeader
          title="Pagos a proveedores"
          sub="Panorama general — clic en cualquier bloque para ver el desglose"
          right={
            <button
              onClick={() => setModalRegistro(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#7a6020] text-white rounded-lg text-sm font-semibold hover:bg-[#5c4718] transition-colors"
            >
              <Plus size={15} /> Registrar factura
            </button>
          }
        />
      </div>

      {modalRegistro && (
        <ModalRegistrarFactura
          onClose={() => setModalRegistro(false)}
          onRegistrada={() => { setModalRegistro(false); cargarDatos() }}
        />
      )}

      {loading && <LoadingState>Cargando...</LoadingState>}
      {error && <ErrorState message={error} />}

      {datos && (
        <>
          {/* ── Alertas: vencidas / próximas / resto — solo informativas ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <AlertaKpi
              label="Vencidas"
              value={formatMoney(datos.totalVencido)}
              valorColor={datos.totalVencido > 0 ? CRITICAL : undefined}
              tinte={CRITICAL}
              sub={datos.facturasVencidas > 0 ? (
                <span className="inline-flex items-center gap-1 font-semibold text-xs" style={{ color: CRITICAL }}>
                  <AlertTriangle size={12} /> {datos.facturasVencidas} facturas
                </span>
              ) : <span className="text-xs text-gray-400">Sin vencidas</span>}
            />
            <AlertaKpi
              label="Próximas (10 días)"
              value={formatMoney(datos.proximas.monto)}
              valorColor={WARNING}
              tinte={WARNING}
              sub={<span className="text-xs text-gray-400">{datos.proximas.facturas} facturas</span>}
            />
            <AlertaKpi
              label="Resto pendiente"
              value={formatMoney(datos.resto.monto)}
              valorColor="#111827"
              tinte={null}
              sub={<span className="text-xs text-gray-400">{datos.resto.facturas} facturas · más de 10 días</span>}
            />
          </div>

          {/* ── Panorama: proveedores, bancos, ritmo de gasto, facturas — todo a un clic ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Bloque to="/pagos/proveedores" titulo="Saldos por proveedor" sub={`${datos.saldoPorProveedor.length} proveedores con saldo`}>
              <div className="grid grid-cols-2 gap-2.5">
                {mosaicoProveedores.map(p => (
                  <div key={p.proveedor} className="bg-gray-50 rounded-lg px-3 py-2.5 min-w-0">
                    <p className="text-xs font-semibold text-gray-600 truncate">{p.proveedor}</p>
                    <p className="text-base font-bold text-[#7a6020] tabular-nums mt-0.5">{formatMoney(p.monto)}</p>
                  </div>
                ))}
              </div>
            </Bloque>

            <Bloque to="/pagos/bancos" titulo="Salidas por cuenta" sub="Pagado en los últimos 30 días">
              <div className="grid grid-cols-2 gap-2.5">
                {salidasPorCuenta.slice(0, 4).map(c => {
                  const sinDato = c.cuenta === 'Sin cuenta registrada'
                  return (
                    <div key={c.cuenta} className="bg-gray-50 rounded-lg px-3 py-2.5 min-w-0 flex items-center gap-2.5">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: sinDato ? '#e5e7eb' : '#7a60201a' }}
                      >
                        <Landmark size={13} className={sinDato ? 'text-gray-400' : 'text-[#7a6020]'} />
                      </div>
                      <div className="min-w-0">
                        <p className={`text-xs font-semibold truncate ${sinDato ? 'text-gray-400 italic' : 'text-gray-600'}`}>{c.cuenta}</p>
                        <p className="text-base font-bold text-[#7a6020] tabular-nums mt-0.5">{formatMoney(c.monto)}</p>
                      </div>
                    </div>
                  )
                })}
                {salidasPorCuenta.length === 0 && <p className="text-sm text-gray-300 col-span-2">Sin pagos en 30 días</p>}
              </div>
            </Bloque>

            <Bloque to="/pagos/pendientes" titulo="Facturas pendientes de subir" sub="Recurrentes mensuales sin registro este mes">
              {presupuesto ? (
                pendientesPorSubir.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center gap-1.5 py-4">
                    <CheckCircle2 size={20} style={{ color: GOOD }} />
                    <p className="text-xs font-semibold" style={{ color: GOOD }}>Todo lo mensual ya está registrado</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {pendientesPorSubir.slice(0, 4).map(p => (
                      <div key={`${p.categoria}-${p.nombre}`} className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#fab21914' }}>
                          <FileWarning size={14} style={{ color: WARNING }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-700 truncate">{p.nombre}</p>
                          <p className="text-[11px] text-gray-400">{p.categoria}</p>
                        </div>
                        <span className="text-xs font-bold text-gray-500 tabular-nums flex-shrink-0">
                          {p.impliedBudget != null ? `~${formatMoney(p.impliedBudget)}` : 'sin registro'}
                        </span>
                      </div>
                    ))}
                    {pendientesPorSubir.length > 4 && (
                      <p className="text-[11px] text-gray-400 pt-1">+{pendientesPorSubir.length - 4} más</p>
                    )}
                  </div>
                )
              ) : (
                <p className="text-xs text-gray-300">Cargando...</p>
              )}
            </Bloque>

            <Bloque to="/pagos/facturas" titulo="Facturas" sub="Urgencia de cobro pendiente">
              <p className="text-2xl font-bold text-gray-900 tabular-nums mb-1">{formatMoney(datos.totalPendiente)}</p>
              <p className="text-xs text-gray-400 mb-4">total por liquidar</p>
              <StackedUrgencyBar
                segments={[
                  {
                    label: 'Vencido', value: datos.totalVencido, color: CRITICAL, textColor: CRITICAL, labelColor: '#ffffff',
                    amountLabel: formatMoney(datos.totalVencido),
                    badge: datos.facturasVencidas > 0 && (
                      <span className="text-[10px] font-bold text-red-700 bg-red-50 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                        <AlertTriangle size={9} /> {datos.facturasVencidas} facturas
                      </span>
                    ),
                  },
                  {
                    label: 'Próx. 10 días', value: datos.proximas.monto, color: WARNING, textColor: '#92400e', labelColor: '#78350f',
                    amountLabel: formatMoney(datos.proximas.monto),
                    badge: datos.proximas.facturas > 0 && (
                      <span className="text-[10px] font-semibold text-gray-400 flex items-center gap-1"><Clock size={9} /> {datos.proximas.facturas}</span>
                    ),
                  },
                  {
                    label: 'Resto pendiente', value: datos.resto.monto, color: '#e5e7eb', textColor: '#9ca3af', labelColor: '#6b7280',
                    amountLabel: formatMoney(datos.resto.monto),
                  },
                ]}
              />
            </Bloque>
          </div>

          {/* ── Egresos LTM: tendencia mensual, ancho completo ── */}
          <Card>
            <div className="flex items-start justify-between gap-3 mb-1">
              <div>
                <h2 className="text-sm font-bold text-gray-900">Egresos · últimos 12 meses</h2>
                <p className="text-[11px] text-gray-400 mt-0.5">Comparativo año anterior · incluye nómina</p>
              </div>
              {egresos && (
                <span
                  className="text-xs font-bold px-2 py-1 rounded-full flex-shrink-0 tabular-nums"
                  style={{ color: (egresos.yoyPct ?? 0) <= 0 ? GOOD : CRITICAL, background: (egresos.yoyPct ?? 0) <= 0 ? '#f0fdf4' : '#fef2f2' }}
                >
                  {egresos.yoyPct != null ? `${egresos.yoyPct >= 0 ? '+' : ''}${egresos.yoyPct.toFixed(1)}% YoY` : '—'}
                </span>
              )}
            </div>
            {egresos ? (
              <EgresosLTM serie={egresos.serie} promedioMensual={egresos.promedioMensual} />
            ) : (
              <p className="text-xs text-gray-300 py-8 text-center">Cargando...</p>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
