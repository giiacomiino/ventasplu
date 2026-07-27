import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, Printer, UserPlus, UserMinus } from 'lucide-react'
import { formatMoney } from '../../utils/formatters'
import { format, addDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { supabase } from '../../lib/supabase'
import { llamar, DIAS, GOLD_RAMP } from './shared'
import { Card, SectionHeader, PageHeader, KpiTile, DeltaPill, Table, Thead, LoadingState, ErrorState, EmptyState } from './ui'
import { useSemanaSeleccionada } from './useSemanaSeleccionada'

const DIAS_CORTOS = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function Tooltip({ children }) {
  return (
    <div className="absolute -top-2 -translate-y-full z-20 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg pointer-events-none left-1/2 -translate-x-1/2">
      {children}
    </div>
  )
}

function formatK(n) {
  if (n == null) return '—'
  return `$${(n / 1000).toFixed(0)}k`
}

function SelectorSemana({ label, esSemanaActual, anterior, siguiente }) {
  return (
    <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-2 py-1.5 bg-white shadow-sm select-none">
      <button onClick={anterior} className="text-gray-400 hover:text-gold-700 transition-colors p-1">
        <ChevronLeft size={15} />
      </button>
      <span className="text-sm font-semibold text-gray-700 min-w-[170px] text-center capitalize">{label}</span>
      <button
        onClick={siguiente}
        disabled={esSemanaActual}
        className="text-gray-400 hover:text-gold-700 transition-colors p-1 disabled:opacity-30 disabled:hover:text-gray-400"
      >
        <ChevronRight size={15} />
      </button>
    </div>
  )
}

// ─── Venta por día de la semana: real vs. promedio histórico ───────────────

function VentaPorDiaChart({ ventaPorDia }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(...ventaPorDia.flatMap(d => [d.ventaNeta, d.promedioHistorico ?? 0]), 1) * 1.15

  return (
    <div>
      <div className="relative flex items-end gap-4 h-56">
        {ventaPorDia.map((d, i) => {
          const real = d.ventaNeta
          const hist = d.promedioHistorico ?? 0
          const alturaReal = Math.max((real / max) * 100, real ? 8 : 0)
          const alturaHist = (hist / max) * 100
          const faltante = Math.max(alturaHist - alturaReal, 0)
          return (
            <div
              key={d.fecha}
              className="flex-1 h-full flex flex-col justify-end items-center relative cursor-pointer"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {hover === i && (
                <Tooltip>
                  <p className="font-semibold">{format(new Date(`${d.fecha}T00:00:00`), 'EEEE d MMM', { locale: es })}</p>
                  <p className="text-gray-300">Venta: {formatMoney(real)}</p>
                  {d.promedioHistorico != null && <p className="text-gray-400">Promedio histórico: {formatMoney(d.promedioHistorico)}</p>}
                </Tooltip>
              )}
              {faltante > 0 && (
                <div
                  className="w-full rounded-t border-2 border-dashed border-b-0"
                  style={{ height: `${faltante}%`, borderColor: GOLD_RAMP[1] }}
                />
              )}
              <div
                className="w-full relative transition-opacity"
                style={{
                  height: `${alturaReal}%`,
                  background: GOLD_RAMP[1],
                  opacity: hover === i ? 0.75 : 1,
                  borderRadius: faltante > 0 ? '0' : '0.25rem 0.25rem 0 0',
                }}
              >
                {real > 0 && (
                  <span className="absolute top-1/2 left-0 right-0 -translate-y-1/2 text-center text-[10px] font-bold text-white whitespace-nowrap">
                    {formatK(real)}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex gap-4 mt-1.5">
        {ventaPorDia.map(d => (
          <div key={d.fecha} className="flex-1 text-center text-[10px] text-gray-400 font-medium">{DIAS_CORTOS[d.diaSemana]}</div>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: GOLD_RAMP[1] }} /> Venta real</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm border-2 border-dashed" style={{ borderColor: GOLD_RAMP[1] }} /> Falta para el promedio histórico</span>
      </div>
    </div>
  )
}

export default function BIReporteSemanal() {
  const semana = useSemanaSeleccionada()
  const [reporte, setReporte] = useState(null)
  const [plu, setPlu] = useState(null)
  const [ventasMes, setVentasMes] = useState(null)
  const [cierreMes, setCierreMes] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const anioMes = semana.lunes.getFullYear()
    const mesMes = semana.lunes.getMonth() + 1
    Promise.allSettled([
      llamar('reporte-semanal', { lunes: semana.lunesStr }),
      llamar('resumen-ventas', { anio: anioMes, mes: mesMes }),
      llamar('tendencia-cierre', { anio: anioMes, mes: mesMes }),
    ]).then(([r1, r2, r3]) => {
      if (r1.status === 'fulfilled') setReporte(r1.value)
      if (r2.status === 'fulfilled') setVentasMes(r2.value)
      if (r3.status === 'fulfilled') setCierreMes(r3.value)
      setError(r1.status === 'rejected' ? r1.reason.message : '')
      setLoading(false)
    })
  }, [semana.lunesStr])

  useEffect(() => {
    async function cargarPlu() {
      const domingoStr = format(semana.domingo, 'yyyy-MM-dd')
      const lunesAntStr = format(addDays(semana.lunes, -7), 'yyyy-MM-dd')
      const domingoAntStr = format(addDays(semana.domingo, -7), 'yyyy-MM-dd')
      const [actual, anterior] = await Promise.all([
        supabase.from('ventas_plu').select('monto, productos(categoria)').gte('fecha', semana.lunesStr).lte('fecha', domingoStr),
        supabase.from('ventas_plu').select('monto, productos(categoria)').gte('fecha', lunesAntStr).lte('fecha', domingoAntStr),
      ])
      const agrupar = rows => {
        const m = new Map()
        for (const r of rows ?? []) {
          if (!r.productos?.categoria) continue
          m.set(r.productos.categoria, (m.get(r.productos.categoria) ?? 0) + Number(r.monto || 0))
        }
        return m
      }
      const montoActual = agrupar(actual.data)
      const montoAnterior = agrupar(anterior.data)
      const nombres = new Set([...montoActual.keys(), ...montoAnterior.keys()])
      const categorias = [...nombres].map(nombre => {
        const monto = montoActual.get(nombre) ?? 0
        const anteriorMonto = montoAnterior.get(nombre) ?? 0
        const variacionPct = anteriorMonto ? ((monto - anteriorMonto) / anteriorMonto) * 100 : null
        return { nombre, monto, anteriorMonto, variacionPct }
      }).sort((a, b) => b.monto - a.monto)
      setPlu({ categorias })
    }
    cargarPlu()
  }, [semana.lunesStr])

  const mesLabel = format(semana.lunes, 'MMMM', { locale: es })
  const ventaProyectadaMes = ventasMes?.mtd.esMesActual ? ventasMes.mtd.proyeccionCierreMes : ventasMes?.mtd.ventaNeta
  const margenBrutoMes = cierreMes && ventaProyectadaMes != null ? ventaProyectadaMes - cierreMes.totales.costoDirectoProyectado : null
  const margenOperacionMes = margenBrutoMes != null && cierreMes ? margenBrutoMes - cierreMes.totales.gastosOperacionProyectado : null
  const margenOperacionYoyPct = margenOperacionMes != null && cierreMes?.margenAnioAnterior.margenOperacion
    ? ((margenOperacionMes - cierreMes.margenAnioAnterior.margenOperacion) / cierreMes.margenAnioAnterior.margenOperacion) * 100
    : null

  return (
    <div className="w-full px-8 py-8 max-w-[1600px] mx-auto space-y-8 print:px-2 print:py-4 print:max-w-full">
      <div className="print:hidden">
        <Link to="/business-intelligence" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-700 mb-3 transition-colors">
          <ArrowLeft size={15} /> Business Intelligence
        </Link>
        <PageHeader
          title="Reporte semanal"
          sub="Lunes a domingo — venta, gasto y RH de la semana, para reportar a dirección"
          right={
            <div className="flex items-center gap-3">
              <SelectorSemana label={semana.label} esSemanaActual={semana.esSemanaActual} anterior={semana.anterior} siguiente={semana.siguiente} />
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 text-sm font-semibold text-white bg-[#7a6020] hover:bg-[#644f1a] rounded-lg px-3.5 py-2 transition-colors"
              >
                <Printer size={15} /> Exportar a PDF
              </button>
            </div>
          }
        />
      </div>

      <div className="hidden print:block mb-4">
        <h1 className="text-xl font-bold text-gray-900">Reporte semanal — La Trattoria</h1>
        <p className="text-sm text-gray-500 capitalize">{semana.label}</p>
      </div>

      {loading && <LoadingState>Cargando reporte de la semana...</LoadingState>}
      {error && <ErrorState message={error} />}

      {reporte && (
        <>
          <section className="grid grid-cols-4 gap-5 print-card">
            <KpiTile
              label="Venta neta de la semana"
              value={formatMoney(reporte.ventas.ventaSemana)}
              delta={
                <>
                  <DeltaPill pct={reporte.ventas.ventaSemanaVsPromedioPct} suffix=" vs. prom." compact />
                  <DeltaPill pct={reporte.ventas.ventaYoyPct} suffix=" YoY" compact />
                </>
              }
              sub={reporte.ventas.ventaSemanaVsPromedioMonto != null
                ? `${reporte.ventas.ventaSemanaVsPromedioMonto >= 0 ? '+' : ''}${formatMoney(reporte.ventas.ventaSemanaVsPromedioMonto)} vs. promedio histórico`
                : undefined}
            />
            <KpiTile label="Ticket promedio" value={formatMoney(reporte.ventas.ticketPromedio)} sub={`${reporte.ventas.personas.toLocaleString('es-MX')} personas atendidas`} />
            <KpiTile label="Gasto total de la semana" value={formatMoney(reporte.gastos.gastoTotalSemana)} />
            <KpiTile
              label="Promedio semanal histórico"
              value={formatMoney(reporte.ventas.promedioSemanalHistorico)}
              sub="Suma del promedio de cada día de la semana"
            />
          </section>

          <Card className="print-card">
            <SectionHeader
              title="Venta por día de la semana"
              sub="Cada día vs. su propio promedio histórico"
            />
            <VentaPorDiaChart ventaPorDia={reporte.ventas.ventaPorDia} />
            {reporte.ventas.diaDestacado && (
              <p className="text-sm text-gray-600 mt-4 pt-4 border-t border-gray-100">
                <span className="font-bold" style={{ color: reporte.ventas.diaDestacado.diferenciaPct >= 0 ? GOLD_RAMP[1] : '#d03b3b' }}>
                  {DIAS[reporte.ventas.diaDestacado.diaSemana]}
                </span>{' '}
                fue el día de mayor variación: {reporte.ventas.diaDestacado.diferenciaPct >= 0 ? '+' : ''}
                {reporte.ventas.diaDestacado.diferenciaPct.toFixed(1)}% vs. su promedio ({formatMoney(reporte.ventas.diaDestacado.ventaNeta)}).
              </p>
            )}
          </Card>

          {plu && (
            <Card padded={false} className="print-card">
              <div className="p-6 pb-0">
                <SectionHeader title="Ventas por tipo de PLU" sub="Categoría de producto, esta semana vs. la semana anterior" />
              </div>
              <div className="px-6 pb-2">
                {plu.categorias.length === 0 ? (
                  <EmptyState>Sin ventas por PLU registradas esta semana</EmptyState>
                ) : (
                  <Table>
                    <Thead columns={['Categoría', 'Semana anterior', 'Esta semana', 'Variación']} />
                    <tbody>
                      {plu.categorias.map(c => (
                        <tr key={c.nombre} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors">
                          <td className="py-2.5 text-gray-700 font-medium">{c.nombre}</td>
                          <td className="py-2.5 text-right text-gray-400 tabular-nums">{formatMoney(c.anteriorMonto)}</td>
                          <td className="py-2.5 text-right font-semibold text-gray-800 tabular-nums">{formatMoney(c.monto)}</td>
                          <td className="py-2.5 text-right">
                            {c.variacionPct != null ? <DeltaPill pct={c.variacionPct} compact /> : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </div>
            </Card>
          )}

          <Card padded={false} className="print-card">
            <div className="p-6 pb-0">
              <SectionHeader title="Gasto por categoría" sub="Esta semana vs. el promedio de las últimas 8 semanas" />
            </div>
            {reporte.gastos.mayoresVariaciones.length > 0 && (
              <div className="px-6 pb-4 flex flex-wrap gap-2">
                {reporte.gastos.mayoresVariaciones.map(c => (
                  <span key={c.nombre} className="inline-flex items-center gap-1.5 text-xs font-semibold bg-gray-50 border border-gray-100 rounded-full px-3 py-1.5 text-gray-600">
                    {c.nombre} <DeltaPill pct={c.variacionPct} invert compact />
                  </span>
                ))}
              </div>
            )}
            <div className="px-6 pb-2">
              {reporte.gastos.categorias.length === 0 ? (
                <EmptyState>Sin gasto registrado esta semana</EmptyState>
              ) : (
                <Table>
                  <Thead columns={['Categoría', 'Promedio semanal', 'Esta semana', 'Variación']} />
                  <tbody>
                    {reporte.gastos.categorias.map(c => (
                      <tr key={c.nombre} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors">
                        <td className="py-2.5 text-gray-700 font-medium">
                          {c.nombre}
                          {c.tipo && <span className="text-xs text-gray-400 font-medium ml-2">{c.tipo}</span>}
                        </td>
                        <td className="py-2.5 text-right text-gray-400 tabular-nums">{formatMoney(c.promedioSemanal)}</td>
                        <td className="py-2.5 text-right font-semibold text-gray-800 tabular-nums">{formatMoney(c.gastoSemana)}</td>
                        <td className="py-2.5 text-right">
                          {c.variacionPct != null ? <DeltaPill pct={c.variacionPct} invert compact /> : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </div>
          </Card>

          <Card padded={false} className="print-card">
            <div className="p-6 pb-0">
              <SectionHeader title="Pagos fuertes de la semana" sub="Facturas más grandes registradas en el periodo" />
            </div>
            <div className="px-6 pb-2">
              {reporte.gastos.pagosFuertes.length === 0 ? (
                <EmptyState>Sin facturas registradas esta semana</EmptyState>
              ) : (
                <Table>
                  <Thead columns={['Fecha', 'Proveedor', 'Categoría', 'Monto']} />
                  <tbody>
                    {reporte.gastos.pagosFuertes.map((f, i) => (
                      <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors">
                        <td className="py-2.5 text-gray-500 whitespace-nowrap">{format(new Date(f.fecha), 'd MMM', { locale: es })}</td>
                        <td className="py-2.5 text-gray-700 font-medium">{f.proveedor}</td>
                        <td className="py-2.5 text-gray-400">{f.categoria}</td>
                        <td className="py-2.5 text-right font-bold text-gray-800 tabular-nums">{formatMoney(f.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </div>
          </Card>

          <Card className="print-card">
            <SectionHeader title="Recursos Humanos" sub="Altas y bajas registradas en la semana" />
            {reporte.rh.altas.length === 0 && reporte.rh.bajas.length === 0 ? (
              <EmptyState>Sin movimientos de personal esta semana</EmptyState>
            ) : (
              <div className="space-y-2">
                {reporte.rh.altas.map((e, i) => (
                  <div key={`alta-${i}`} className="flex items-center gap-2.5 text-sm">
                    <UserPlus size={15} className="text-green-600 flex-shrink-0" />
                    <span className="font-medium text-gray-700">{e.nombre}</span>
                    <span className="text-gray-400">— alta el {format(new Date(e.fecha), 'd MMM', { locale: es })}</span>
                  </div>
                ))}
                {reporte.rh.bajas.map((e, i) => (
                  <div key={`baja-${i}`} className="flex items-center gap-2.5 text-sm">
                    <UserMinus size={15} className="text-red-500 flex-shrink-0" />
                    <span className="font-medium text-gray-700">{e.nombre}</span>
                    <span className="text-gray-400">— baja el {format(new Date(e.fecha), 'd MMM', { locale: es })}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {cierreMes && ventasMes && (
            <Card className="print-card">
              <SectionHeader
                title={`Hacia dónde vamos — cierre de ${mesLabel}`}
                sub="Si el ritmo de gasto e ingreso de esta semana se mantiene"
              />
              <div className="grid grid-cols-2 gap-5 mb-5">
                <KpiTile label="Margen bruto proyectado del mes" value={formatMoney(margenBrutoMes)} />
                <KpiTile
                  label="Margen de operación proyectado del mes"
                  value={formatMoney(margenOperacionMes)}
                  delta={<DeltaPill pct={margenOperacionYoyPct} suffix=" YoY" />}
                />
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">
                Si el ritmo de gasto se mantiene, <span className="font-semibold capitalize">{mesLabel}</span> cerraría con un margen de
                operación de <span className="font-bold">{formatMoney(margenOperacionMes)}</span>
                {ventaProyectadaMes ? ` (${((margenOperacionMes / ventaProyectadaMes) * 100).toFixed(1)}% de la venta)` : ''}.
                {' '}La venta de esta semana estuvo{' '}
                <span className="font-semibold" style={{ color: reporte.ventas.ventaSemanaVsPromedioMonto >= 0 ? GOLD_RAMP[1] : '#d03b3b' }}>
                  {formatMoney(Math.abs(reporte.ventas.ventaSemanaVsPromedioMonto))} {reporte.ventas.ventaSemanaVsPromedioMonto >= 0 ? 'por encima' : 'por debajo'}
                </span>{' '}
                de lo esperado según el promedio histórico de cada día
                {reporte.ventas.ventaSemanaVsPromedioPct != null ? ` (${reporte.ventas.ventaSemanaVsPromedioPct >= 0 ? '+' : ''}${reporte.ventas.ventaSemanaVsPromedioPct.toFixed(1)}%)` : ''}.
              </p>
              <Link to="/business-intelligence/tendencia-cierre" className="inline-block text-sm font-semibold mt-4 hover:underline print:hidden" style={{ color: GOLD_RAMP[1] }}>
                Ver detalle completo de la tendencia de cierre →
              </Link>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
