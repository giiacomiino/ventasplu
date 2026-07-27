import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, AlertTriangle, CheckCircle2, Clock, RefreshCw } from 'lucide-react'
import { formatMoney } from '../../utils/formatters'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useHistorial } from '../../hooks/useHistorial'
import { llamar, refrescarBI, GOOD, WARNING, CRITICAL, GOLD_RAMP } from './shared'
import { Card, PageHeader, KpiTile, DeltaPill, LoadingState, ErrorState, DonutGauge, SemicircleGauge, StackedUrgencyBar } from './ui'

function minutosDesde(fecha) {
  const min = Math.max(0, Math.round((Date.now() - fecha) / 60000))
  if (min < 1) return 'hace unos segundos'
  if (min === 1) return 'hace 1 min'
  return `hace ${min} min`
}

function DomainCard({ to, titulo, sub, children, span = 1 }) {
  return (
    <Link to={to} className={`block group ${span === 2 ? 'col-span-2' : ''}`}>
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

// ─── Ventas: barras pareadas YoY + línea de promedio ───────────────────────

function VentasChart({ serie, promedioGeneral }) {
  const [hover, setHover] = useState(null)
  const fmtK = n => n == null ? '—' : `$${(n / 1000).toFixed(0)}k`
  const valores = serie.flatMap(s => [s.actual ?? 0, s.anterior ?? 0])
  // headroom del 12% para que la barra más alta no toque el borde del área
  const max = Math.max(...valores, promedioGeneral ?? 0, 1) * 1.12
  const alturaPromedio = promedioGeneral != null ? (promedioGeneral / max) * 100 : null

  return (
    <div>
    <div className="overflow-x-auto -mx-1 px-1">
    <div className="min-w-[640px]">
      <div className="flex gap-1 sm:gap-3 mb-2">
        {serie.map((s, i) => {
          const yoyPct = s.anterior ? ((s.actual - s.anterior) / s.anterior) * 100 : null
          return (
            <div key={i} className="flex-1 flex justify-center">
              <DeltaPill pct={yoyPct} suffix=" YoY" />
            </div>
          )
        })}
      </div>
      <div className="relative h-48">
        {alturaPromedio != null && (
          <div
            className="absolute left-0 right-0 border-t-2 border-dashed z-10"
            style={{ bottom: `${alturaPromedio}%`, borderColor: '#9ca3af' }}
          >
            <span className="absolute right-0 -translate-y-1/2 text-[10px] font-bold text-gray-500 bg-white pl-1.5">
              Prom. {fmtK(promedioGeneral)}
            </span>
          </div>
        )}
        <div className="absolute inset-0 flex items-end gap-3">
          {serie.map((s, i) => (
            <div key={i} className="flex-1 h-full flex items-end justify-center gap-1">
              {[
                { key: 'actual', val: s.actual, color: GOLD_RAMP[1], text: '#ffffff', etiqueta: 'Este año' },
                { key: 'anterior', val: s.anterior, color: '#e5e2da', text: '#57534e', etiqueta: 'Año anterior' },
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
                        <p className="font-semibold">{s.mes} · {bar.etiqueta}</p>
                        <p className="text-gray-300">{formatMoney(bar.val)}</p>
                      </div>
                    )}
                    {bar.val != null && (
                      <span
                        className="absolute top-1/2 left-0 right-0 -translate-y-1/2 text-center text-[10px] font-bold whitespace-nowrap"
                        style={{ color: bar.text }}
                      >
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
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: GOLD_RAMP[1] }} /> Este año</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm flex-shrink-0 bg-[#e5e2da]" /> Año anterior</span>
      </div>
    </div>
  )
}

function estadoBurn(pct) {
  if (pct == null) return GOOD
  if (pct >= 1) return CRITICAL
  if (pct >= 0.9) return '#ec835a'
  if (pct >= 0.7) return WARNING
  return GOOD
}

export default function BIOverview() {
  const [ventas, setVentas] = useState(null)
  const [anual, setAnual] = useState(null)
  const [negocio, setNegocio] = useState(null)
  const [pagos, setPagos] = useState(null)
  const [rh, setRh] = useState(null)
  const [financiero, setFinanciero] = useState(null)
  const [cierre, setCierre] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [actualizado, setActualizado] = useState(Date.now())
  const { data: historialPlu } = useHistorial(2)

  function cargar() {
    setLoading(true)
    Promise.allSettled([
      llamar('resumen-ventas'),
      llamar('resumen-ventas-anual'),
      llamar('resumen-negocio'),
      llamar('resumen-pagos'),
      llamar('resumen-rh'),
      llamar('resumen-financiero'),
      llamar('tendencia-cierre'),
    ]).then(([r1, r2, r3, r4, r5, r6, r7]) => {
      if (r1.status === 'fulfilled') setVentas(r1.value)
      if (r2.status === 'fulfilled') setAnual(r2.value)
      if (r3.status === 'fulfilled') setNegocio(r3.value)
      if (r4.status === 'fulfilled') setPagos(r4.value)
      if (r5.status === 'fulfilled') setRh(r5.value)
      if (r6.status === 'fulfilled') setFinanciero(r6.value)
      if (r7.status === 'fulfilled') setCierre(r7.value)
      const err = [r1, r2, r3, r4, r5, r6, r7].find(r => r.status === 'rejected')
      setError(err ? err.reason.message : '')
      setLoading(false)
      setActualizado(Date.now())
    })
  }

  useEffect(cargar, [])

  function refrescar() {
    refrescarBI()
    cargar()
  }

  const ayer = ventas?.ayer
  const mtd = ventas?.mtd

  // Cuántos días de rezago hay entre hoy y el último día con venta
  // registrada — para saber de un vistazo si la captura está al día,
  // sin tener que adivinarlo por el monto de "ayer".
  let diasRezagoVenta = null
  if (ayer?.fecha) {
    const hoyMedianoche = new Date(); hoyMedianoche.setHours(0, 0, 0, 0)
    const fechaAyerMedianoche = new Date(ayer.fecha); fechaAyerMedianoche.setHours(0, 0, 0, 0)
    diasRezagoVenta = Math.round((hoyMedianoche - fechaAyerMedianoche) / (24 * 60 * 60 * 1000))
  }
  const ventaAlDia = diasRezagoVenta != null && diasRezagoVenta <= 1
  const categoriasRiesgo = negocio?.presupuesto?.categorias?.filter(c => (c.porcentajeUtilizado ?? 0) >= 0.9) ?? []
  const pctPresupuesto = negocio?.presupuesto?.totalLimite ? negocio.presupuesto.totalGastoReal / negocio.presupuesto.totalLimite : null

  const ventaProyectadaCierre = mtd?.esMesActual ? mtd.proyeccionCierreMes : mtd?.ventaNeta
  const margenOperacionProyectado = cierre && ventaProyectadaCierre != null
    ? ventaProyectadaCierre - cierre.totales.costoDirectoProyectado - cierre.totales.gastosOperacionProyectado
    : null
  const margenOperacionYoyPct = margenOperacionProyectado != null && cierre?.margenAnioAnterior?.margenOperacion
    ? ((margenOperacionProyectado - cierre.margenAnioAnterior.margenOperacion) / cierre.margenAnioAnterior.margenOperacion) * 100
    : null

  let topPlu = []
  if (historialPlu) {
    const currentYm = historialPlu.months.at(-1)
    const flat = []
    for (const cat of Object.values(historialPlu.tree)) {
      for (const sub of Object.values(cat)) {
        for (const p of Object.values(sub.productos)) {
          flat.push({ id: p.id, nombre: p.nombre, monto: p.monthly[currentYm]?.monto ?? 0 })
        }
      }
    }
    topPlu = flat.sort((a, b) => b.monto - a.monto).slice(0, 3)
  }

  return (
    <div className="w-full px-4 py-4 sm:px-8 sm:py-8 max-w-[1700px] mx-auto space-y-6">
      <PageHeader
        title="Panel de operaciones"
        sub={
          <span className="flex items-center gap-2">
            {format(new Date(), "EEEE, d MMM yyyy", { locale: es })} · La Trattoria
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-400 ml-2">
              <span className={`w-1.5 h-1.5 rounded-full bg-green-500 ${loading ? 'animate-pulse' : ''}`} />
              Actualizado {minutosDesde(actualizado)}
            </span>
          </span>
        }
        right={
          <button
            onClick={refrescar}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-800 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
        }
      />

      {ayer?.fecha && (
        <div
          className={`flex items-center gap-2 text-xs font-semibold px-3 py-2.5 rounded-lg border ${
            ventaAlDia ? 'bg-green-50 border-green-100 text-green-700' : 'bg-amber-50 border-amber-100 text-amber-700'
          }`}
        >
          {ventaAlDia ? <CheckCircle2 size={14} className="flex-shrink-0" /> : <AlertTriangle size={14} className="flex-shrink-0" />}
          <span>
            Venta registrada hasta: <span className="capitalize">{format(new Date(ayer.fecha), "EEEE d 'de' MMMM", { locale: es })}</span>
            {!ventaAlDia && diasRezagoVenta > 0 && ` — ${diasRezagoVenta} día${diasRezagoVenta === 1 ? '' : 's'} de rezago`}
          </span>
        </div>
      )}

      {loading && !ventas && <LoadingState>Cargando datos de VURA...</LoadingState>}
      {error && <ErrorState message={error} />}

      {/* ── KPI hero row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-5">
        {ayer && (
          <KpiTile
            label="Venta neta de ayer"
            value={formatMoney(ayer.ventaNeta)}
            sub={`vs. ${format(new Date(ayer.fecha), 'EEEE', { locale: es })} histórico`}
            delta={<DeltaPill pct={ayer.diferenciaPct} />}
          />
        )}
        {mtd && (
          <KpiTile
            label="Venta neta MTD"
            value={formatMoney(mtd.ventaNeta)}
            sub="mes al día de hoy"
            delta={
              <>
                <DeltaPill pct={mtd.momPct} suffix=" MoM" compact />
                <DeltaPill pct={mtd.yoyPct} suffix=" YoY" compact />
              </>
            }
          />
        )}
        {pctPresupuesto != null && (
          <KpiTile
            label="% Presupuesto usado"
            value={`${(pctPresupuesto * 100).toFixed(0)}%`}
            sub="mes en curso"
            delta={
              <span
                className="text-xs font-bold px-2 py-1 rounded-full"
                style={{
                  color: categoriasRiesgo.length > 0 ? '#92400e' : GOOD,
                  background: categoriasRiesgo.length > 0 ? '#fef3c7' : '#f0fdf4',
                }}
              >
                {categoriasRiesgo.length > 0 ? `${categoriasRiesgo.length} en riesgo` : 'Todo bajo control'}
              </span>
            }
          />
        )}
        {pagos && (
          <KpiTile
            label="C×P pendientes"
            value={formatMoney(pagos.totalPendiente)}
            sub="total por liquidar"
            delta={
              pagos.facturasVencidas > 0 ? (
                <span className="text-xs font-bold px-2 py-1 rounded-full text-red-700 bg-red-50 flex items-center gap-1">
                  <AlertTriangle size={11} /> {pagos.facturasVencidas} vencidas
                </span>
              ) : (
                <span className="text-xs font-bold px-2 py-1 rounded-full text-green-700 bg-green-50">Sin vencidas</span>
              )
            }
          />
        )}
        {rh && (
          <KpiTile
            label="Headcount activo"
            value={rh.headcountActivo}
            sub="colaboradores"
            delta={<span className="text-xs font-semibold text-gray-500">Rotación {rh.rotacionAnual != null ? `${(rh.rotacionAnual * 100).toFixed(0)}%` : '—'} anual</span>}
          />
        )}
      </div>

      {/* ── Ventas + Presupuesto ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {anual?.serie && (
          <DomainCard
            to="/business-intelligence/ventas"
            titulo="Ventas"
            sub={`Venta neta promedio mensual · comparativo año anterior${mtd?.proyeccionCierreMes ? ` · proyección de cierre ${formatMoney(mtd.proyeccionCierreMes)}` : ''}`}
            span={2}
          >
            <VentasChart serie={anual.serie.slice(-6)} promedioGeneral={anual.promedioGeneral} />
          </DomainCard>
        )}

        {negocio?.presupuesto && (
          <DomainCard to="/business-intelligence/presupuesto" titulo="Presupuesto" sub={`Uso vs. límite por categoría · ${format(new Date(negocio.presupuesto.mes), 'MMMM', { locale: es })}`}>
            <div>
              <div className="flex items-center justify-center gap-6 py-1 mb-6">
                <DonutGauge pct={pctPresupuesto ?? 0} color={estadoBurn(pctPresupuesto)} size={104} stroke={11} />
                <div className="text-center">
                  <p className="text-xs text-gray-400 font-semibold mb-1">Ritmo vs. ideal</p>
                  <p className="text-sm font-bold" style={{ color: (pctPresupuesto ?? 0) > (negocio.presupuesto.ritmoIdeal ?? 0) ? '#ec835a' : GOOD }}>
                    {(pctPresupuesto ?? 0) > (negocio.presupuesto.ritmoIdeal ?? 0) ? 'Por arriba del ideal' : 'Dentro del ideal'}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">Día {negocio.presupuesto.diasTranscurridos} de {negocio.presupuesto.diasDelMes}</p>
                </div>
              </div>
              <div className="space-y-3">
                {negocio.presupuesto.categorias.slice(0, 4).map(c => (
                  <div key={c.nombre} className="flex items-center gap-3 text-xs">
                    <span className="w-24 truncate text-gray-600 font-medium flex-shrink-0">{c.nombre}</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.min(Math.max(c.porcentajeUtilizado ?? 0, 0) * 100, 100)}%`, background: estadoBurn(c.porcentajeUtilizado) }}
                      />
                    </div>
                    <span className="font-bold text-gray-600 w-9 text-right tabular-nums flex-shrink-0">
                      {c.porcentajeUtilizado != null ? `${(c.porcentajeUtilizado * 100).toFixed(0)}%` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </DomainCard>
        )}
      </div>

      {/* ── Proveedores + Pagos + RH ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {negocio?.proveedores && (
          <DomainCard to="/business-intelligence/proveedores" titulo="Proveedores" sub={`Top ${Math.min(5, negocio.proveedores.top.length)} por gasto · 30 días`}>
            <div className="space-y-2.5 mb-4">
              {negocio.proveedores.top.slice(0, 5).map((p, i) => (
                <div key={p.nombre}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-gray-700 truncate">{p.nombre}</span>
                    <span className="font-bold text-gray-800 flex-shrink-0 ml-2">{formatMoney(p.totalGastado)}</span>
                  </div>
                  <div className="h-1.5 bg-gray-50 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(p.totalGastado / negocio.proveedores.top[0].totalGastado) * 100}%`, background: GOLD_RAMP[i % GOLD_RAMP.length] }} />
                  </div>
                </div>
              ))}
            </div>
            {negocio.proveedores.concentracionTop3 != null && (
              <div className="flex items-center justify-center gap-4 pt-4 border-t border-gray-50">
                <DonutGauge pct={negocio.proveedores.concentracionTop3} color={negocio.proveedores.concentracionTop3 >= 0.5 ? '#ec835a' : GOOD} size={56} stroke={7} />
                <div className="text-center">
                  <p className="text-xs font-bold text-gray-700">Concentración top 3</p>
                  {negocio.proveedores.concentracionTop3 >= 0.5 && (
                    <p className="text-[11px] font-semibold" style={{ color: '#ec835a' }}>Alta dependencia</p>
                  )}
                </div>
              </div>
            )}
          </DomainCard>
        )}

        {pagos && (
          <DomainCard to="/business-intelligence/pagos" titulo="Cuentas por pagar" sub="Urgencia de cobro pendiente">
            <p className="text-2xl font-bold text-gray-900 tabular-nums mb-1">{formatMoney(pagos.totalPendiente)}</p>
            <p className="text-xs text-gray-400 mb-4">total por liquidar</p>
            <StackedUrgencyBar
              segments={[
                {
                  label: 'Vencido', value: pagos.totalVencido, color: CRITICAL, textColor: CRITICAL, labelColor: '#ffffff',
                  amountLabel: formatMoney(pagos.totalVencido),
                  badge: pagos.facturasVencidas > 0 && (
                    <span className="text-[10px] font-bold text-red-700 bg-red-50 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                      <AlertTriangle size={9} /> {pagos.facturasVencidas} facturas
                    </span>
                  ),
                },
                {
                  label: 'Próx. 7 días', value: pagos.totalProximos7, color: WARNING, textColor: '#92400e', labelColor: '#78350f',
                  amountLabel: formatMoney(pagos.totalProximos7),
                  badge: pagos.facturasProximos7 > 0 && (
                    <span className="text-[10px] font-semibold text-gray-400 flex items-center gap-1"><Clock size={9} /> {pagos.facturasProximos7}</span>
                  ),
                },
                {
                  label: 'Resto pendiente',
                  value: Math.max(pagos.totalPendiente - pagos.totalVencido - pagos.totalProximos7, 0),
                  color: '#e5e7eb', textColor: '#9ca3af', labelColor: '#6b7280',
                  amountLabel: formatMoney(Math.max(pagos.totalPendiente - pagos.totalVencido - pagos.totalProximos7, 0)),
                },
              ]}
            />
          </DomainCard>
        )}

        {rh && (
          <DomainCard to="/business-intelligence/rh" titulo="Recursos Humanos" sub="Headcount · nómina estimada">
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <p className="text-3xl font-bold text-gray-900 tabular-nums">{rh.headcountActivo}</p>
                <p className="text-xs text-gray-400">colaboradores activos</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">Rotación anual</p>
                <p className="text-lg font-bold text-gray-800">{rh.rotacionAnual != null ? `${(rh.rotacionAnual * 100).toFixed(0)}%` : '—'}</p>
              </div>
            </div>
            <div className="space-y-2.5 mb-4">
              {rh.hcPorArea.slice(0, 3).map(a => (
                <div key={a.nombre} className="flex items-center gap-3 text-xs" title={a.nombre}>
                  <span className="w-24 truncate text-gray-600 font-medium flex-shrink-0">{a.nombre}</span>
                  <div className="flex-1 h-1.5 bg-gray-50 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(a.headcount / rh.hcPorArea[0].headcount) * 100}%`, background: GOLD_RAMP[1] }} />
                  </div>
                  <span className="font-bold text-gray-600 tabular-nums w-6 text-right flex-shrink-0">{a.headcount}</span>
                </div>
              ))}
            </div>
            <div className="pt-4 border-t border-gray-50">
              <p className="text-xs text-gray-400">Nómina est. mensual</p>
              <p className="text-lg font-bold text-gray-800 tabular-nums">{formatMoney(rh.nominaEstimadaMensual)}</p>
            </div>
          </DomainCard>
        )}
      </div>

      {/* ── Top PLU + Financiero ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <DomainCard to="/business-intelligence/ventas-plu" titulo="Top PLU" sub="Productos más vendidos · mes en curso">
          {topPlu.length === 0 ? (
            <p className="text-xs text-gray-300 py-4">Cargando...</p>
          ) : (
            <div className="space-y-2.5">
              {topPlu.map((p, i) => (
                <div key={p.id}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-gray-700 truncate">{p.nombre}</span>
                    <span className="font-bold text-gray-800 flex-shrink-0 ml-2">{formatMoney(p.monto)}</span>
                  </div>
                  <div className="h-1.5 bg-gray-50 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(p.monto / topPlu[0].monto) * 100}%`, background: GOLD_RAMP[i % GOLD_RAMP.length] }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </DomainCard>

        {financiero && (
          <DomainCard to="/business-intelligence/financiero" titulo="Panorama financiero" sub="Margen bruto · venta neta YTD" span={2}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center py-2">
              <div className="min-w-0 flex flex-col items-center">
                <SemicircleGauge
                  pct={financiero.margenes.margenBrutoPctMes ?? 0}
                  target={0.35}
                  color={GOLD_RAMP[1]}
                  size={120}
                />
                <p className="text-xs text-gray-400 font-semibold mt-1 whitespace-nowrap">Margen bruto (mes)</p>
              </div>

              <div className="min-w-0 text-center border-x border-gray-50 px-3">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 whitespace-nowrap">Venta neta YTD</p>
                <p className="text-2xl font-bold text-gray-900 tabular-nums mb-3 truncate" title={formatMoney(financiero.kpis.ventaNetaYTD)}>
                  {formatMoney(financiero.kpis.ventaNetaYTD)}
                </p>
                <DeltaPill pct={financiero.kpis.ventaNetaYTDAnteriorPct} suffix=" YoY" />
              </div>

              <div className="min-w-0 space-y-3">
                <div className="flex justify-between items-baseline gap-2 text-sm">
                  <span className="text-gray-400 truncate">Margen bruto YTD</span>
                  <span className="font-bold text-gray-800 tabular-nums flex-shrink-0">{financiero.margenesYTD.margenBrutoPctYTD != null ? `${(financiero.margenesYTD.margenBrutoPctYTD * 100).toFixed(0)}%` : '—'}</span>
                </div>
                <div className="flex justify-between items-baseline gap-2 text-sm">
                  <span className="text-gray-400 truncate">Margen operación (mes)</span>
                  <span className="font-bold text-gray-800 tabular-nums flex-shrink-0">{financiero.margenes.margenOperacionPctMes != null ? `${(financiero.margenes.margenOperacionPctMes * 100).toFixed(0)}%` : '—'}</span>
                </div>
                <div className="flex justify-between items-baseline gap-2 text-sm">
                  <span className="text-gray-400 truncate">Margen operación YTD</span>
                  <span className="font-bold text-gray-800 tabular-nums">{financiero.margenesYTD.margenOperacionPctYTD != null ? `${(financiero.margenesYTD.margenOperacionPctYTD * 100).toFixed(0)}%` : '—'}</span>
                </div>
              </div>
            </div>
          </DomainCard>
        )}

        <div className="col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-6">
          {cierre && (
            <DomainCard
              to="/business-intelligence/tendencia-cierre"
              titulo="Tendencia de cierre"
              sub="Cómo vamos a cerrar el mes, no cómo vamos hoy"
            >
              <div className="flex items-center gap-6 py-1">
                <DonutGauge
                  pct={ventaProyectadaCierre ? (margenOperacionProyectado ?? 0) / ventaProyectadaCierre : 0}
                  color={GOLD_RAMP[1]}
                  size={92}
                  stroke={9}
                />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Margen de operación proyectado</p>
                  <p className="text-2xl font-bold text-gray-900 tabular-nums mb-1.5 truncate">{formatMoney(margenOperacionProyectado)}</p>
                  <DeltaPill pct={margenOperacionYoyPct} suffix=" YoY" />
                </div>
              </div>
            </DomainCard>
          )}

          <DomainCard
            to="/business-intelligence/reporte-semanal"
            titulo="Reporte semanal"
            sub="Lunes a domingo — para reportar a dirección"
          >
            <p className="text-sm text-gray-400 py-2">
              Venta vs. promedio y YoY, gasto por categoría, pagos fuertes y movimientos de RH de la semana — navega otras semanas y exporta a PDF.
            </p>
          </DomainCard>
        </div>
      </div>
    </div>
  )
}
