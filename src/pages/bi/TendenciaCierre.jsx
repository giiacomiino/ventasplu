import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { formatMoney } from '../../utils/formatters'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { llamar, estadoPresupuesto, GOOD, WARNING, CRITICAL, GOLD_RAMP } from './shared'
import { Card, SectionHeader, PageHeader, KpiTile, DeltaPill, MiniBar, DonutGauge, Table, Thead, LoadingState, ErrorState, EmptyState } from './ui'
import { useMesSeleccionado, SelectorMes } from './mesContext'

function Tooltip({ children }) {
  return (
    <div className="absolute -top-2 -translate-y-full z-20 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg pointer-events-none left-1/2 -translate-x-1/2">
      {children}
    </div>
  )
}

function iconoPresupuesto(pct) {
  if (pct == null) return CheckCircle2
  if (pct >= 1) return XCircle
  if (pct >= 0.7) return AlertTriangle
  return CheckCircle2
}

function EstadoBadge({ pct, size = 12 }) {
  const { color, label } = estadoPresupuesto(pct)
  const Icon = iconoPresupuesto(pct)
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0" style={{ color, background: `${color}14` }}>
      <Icon size={size} />
      {label} · {pct != null ? `${(pct * 100).toFixed(0)}%` : '—'}
    </span>
  )
}

function estadoMargen(pct) {
  if (pct == null) return '#9ca3af'
  if (pct >= 0.15) return GOOD
  if (pct >= 0.05) return WARNING
  return CRITICAL
}

// ─── Margen bruto / operación: cards grandes con dona + YoY ────────────────

function MargenHero({ label, valor, pctVenta, yoyPct, sub }) {
  const color = estadoMargen(pctVenta)
  return (
    <Card className="flex items-center gap-6">
      <DonutGauge pct={pctVenta ?? 0} color={color} size={104} stroke={10} />
      <div className="min-w-0">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">{label}</p>
        <p className="text-4xl font-bold text-gray-900 tabular-nums mb-2 leading-none">{formatMoney(valor)}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <DeltaPill pct={yoyPct} suffix=" YoY" />
          {sub && <span className="text-xs text-gray-400">{sub}</span>}
        </div>
      </div>
    </Card>
  )
}

// ─── Tendencia histórica de margen: últimos 6 meses reales + mes proyectado ─

