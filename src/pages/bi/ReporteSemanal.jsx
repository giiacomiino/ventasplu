import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, Printer, UserPlus, UserMinus } from 'lucide-react'
import { formatMoney } from '../../utils/formatters'
import { format, addDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { supabase } from '../../lib/supabase'
import { llamar, DIAS, GOLD_RAMP, GOOD, CRITICAL } from './shared'
import { Card, SectionHeader, PageHeader, KpiTile, DeltaPill, MiniBar, Table, Thead, LoadingState, ErrorState, EmptyState } from './ui'
import { useSemanaSeleccionada } from './useSemanaSeleccionada'

const DIAS_CORTOS = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function formatK(n) {
  if (n == null) return '—'
  return `$${(n / 1000).toFixed(0)}k`
}

function formatInt(n) {
  if (n == null) return '—'
  return Math.round(n).toLocaleString('es-MX')
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

// ─── Serie diaria (venta o personas): real vs. promedio histórico ──────────
// Etiquetas siempre visibles (no on-hover): el reporte se imprime/exporta a
// PDF como documento estático, así que la variación tiene que explicarse
// sola, sin depender de pasar el mouse.

// Monto antes que porcentaje: para leer la variación en pesos de un
// vistazo (el % va de acompañante, chiquito).
function EtiquetaVariacion({ real, promedio, formatValor }) {
  if (promedio == null) return <span className="text-[10px] text-gray-300">sin dato</span>
  const diff = real - promedio
  const pct = promedio ? (diff / promedio) * 100 : null
  const color = diff >= 0 ? GOOD : CRITICAL
  return (
    <div className="text-center leading-tight">
      <p className="text-xs font-bold tabular-nums whitespace-nowrap" style={{ color }}>
        {diff >= 0 ? '+' : ''}{formatValor(diff)}
      </p>
      {pct != null && (
        <p className="text-[9px] font-semibold" style={{ color }}>({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)</p>
      )}
    </div>
  )
}

function SerieDiariaChart({ serie, valorKey, formatValor, compacto = false }) {
  const max = Math.max(...serie.flatMap(d => [d[valorKey], d.promedioHistorico ?? 0]), 1) * 1.25

  return (
    <div>
      <div className="flex gap-1 sm:gap-4 mb-2">
        {serie.map((d, i) => (
          <div key={i} className="flex-1 flex justify-center">
            <EtiquetaVariacion real={d[valorKey]} promedio={d.promedioHistorico} formatValor={formatValor} />
          </div>
        ))}
      </div>
      <div className={`relative flex items-end gap-1 sm:gap-4 ${compacto ? 'h-20' : 'h-48'}`}>
        {serie.map((d, i) => {
          const real = d[valorKey]
          const hist = d.promedioHistorico ?? 0
          const alturaReal = Math.max((real / max) * 100, real ? 8 : 0)
          const alturaHist = (hist / max) * 100
          const faltante = Math.max(alturaHist - alturaReal, 0)
          return (
            <div key={i} className="flex-1 h-full flex flex-col justify-end items-center relative">
              {faltante > 0 && (
                <div
                  className="w-full rounded-t border-2 border-dashed border-b-0"
                  style={{ height: `${faltante}%`, borderColor: GOLD_RAMP[1] }}
                />
              )}
              <div
                className="w-full relative"
                style={{
                  height: `${alturaReal}%`,
                  background: GOLD_RAMP[1],
                  borderRadius: faltante > 0 ? '0' : '0.25rem 0.25rem 0 0',
                }}
              >
                {real > 0 && (
                  <span className="absolute top-1/2 left-0 right-0 -translate-y-1/2 text-center text-[10px] font-bold text-white whitespace-nowrap">
                    {formatValor(real)}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex gap-1 sm:gap-4 mt-1.5">
        {serie.map((d, i) => (
          <div key={i} className="flex-1 text-center">
            <p className="text-[10px] text-gray-400 font-medium">{DIAS_CORTOS[d.diaSemana]}</p>
            <p className="text-[9px] text-gray-300 tabular-nums">prom: {formatValor(d.promedioHistorico)}</p>
          </div>
        ))}
      </div>
      {!compacto && (
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: GOLD_RAMP[1] }} /> Real</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm border-2 border-dashed" style={{ borderColor: GOLD_RAMP[1] }} /> Falta para el promedio histórico</span>
        </div>
      )}
    </div>
  )
}

function diaDeMayorVariacion(serie) {
  return serie.filter(d => d.diferenciaPct != null).sort((a, b) => Math.abs(b.diferenciaPct) - Math.abs(a.diferenciaPct))[0] ?? null
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

      // El registro de ventas por PLU puede ir rezagado unos días (captura
      // manual). Si comparamos una semana completa contra una semana
      // parcialmente capturada, la variación sale artificialmente negativa.
      // Se recorta la comparación al último día con datos disponibles, y se
      // usa ese MISMO corte relativo en la semana anterior.
      const { data: ultimaFilaConDatos } = await supabase
        .from('ventas_plu')
        .select('fecha')
        .order('fecha', { ascending: false })
        .limit(1)
        .maybeSingle()
      const fechaCorte = ultimaFilaConDatos?.fecha ?? domingoStr
      const finComparacionStr = fechaCorte < domingoStr ? fechaCorte : domingoStr
      const diasIncluidos = Math.max(
        Math.round((new Date(`${finComparacionStr}T00:00:00`) - semana.lunes) / (24 * 60 * 60 * 1000)) + 1,
        1,
      )
      const lunesAntStr = format(addDays(semana.lunes, -7), 'yyyy-MM-dd')
      const finComparacionAntStr = format(addDays(addDays(semana.lunes, -7), diasIncluidos - 1), 'yyyy-MM-dd')

      const [actual, anterior] = await Promise.all([
        supabase.from('ventas_plu').select('monto, unidades, producto_id, productos(nombre, categoria, subcategoria)')
          .gte('fecha', semana.lunesStr).lte('fecha', finComparacionStr),
        supabase.from('ventas_plu').select('monto, unidades, producto_id, productos(nombre, categoria, subcategoria)')
          .gte('fecha', lunesAntStr).lte('fecha', finComparacionAntStr),
      ])

      const agruparPor = (rows, campo) => {
        const m = new Map()
        for (const r of rows ?? []) {
          if (!r.productos) continue
          const clave = campo === 'producto' ? r.producto_id : r.productos[campo]
          if (!clave) continue
          const actual = m.get(clave) ?? { monto: 0, unidades: 0, nombre: campo === 'producto' ? r.productos.nombre : clave, categoria: r.productos.categoria }
          actual.monto += Number(r.monto || 0)
          actual.unidades += Number(r.unidades || 0)
          m.set(clave, actual)
        }
        return m
      }

      const subcatActual = agruparPor(actual.data, 'subcategoria')
      const subcatAnterior = agruparPor(anterior.data, 'subcategoria')
      const nombresSubcat = new Set([...subcatActual.keys(), ...subcatAnterior.keys()])
      const subcategorias = [...nombresSubcat].map(nombre => {
        const monto = subcatActual.get(nombre)?.monto ?? 0
        const unidades = subcatActual.get(nombre)?.unidades ?? 0
        const anteriorMonto = subcatAnterior.get(nombre)?.monto ?? 0
        const anteriorUnidades = subcatAnterior.get(nombre)?.unidades ?? 0
        const variacionPct = anteriorMonto ? ((monto - anteriorMonto) / anteriorMonto) * 100 : null
        return { nombre, monto, unidades, anteriorMonto, anteriorUnidades, variacionPct }
      }).sort((a, b) => b.monto - a.monto)

      const prodActual = agruparPor(actual.data, 'producto')
      const prodAnterior = agruparPor(anterior.data, 'producto')
      const idsProductos = new Set([...prodActual.keys(), ...prodAnterior.keys()])
      const productos = [...idsProductos].map(id => {
        const a = prodActual.get(id)
        const b = prodAnterior.get(id)
        const monto = a?.monto ?? 0
        const anteriorMonto = b?.monto ?? 0
        const variacionMonto = monto - anteriorMonto
        const variacionPct = anteriorMonto ? (variacionMonto / anteriorMonto) * 100 : null
        return { nombre: a?.nombre ?? b?.nombre ?? 'Producto', monto, anteriorMonto, variacionMonto, variacionPct }
      })

      const topPositivos = [...productos].filter(p => p.variacionMonto > 0).sort((a, b) => b.variacionMonto - a.variacionMonto).slice(0, 5)
      const topNegativos = [...productos].filter(p => p.variacionMonto < 0).sort((a, b) => a.variacionMonto - b.variacionMonto).slice(0, 5)

      setPlu({ subcategorias, topPositivos, topNegativos, fechaCorte, semanaIncompleta: fechaCorte < domingoStr })
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
    <div className="w-full px-4 py-4 sm:px-8 sm:py-8 max-w-[1600px] mx-auto space-y-8 print:px-2 print:py-4 print:max-w-full">
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
        <div className="print:hidden space-y-8">
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-5 print-card">
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
            <SerieDiariaChart serie={reporte.ventas.ventaPorDia} valorKey="ventaNeta" formatValor={formatK} />
            {reporte.ventas.diaDestacado && (
              <p className="text-sm text-gray-600 mt-4 pt-4 border-t border-gray-100">
                <span className="font-bold" style={{ color: reporte.ventas.diaDestacado.diferenciaPct >= 0 ? GOLD_RAMP[1] : '#d03b3b' }}>
                  {DIAS[reporte.ventas.diaDestacado.diaSemana]}
                </span>{' '}
                fue el día de mayor variación: {reporte.ventas.diaDestacado.ventaNeta >= reporte.ventas.diaDestacado.promedioHistorico ? '+' : ''}
                {formatMoney(reporte.ventas.diaDestacado.ventaNeta - reporte.ventas.diaDestacado.promedioHistorico)} vs. su promedio
                ({reporte.ventas.diaDestacado.diferenciaPct >= 0 ? '+' : ''}{reporte.ventas.diaDestacado.diferenciaPct.toFixed(1)}%).
              </p>
            )}
          </Card>

          <Card className="print-card">
            <SectionHeader
              title="Personas atendidas por día"
              sub="Cada día vs. el promedio de las últimas 8 semanas"
            />
            <SerieDiariaChart serie={reporte.ventas.personasPorDia} valorKey="personas" formatValor={formatInt} />
            {(() => {
              const destacado = diaDeMayorVariacion(reporte.ventas.personasPorDia)
              return destacado && (
                <p className="text-sm text-gray-600 mt-4 pt-4 border-t border-gray-100">
                  <span className="font-bold" style={{ color: destacado.diferenciaPct >= 0 ? GOLD_RAMP[1] : '#d03b3b' }}>
                    {DIAS[destacado.diaSemana]}
                  </span>{' '}
                  fue el día de mayor variación en afluencia: {destacado.personas >= destacado.promedioHistorico ? '+' : ''}
                  {formatInt(destacado.personas - destacado.promedioHistorico)} personas vs. su promedio
                  ({destacado.diferenciaPct >= 0 ? '+' : ''}{destacado.diferenciaPct.toFixed(1)}%).
                </p>
              )
            })()}
          </Card>

          {plu && (
            <>
              <Card padded={false} className="print-card">
                <div className="p-6 pb-0">
                  <SectionHeader title="Ventas por subcategoría de PLU" sub="Esta semana vs. la semana anterior (mismo corte de días)" />
                </div>
                <div className="px-6 pb-2">
                  {plu.subcategorias.length === 0 ? (
                    <EmptyState>Sin ventas por PLU registradas esta semana</EmptyState>
                  ) : (
                    <Table>
                      <Thead columns={['Subcategoría', 'Semana anterior', 'Esta semana', 'Variación']} />
                      <tbody>
                        {plu.subcategorias.map(c => (
                          <tr key={c.nombre} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors">
                            <td className="py-2.5 text-gray-700 font-medium">{c.nombre}</td>
                            <td className="py-2.5 text-right text-gray-400 tabular-nums">
                              {formatMoney(c.anteriorMonto)} <span className="text-gray-300">· {c.anteriorUnidades.toLocaleString('es-MX')} u.</span>
                            </td>
                            <td className="py-2.5 text-right font-semibold text-gray-800 tabular-nums">
                              {formatMoney(c.monto)} <span className="text-gray-400 font-normal">· {c.unidades.toLocaleString('es-MX')} u.</span>
                            </td>
                            <td className="py-2.5 text-right">
                              {c.variacionPct != null ? <DeltaPill pct={c.variacionPct} compact /> : <span className="text-gray-300 text-xs">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  )}
                </div>
                <p className="px-6 py-3 text-xs text-gray-400 border-t border-gray-50 mt-2">
                  Datos de ventas por PLU actualizados hasta: <span className="font-semibold text-gray-500">{format(new Date(`${plu.fechaCorte}T00:00:00`), "d 'de' MMMM yyyy", { locale: es })}</span>
                  {plu.semanaIncompleta && ' — semana en curso incompleta; la comparación usa el mismo corte de días en ambas semanas.'}
                </p>
              </Card>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 print-card">
                <Card padded={false}>
                  <div className="p-6 pb-3">
                    <SectionHeader title="Top 5 — mayor variación positiva" sub="Productos con más crecimiento vs. la semana anterior" />
                  </div>
                  <div className="px-6 pb-4">
                    {plu.topPositivos.length === 0 ? (
                      <EmptyState>Sin variaciones positivas</EmptyState>
                    ) : (
                      <div className="space-y-2.5">
                        {plu.topPositivos.map(p => (
                          <div key={p.nombre} className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-gray-700 font-medium truncate">{p.nombre}</span>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="font-bold text-gray-800 tabular-nums">+{formatMoney(p.variacionMonto)}</span>
                              {p.variacionPct != null && <DeltaPill pct={p.variacionPct} compact />}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Card>
                <Card padded={false}>
                  <div className="p-6 pb-3">
                    <SectionHeader title="Top 5 — mayor variación negativa" sub="Productos con más caída vs. la semana anterior" />
                  </div>
                  <div className="px-6 pb-4">
                    {plu.topNegativos.length === 0 ? (
                      <EmptyState>Sin variaciones negativas</EmptyState>
                    ) : (
                      <div className="space-y-2.5">
                        {plu.topNegativos.map(p => (
                          <div key={p.nombre} className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-gray-700 font-medium truncate">{p.nombre}</span>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="font-bold text-gray-800 tabular-nums">{formatMoney(p.variacionMonto)}</span>
                              {p.variacionPct != null && <DeltaPill pct={p.variacionPct} compact />}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            </>
          )}

          <Card padded={false} className="print-card">
            <div className="p-6 pb-0">
              <SectionHeader title="Gasto por categoría" sub="Gastos de la semana agrupados por categoría" />
            </div>
            <div className="px-6 pb-2">
              {reporte.gastos.categorias.length === 0 ? (
                <EmptyState>Sin gasto registrado esta semana</EmptyState>
              ) : (
                <Table>
                  <Thead columns={['Categoría', 'Monto']} />
                  <tbody>
                    {[...reporte.gastos.categorias].sort((a, b) => b.gastoSemana - a.gastoSemana).map(c => (
                      <tr key={c.nombre} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors">
                        <td className="py-2.5 text-gray-700 font-medium">
                          {c.nombre}
                          {c.tipo && <span className="text-xs text-gray-400 font-medium ml-2">{c.tipo}</span>}
                        </td>
                        <td className="py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <MiniBar pct={reporte.gastos.gastoTotalSemana ? c.gastoSemana / reporte.gastos.gastoTotalSemana : 0} color={GOLD_RAMP[1]} />
                            <span className="font-semibold text-gray-800 tabular-nums w-24">{formatMoney(c.gastoSemana)}</span>
                          </div>
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
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left pb-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Fecha</th>
                      <th className="text-left pb-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Proveedor</th>
                      <th className="text-left pb-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Categoría</th>
                      <th className="text-right pb-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Monto</th>
                    </tr>
                  </thead>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
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
              <Link to="/business-intelligence/tendencia-cierre" className="inline-block text-sm font-semibold mt-4 hover:underline" style={{ color: GOLD_RAMP[1] }}>
                Ver detalle completo de la tendencia de cierre →
              </Link>
            </Card>
          )}
        </div>
      )}

      {reporte && (
        <div className="hidden print:block text-sm">
          <div className="grid grid-cols-5 gap-2.5 mb-3">
            <div className="border border-gray-200 rounded-lg p-2.5 min-w-0">
              <p className="text-[8px] font-bold text-gray-400 uppercase tracking-wide">Venta de la semana</p>
              <p className="text-base font-bold text-gray-900 truncate">{formatMoney(reporte.ventas.ventaSemana)}</p>
              <p className="text-[9px] font-semibold truncate" style={{ color: reporte.ventas.ventaSemanaVsPromedioMonto >= 0 ? GOOD : CRITICAL }}>
                {reporte.ventas.ventaSemanaVsPromedioMonto >= 0 ? '+' : ''}{formatMoney(reporte.ventas.ventaSemanaVsPromedioMonto)} vs. prom.
              </p>
            </div>
            <div className="border border-gray-200 rounded-lg p-2.5 min-w-0">
              <p className="text-[8px] font-bold text-gray-400 uppercase tracking-wide">Ticket promedio</p>
              <p className="text-base font-bold text-gray-900 truncate">{formatMoney(reporte.ventas.ticketPromedio)}</p>
              <p className="text-[9px] text-gray-400 truncate">{reporte.ventas.personas.toLocaleString('es-MX')} personas</p>
            </div>
            <div className="border border-gray-200 rounded-lg p-2.5 min-w-0">
              <p className="text-[8px] font-bold text-gray-400 uppercase tracking-wide">Gasto de la semana</p>
              <p className="text-base font-bold text-gray-900 truncate">{formatMoney(reporte.gastos.gastoTotalSemana)}</p>
            </div>
            <div className="border border-gray-200 rounded-lg p-2.5 min-w-0">
              <p className="text-[8px] font-bold text-gray-400 uppercase tracking-wide">Margen bruto proy. ({mesLabel})</p>
              <p className="text-base font-bold text-gray-900 truncate">{cierreMes ? formatMoney(margenBrutoMes) : '—'}</p>
            </div>
            <div className="border border-gray-200 rounded-lg p-2.5 min-w-0">
              <p className="text-[8px] font-bold text-gray-400 uppercase tracking-wide">Margen operación proy.</p>
              <p className="text-base font-bold text-gray-900 truncate">{cierreMes ? formatMoney(margenOperacionMes) : '—'}</p>
              {margenOperacionYoyPct != null && (
                <p className="text-[9px] font-semibold truncate" style={{ color: margenOperacionYoyPct >= 0 ? GOOD : CRITICAL }}>
                  {margenOperacionYoyPct >= 0 ? '+' : ''}{margenOperacionYoyPct.toFixed(1)}% YoY
                </p>
              )}
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg p-3 mb-3">
            <p className="text-xs font-bold text-gray-800 mb-1">Venta por día</p>
            <SerieDiariaChart serie={reporte.ventas.ventaPorDia} valorKey="ventaNeta" formatValor={formatK} compacto />
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="border border-gray-200 rounded-lg p-3">
              <p className="text-xs font-bold text-gray-800 mb-2">Highlights de la semana</p>
              <ul className="space-y-1.5 text-[11px] text-gray-600 leading-snug">
                {reporte.ventas.diaDestacado && (
                  <li>
                    <span className="font-semibold">{DIAS[reporte.ventas.diaDestacado.diaSemana]}</span> fue el día de mayor variación en venta
                    ({reporte.ventas.diaDestacado.diferenciaPct >= 0 ? '+' : ''}{formatMoney(reporte.ventas.diaDestacado.ventaNeta - reporte.ventas.diaDestacado.promedioHistorico)}).
                  </li>
                )}
                {(() => {
                  const catDestacada = [...reporte.gastos.categorias]
                    .filter(c => c.promedioSemanal > 0)
                    .sort((a, b) => Math.abs(b.variacionMonto) - Math.abs(a.variacionMonto))[0]
                  return catDestacada && (
                    <li>
                      Mayor variación de gasto: <span className="font-semibold">{catDestacada.nombre}</span>
                      {' '}({catDestacada.variacionMonto >= 0 ? '+' : ''}{formatMoney(catDestacada.variacionMonto)}).
                    </li>
                  )
                })()}
                {plu?.topPositivos[0] && (
                  <li>Producto que más creció: <span className="font-semibold">{plu.topPositivos[0].nombre}</span> (+{formatMoney(plu.topPositivos[0].variacionMonto)}).</li>
                )}
                {plu?.topNegativos[0] && (
                  <li>Producto que más cayó: <span className="font-semibold">{plu.topNegativos[0].nombre}</span> ({formatMoney(plu.topNegativos[0].variacionMonto)}).</li>
                )}
                {reporte.gastos.pagosFuertes[0] && (
                  <li>Pago más fuerte: <span className="font-semibold">{reporte.gastos.pagosFuertes[0].proveedor}</span> ({formatMoney(reporte.gastos.pagosFuertes[0].monto)}).</li>
                )}
                <li>
                  RH: {reporte.rh.altas.length === 0 && reporte.rh.bajas.length === 0
                    ? 'sin movimientos esta semana.'
                    : `${reporte.rh.altas.length} alta(s), ${reporte.rh.bajas.length} baja(s).`}
                </li>
              </ul>
            </div>

            <div className="border border-gray-200 rounded-lg p-3">
              <p className="text-xs font-bold text-gray-800 mb-2">Hacia dónde vamos — cierre de {mesLabel}</p>
              {cierreMes && ventasMes ? (
                <p className="text-[11px] text-gray-600 leading-snug">
                  Si el ritmo se mantiene, <span className="font-semibold capitalize">{mesLabel}</span> cerraría con un margen bruto de{' '}
                  <span className="font-semibold">{formatMoney(margenBrutoMes)}</span> y un margen de operación de{' '}
                  <span className="font-semibold">{formatMoney(margenOperacionMes)}</span>
                  {ventaProyectadaMes ? ` (${((margenOperacionMes / ventaProyectadaMes) * 100).toFixed(1)}% de la venta)` : ''}.
                </p>
              ) : (
                <p className="text-[11px] text-gray-400">Sin datos de proyección disponibles.</p>
              )}
            </div>
          </div>

          {plu?.semanaIncompleta && (
            <p className="text-[9px] text-gray-400">
              Ventas por PLU actualizadas hasta: {format(new Date(`${plu.fechaCorte}T00:00:00`), "d 'de' MMMM yyyy", { locale: es })} (semana en curso incompleta).
            </p>
          )}
        </div>
      )}
    </div>
  )
}
