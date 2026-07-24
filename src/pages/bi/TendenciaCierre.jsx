import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { formatMoney } from '../../utils/formatters'
import { llamar, estadoPresupuesto, CRITICAL, GOLD_RAMP } from './shared'
import { Card, SectionHeader, PageHeader, KpiTile, DeltaPill, MiniBar, Table, Thead, LoadingState, ErrorState, EmptyState } from './ui'
import { useMesSeleccionado, SelectorMes } from './mesContext'

function formatK(n) {
  if (n == null) return '—'
  const signo = n < 0 ? '-' : ''
  return `${signo}$${(Math.abs(n) / 1000).toFixed(0)}k`
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

// ─── Waterfall: Venta proyectada → Costo directo → Margen bruto → Gastos de operación → Margen de operación ──

function BarraCascada({ label, valor, bottom, top, esSubtotal, max }) {
  const h = Math.max(((top - bottom) / max) * 100, 1)
  const b = (bottom / max) * 100
  const color = esSubtotal ? (valor >= 0 ? GOLD_RAMP[1] : CRITICAL) : CRITICAL
  return (
    <div className="flex-1 h-full relative">
      <div className="absolute w-full" style={{ bottom: `${b}%`, height: `${h}%` }}>
        <span className="absolute -top-6 left-0 right-0 text-center text-xs font-bold text-gray-700 whitespace-nowrap">
          {esSubtotal ? formatK(valor) : `-${formatK(Math.abs(valor))}`}
        </span>
        <div className="w-full h-full rounded-t-md" style={{ background: color }} />
      </div>
      <span className="absolute -bottom-7 left-0 right-0 text-center text-[11px] font-semibold text-gray-500 leading-tight px-1">{label}</span>
    </div>
  )
}

function Waterfall({ venta, costoDirecto, gastosOperacion }) {
  const margenBruto = venta - costoDirecto
  const margenOperacion = margenBruto - gastosOperacion
  const max = Math.max(venta, margenBruto, margenOperacion, 1) * 1.3

  const pasos = [
    { label: 'Venta neta proyectada', valor: venta, bottom: 0, top: venta, esSubtotal: true },
    { label: 'Costo directo', valor: -costoDirecto, bottom: margenBruto, top: venta, esSubtotal: false },
    { label: 'Margen bruto', valor: margenBruto, bottom: 0, top: margenBruto, esSubtotal: true },
    { label: 'Gastos de operación', valor: -gastosOperacion, bottom: margenOperacion, top: margenBruto, esSubtotal: false },
    { label: 'Margen de operación', valor: margenOperacion, bottom: 0, top: margenOperacion, esSubtotal: true },
  ]

  return (
    <div className="relative h-56 flex gap-4 mt-10 mb-11 px-2">
      {pasos.map((p, i) => <BarraCascada key={i} {...p} max={max} />)}
    </div>
  )
}

// ─── Categorías con proyección de cierre (árbol categoría → proveedor) ─────

function ProveedorProyeccion({ p }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-white p-3">
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <span className="text-sm font-semibold text-gray-800 truncate">{p.nombre}</span>
        <span className="text-sm font-bold text-gray-800 tabular-nums flex-shrink-0">{formatMoney(p.gastoProyectado)}</span>
      </div>
      <p className="text-xs text-gray-400 leading-relaxed">
        {p.facturasRegistradas} de ~{p.facturasEsperadas6m.toFixed(1)} facturas esperadas (prom. 6 meses)
        <span className="text-gray-300"> · </span>
        ticket prom. {formatMoney(p.montoPromedioFactura)}
        {p.facturasFaltantes > 0 && (
          <>
            <span className="text-gray-300"> · </span>
            <span className="font-medium" style={{ color: GOLD_RAMP[1] }}>
              faltan ~{p.facturasFaltantes} (+{formatMoney(p.gastoAdicionalProyectado)})
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
        <div className="flex items-center gap-3 pl-6">
          <MiniBar pct={c.pctProyectado ?? 0} color={color} />
          <p className="text-xs text-gray-400 flex-shrink-0 tabular-nums">
            {formatMoney(c.gastoProyectado)} <span className="text-gray-300">proyectado de</span> {formatMoney(c.limiteMes)}
          </p>
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

  return (
    <div className="w-full px-8 py-8 max-w-[1600px] mx-auto space-y-8">
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
          <section className="grid grid-cols-5 gap-5">
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
              label="Margen bruto proyectado"
              value={formatMoney(margenBruto)}
              sub={ventaProyectada ? `${((margenBruto / ventaProyectada) * 100).toFixed(1)}% de la venta` : undefined}
            />
            <KpiTile
              label="Gastos de operación proyectados"
              value={formatMoney(cierre.totales.gastosOperacionProyectado)}
              delta={<DeltaPill pct={pctGastosOperacion} invert suffix=" vs. límite" />}
            />
            <KpiTile
              label="Margen de operación proyectado"
              value={formatMoney(margenOperacion)}
              sub={ventaProyectada ? `${((margenOperacion / ventaProyectada) * 100).toFixed(1)}% de la venta` : undefined}
            />
          </section>

          <Card>
            <SectionHeader
              title="De venta a utilidad — cierre proyectado"
              sub="Venta neta proyectada menos costo directo y gastos de operación proyectados"
            />
            <Waterfall
              venta={ventaProyectada ?? 0}
              costoDirecto={cierre.totales.costoDirectoProyectado}
              gastosOperacion={cierre.totales.gastosOperacionProyectado}
            />
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