function TendenciaMargenChart({ serie }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(...serie.flatMap(s => [s.margenBruto, s.margenOperacion]), 1) * 1.18

  return (
    <div>
      <div className="relative h-64">
        <div className="absolute inset-0 flex items-end gap-1 sm:gap-4">
          {serie.map((s, i) => (
            <div key={s.mes} className="flex-1 h-full flex flex-col justify-end items-center relative">
              {s.proyectado && (
                <span className="absolute -top-6 left-0 right-0 text-center text-[10px] font-bold uppercase tracking-wider" style={{ color: GOLD_RAMP[1] }}>
                  Proyectado
                </span>
              )}
              <div className="flex-1 w-full flex items-end justify-center gap-1.5">
                {[
                  { key: 'margenBruto', val: s.margenBruto, color: '#e3c780', etiqueta: 'Margen bruto' },
                  { key: 'margenOperacion', val: s.margenOperacion, color: GOLD_RAMP[1], etiqueta: 'Margen de operación' },
                ].map(bar => {
                  const h = Math.max((bar.val / max) * 100, bar.val > 0 ? 6 : 0)
                  const key = `${i}-${bar.key}`
                  return (
                    <div
                      key={bar.key}
                      className="flex-1 relative rounded-t cursor-pointer transition-opacity"
                      style={{ height: `${h}%`, background: bar.color, opacity: hover === key ? 0.7 : s.proyectado ? 0.55 : 1 }}
                      onMouseEnter={() => setHover(key)}
                      onMouseLeave={() => setHover(null)}
                    >
                      {hover === key && (
                        <Tooltip>
                          <p className="font-semibold capitalize">{bar.etiqueta} · {format(new Date(`${s.mes}-01T00:00:00`), 'MMMM yyyy', { locale: es })}{s.proyectado ? ' (proyectado)' : ''}</p>
                          <p className="text-gray-300">{formatMoney(bar.val)}</p>
                        </Tooltip>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-1 sm:gap-4 mt-1.5">
        {serie.map(s => (
          <div key={s.mes} className="flex-1 text-center text-[11px] text-gray-400 font-medium capitalize">
            {format(new Date(`${s.mes}-01T00:00:00`), 'MMM', { locale: es })}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#e3c780' }} /> Margen bruto</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: GOLD_RAMP[1] }} /> Margen de operación</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm opacity-55" style={{ background: GOLD_RAMP[1] }} /> Mes proyectado (no cerrado)</span>
      </div>
    </div>
  )
}

// ─── Categorías con proyección de cierre (árbol categoría → proveedor) ─────

function ProveedorProyeccion({ p }) {
  const { color } = estadoPresupuesto(p.pct)
  return (
    <div className="rounded-lg border border-gray-100 bg-white p-3">
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="text-sm font-semibold text-gray-800 truncate">{p.nombre}</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-sm font-bold text-gray-800 tabular-nums">{formatMoney(p.gastoProyectado)}</span>
          {p.pct != null && <EstadoBadge pct={p.pct} size={10} />}
        </div>
      </div>
      {p.impliedBudget != null && (
        <div className="flex items-center gap-2 mb-2 pl-0">
          <MiniBar pct={p.pct ?? 0} color={color} />
          <span className="text-xs text-gray-400">de {formatMoney(p.impliedBudget)} implícito (su % histórico del límite)</span>
        </div>
      )}
      <p className="text-xs text-gray-400 leading-relaxed">
        {p.facturasRegistradas} de ~{p.facturasEsperadas6m.toFixed(1)} facturas esperadas (prom. 6 meses)
        <span className="text-gray-300"> · </span>
        ticket prom. {formatMoney(p.montoPromedioFactura)}
        {p.facturasFaltantes > 0 && (
          <>
            <span className="text-gray-300"> · </span>
            <span className="font-semibold" style={{ color: GOLD_RAMP[1] }}>
              faltan ~{p.facturasFaltantes} por llegar (+{formatMoney(p.gastoAdicionalProyectado)})
            </span>
          </>
        )}
      </p>
    </div>
  )
}

function CategoriaProyeccion({ c }) {
  const [abierto, setAbierto] = useState(false)
  const { color } = estadoPresupuesto(c.pctProyectado)
  const sobreLimite = c.varianzaProyectada != null && c.varianzaProyectada > 0

  return (
    <div className="border-b border-gray-50 last:border-0">
      <button
        onClick={() => setAbierto(a => !a)}
        className="w-full text-left py-4 hover:bg-gray-50/60 transition-colors px-1 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-400"
      >
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <div className="min-w-0 flex items-center gap-2">
            {abierto ? <ChevronUp size={15} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={15} className="text-gray-400 flex-shrink-0" />}
            <span className="text-sm font-bold text-gray-900">{c.nombre}</span>
            {c.tipo && <span className="text-xs text-gray-400 font-medium">{c.tipo}</span>}
          </div>
          <EstadoBadge pct={c.pctProyectado} />
        </div>
        <div className="flex items-center gap-3 pl-6 flex-wrap">
          <MiniBar pct={c.pctProyectado ?? 0} color={color} />
          <p className="text-xs text-gray-400 flex-shrink-0 tabular-nums">
            {formatMoney(c.gastoProyectado)} <span className="text-gray-300">proyectado de</span> {formatMoney(c.limiteMes)}
          </p>
          {c.varianzaProyectada != null && (
            <span className="text-xs font-bold flex-shrink-0" style={{ color: sobreLimite ? CRITICAL : GOOD }}>
              {sobreLimite ? '+' : ''}{formatMoney(c.varianzaProyectada)} {sobreLimite ? 'sobre el límite' : 'bajo el límite'}
            </span>
          )}
        </div>
      </button>

      {abierto && (
        <div className="ml-6 mr-1 mb-4 p-3 rounded-xl bg-gray-50/70 space-y-2">
          {c.proveedores.length === 0 ? (
            <p className="text-xs text-gray-300 py-3">Sin proveedores en el periodo</p>
          ) : (
            c.proveedores.map(p => <ProveedorProyeccion key={p.nombre} p={p} />)
          )}
        </div>
      )}
    </div>
  )
}

export default function BITendenciaCierre() {
  const { anio, mes } = useMesSeleccionado()
  const [ventas, setVentas] = useState(null)
  const [cierre, setCierre] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.allSettled([llamar('resumen-ventas', { anio, mes }), llamar('tendencia-cierre', { anio, mes })]).then(([r1, r2]) => {
      if (r1.status === 'fulfilled') setVentas(r1.value)
      if (r2.status === 'fulfilled') setCierre(r2.value)
      setError(r1.status === 'rejected' ? r1.reason.message : r2.status === 'rejected' ? r2.reason.message : '')
      setLoading(false)
    })
  }, [anio, mes])

  const ventaProyectada = ventas?.mtd.esMesActual ? ventas.mtd.proyeccionCierreMes : ventas?.mtd.ventaNeta
  const margenBruto = cierre && ventaProyectada != null ? ventaProyectada - cierre.totales.costoDirectoProyectado : null
  const margenOperacion = margenBruto != null && cierre ? margenBruto - cierre.totales.gastosOperacionProyectado : null

  const pctCostoDirecto = cierre?.totales.costoDirectoLimite
    ? ((cierre.totales.costoDirectoProyectado - cierre.totales.costoDirectoLimite) / cierre.totales.costoDirectoLimite) * 100
    : null
  const pctGastosOperacion = cierre?.totales.gastosOperacionLimite
    ? ((cierre.totales.gastosOperacionProyectado - cierre.totales.gastosOperacionLimite) / cierre.totales.gastosOperacionLimite) * 100
    : null
  const ventaYoyPct = ventas?.mtd.esMesActual ? ventas.mtd.proyeccionVsAnioAnteriorPct : ventas?.mtd.yoyPct

  const yoy = (actual, anterior) => actual != null && anterior ? ((actual - anterior) / anterior) * 100 : null
  const margenBrutoYoyPct = cierre ? yoy(margenBruto, cierre.margenAnioAnterior.margenBruto) : null
  const margenOperacionYoyPct = cierre ? yoy(margenOperacion, cierre.margenAnioAnterior.margenOperacion) : null

  const serieTendencia = cierre
    ? [...cierre.tendenciaMensual, { mes: cierre.mes.slice(0, 7), margenBruto: margenBruto ?? 0, margenOperacion: margenOperacion ?? 0, proyectado: cierre.esMesActual }]
    : []

  return (
    <div className="w-full px-4 py-4 sm:px-8 sm:py-8 max-w-[1600px] mx-auto space-y-8">
      <div>
        <Link to="/business-intelligence" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-700 mb-3 transition-colors">
          <ArrowLeft size={15} /> Business Intelligence
        </Link>
        <PageHeader
          title="Tendencia de cierre"
          sub={cierre?.esMesActual
            ? `Cómo vamos a cerrar el mes, no cómo vamos hoy · día ${cierre.diasTranscurridos} de ${cierre.diasDelMes}`
            : 'Mes cerrado — cifras reales, sin proyección'}
          right={<SelectorMes />}
        />
      </div>

      {loading && <LoadingState>Cargando tendencia de cierre...</LoadingState>}
      {error && <ErrorState message={error} />}

      {cierre && ventas && (
        <>
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <MargenHero
              label="Margen bruto proyectado"
              valor={margenBruto}
              pctVenta={ventaProyectada ? margenBruto / ventaProyectada : null}
              yoyPct={margenBrutoYoyPct}
              sub={ventaProyectada ? `${((margenBruto / ventaProyectada) * 100).toFixed(1)}% de la venta` : undefined}
            />
            <MargenHero
              label="Margen de operación proyectado"
              valor={margenOperacion}
              pctVenta={ventaProyectada ? margenOperacion / ventaProyectada : null}
              yoyPct={margenOperacionYoyPct}
              sub={ventaProyectada ? `${((margenOperacion / ventaProyectada) * 100).toFixed(1)}% de la venta` : undefined}
            />
          </section>

          <section className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <KpiTile
              label="Venta neta proyectada"
              value={formatMoney(ventaProyectada)}
              delta={<DeltaPill pct={ventaYoyPct} suffix=" YoY" />}
            />
            <KpiTile
              label="Costo directo proyectado"
              value={formatMoney(cierre.totales.costoDirectoProyectado)}
              delta={<DeltaPill pct={pctCostoDirecto} invert suffix=" vs. límite" />}
            />
            <KpiTile
              label="Gastos de operación proyectados"
              value={formatMoney(cierre.totales.gastosOperacionProyectado)}
              delta={<DeltaPill pct={pctGastosOperacion} invert suffix=" vs. límite" />}
            />
          </section>

          <Card>
            <SectionHeader
              title="Tendencia de margen — últimos 6 meses + cierre proyectado"
              sub="Margen bruto y de operación reales, con el mes en curso proyectado al final"
            />
            <TendenciaMargenChart serie={serieTendencia} />
          </Card>

          <Card padded={false}>
            <div className="p-6 pb-0">
              <SectionHeader
                title="Categorías — proyección de cierre"
                sub="Facturas ya registradas + facturas que históricamente faltan por llegar, a su ticket promedio"
              />
            </div>
            <div className="px-6 pb-2">
              {cierre.categorias.map(c => <CategoriaProyeccion key={c.nombre} c={c} />)}
            </div>
          </Card>

          <Card>
            <SectionHeader
              title="Pagos pendientes hasta el cierre"
              sub="Facturas ya registradas y no pagadas, con vencimiento dentro del mes seleccionado"
              right={
                <div className="text-right">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Total</p>
                  <p className="text-lg font-bold text-gray-800 tabular-nums">{formatMoney(cierre.pagosPendientes.hastaFinDeMes)}</p>
                </div>
              }
            />
            {cierre.pagosPendientes.porProveedor.length === 0 ? (
              <EmptyState>Sin pagos pendientes con vencimiento este mes</EmptyState>
            ) : (
              <Table>
                <Thead columns={['Proveedor', 'Facturas', 'Monto']} />
                <tbody>
                  {cierre.pagosPendientes.porProveedor.map(p => (
                    <tr key={p.nombre} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors">
                      <td className="py-2.5 text-gray-700 font-medium">{p.nombre}</td>
                      <td className="py-2.5 text-right text-gray-500 tabular-nums">{p.facturas}</td>
                      <td className="py-2.5 text-right font-semibold text-gray-800 tabular-nums">{formatMoney(p.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
