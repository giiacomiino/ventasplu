import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { formatMoney } from '../../utils/formatters'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { llamar, GOOD, WARNING, CRITICAL, GOLD_RAMP } from './shared'
import { Card, SectionHeader, PageHeader, KpiTile, DeltaPill, MiniBar, DonutGauge, LoadingState, ErrorState, EmptyState } from './ui'
import { useMesSeleccionado, SelectorMes } from './mesContext'

function estadoMargen(pct) {
  if (pct == null) return '#9ca3af'
  if (pct >= 0.15) return GOOD
  if (pct >= 0.05) return WARNING
  return CRITICAL
}

function MargenCard({ titulo, monto, pct, sub }) {
  const color = estadoMargen(pct)
  return (
    <Card className="flex items-center gap-5">
      <DonutGauge pct={pct ?? 0} color={color} size={84} stroke={9} />
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">{titulo}</p>
        <p className="text-2xl font-bold text-gray-900 tabular-nums">{formatMoney(monto)}</p>
        {sub && <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{sub}</p>}
      </div>
    </Card>
  )
}

function FilaCategoria({ c, max }) {
  return (
    <tr className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors">
      <td className="py-3">
        <span className="text-gray-700 font-medium">{c.nombre}</span>
        {c.tipo && <span className="text-xs text-gray-400 font-medium ml-2">{c.tipo}</span>}
      </td>
      <td className="py-3 text-right font-semibold text-gray-800 tabular-nums">{formatMoney(c.monto)}</td>
      <td className="py-3 text-right">
        <div className="flex items-center justify-end gap-3">
          <MiniBar pct={max ? c.monto / max : 0} color={GOLD_RAMP[1]} />
          <span className="text-gray-500 tabular-nums w-12 text-right">
            {c.pctVenta != null ? `${(c.pctVenta * 100).toFixed(1)}%` : '—'}
          </span>
        </div>
      </td>
    </tr>
  )
}

function FilaMes({ c, esTop }) {
  return (
    <tr className={`border-b border-gray-50 last:border-0 transition-colors ${esTop ? 'bg-gold-50/70' : 'hover:bg-gray-50/60'}`}>
      <td className="py-2.5 pl-3 text-gray-700 font-medium truncate max-w-[1px] w-full">{c.nombre}</td>
      <td className="py-2.5 text-right font-semibold text-gray-800 tabular-nums whitespace-nowrap">{formatMoney(c.monto)}</td>
      <td className="py-2.5 text-right whitespace-nowrap">
        <span className="text-gray-500 tabular-nums">{c.pctVenta != null ? `${(c.pctVenta * 100).toFixed(1)}%` : '—'}</span>
      </td>
      <td className="py-2.5 pr-3 text-right whitespace-nowrap">
        {c.yoyPct != null ? <DeltaPill pct={c.yoyPct} invert compact /> : <span className="text-gray-300 text-xs">—</span>}
      </td>
    </tr>
  )
}

function MesColumna({ mes, categorias }) {
  const top = categorias.slice(0, 6)
  const resto = categorias.slice(6)
  const restoMonto = resto.reduce((s, c) => s + c.monto, 0)
  return (
    <Card>
      <p className="text-sm font-bold text-gray-800 mb-4 text-center capitalize">
        {format(new Date(mes), 'MMMM yyyy', { locale: es })}
      </p>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b-2 border-gray-100">
            <th className="text-left pb-2 pl-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Categoría</th>
            <th className="text-right pb-2 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Monto</th>
            <th className="text-right pb-2 text-[11px] font-bold text-gray-400 uppercase tracking-wider">% venta</th>
            <th className="text-right pb-2 pr-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">YoY</th>
          </tr>
        </thead>
        <tbody>
          {top.map((c, i) => <FilaMes key={c.nombre} c={c} esTop={i === 0} />)}
          {resto.length > 0 && (
            <tr>
              <td className="pt-3 pl-3 text-gray-400 text-xs">+{resto.length} categorías menores</td>
              <td className="pt-3 text-right text-gray-400 font-semibold tabular-nums text-xs">{formatMoney(restoMonto)}</td>
              <td className="pt-3" />
              <td className="pt-3 pr-3" />
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  )
}

export default function BIFinanciero() {
  const { anio, mes } = useMesSeleccionado()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    llamar('resumen-financiero', { anio, mes }).then(setData).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [anio, mes])

  const mesLabel = data ? format(new Date(data.margenes.mes), 'MMMM', { locale: es }) : ''

  return (
    <div className="w-full px-4 py-4 sm:px-8 sm:py-8 max-w-[1600px] mx-auto space-y-8">
      <div>
        <Link to="/business-intelligence" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-700 mb-3 transition-colors">
          <ArrowLeft size={15} /> Business Intelligence
        </Link>
        <PageHeader title="Panorama financiero" sub="KPIs YTD, márgenes y estructura de gasto de La Trattoria" right={<SelectorMes />} />
      </div>

      {loading && <LoadingState>Cargando panorama financiero...</LoadingState>}
      {error && <ErrorState message={error} />}

      {data && (
        <>
          <section>
            <SectionHeader title="Desempeño del año (YTD)" sub="Acumulado del año, comparado contra el mismo periodo del año anterior" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
              <KpiTile
                label="Venta neta YTD"
                value={formatMoney(data.kpis.ventaNetaYTD)}
                delta={<DeltaPill pct={data.kpis.ventaNetaYTDAnteriorPct} suffix=" YoY" />}
              />
              <KpiTile
                label="Venta promedio diaria"
                value={formatMoney(data.kpis.ventaPromedioYTD)}
                delta={<DeltaPill pct={data.kpis.ventaPromedioYTDAnteriorPct} suffix=" YoY" />}
              />
              <KpiTile
                label="Personas atendidas"
                value={data.kpis.personasYTD.toLocaleString('es-MX')}
                delta={<DeltaPill pct={data.kpis.personasYTDAnteriorPct} suffix=" YoY" />}
              />
              <KpiTile label="Ticket promedio" value={formatMoney(data.kpis.ticketPromedioYTD)} />
              <KpiTile label="IVA generado" value={formatMoney(data.kpis.ivaYTD)} />
              <KpiTile label="Cortesías" value={formatMoney(data.kpis.cortesiasYTD)} />
              <KpiTile
                label="Proyección venta neta"
                value={data.proyeccionVentaNeta != null ? formatMoney(data.proyeccionVentaNeta) : '—'}
                sub={`Calculada en VURA · ${mesLabel}`}
              />
            </div>
          </section>

          <section>
            <SectionHeader title="Márgenes" sub={`Utilidad bruta y de operación — ${mesLabel} vs. acumulado del año`} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <MargenCard
                titulo={`Margen bruto · ${mesLabel}`}
                monto={data.margenes.margenBrutoMes}
                pct={data.margenes.margenBrutoPctMes}
                sub={`Sobre venta neta de ${formatMoney(data.margenes.ventaNetaMes)} · recalculado desde facturas sin borradas`}
              />
              <MargenCard
                titulo="Margen bruto · YTD"
                monto={data.margenesYTD.margenBrutoYTD}
                pct={data.margenesYTD.margenBrutoPctYTD}
                sub="Con gasto histórico de BudgetSnapshot"
              />
              <MargenCard
                titulo={`Margen de operación · ${mesLabel}`}
                monto={data.margenes.margenOperacionMes}
                pct={data.margenes.margenOperacionPctMes}
                sub="Margen bruto menos gastos de operación"
              />
              <MargenCard
                titulo="Margen de operación · YTD"
                monto={data.margenesYTD.margenOperacionYTD}
                pct={data.margenesYTD.margenOperacionPctYTD}
                sub="Con gasto histórico de BudgetSnapshot"
              />
            </div>
          </section>

          <section>
            <Card>
              <SectionHeader
                title={`Categorías de gasto · ${mesLabel}`}
                sub="Monto y participación sobre la venta neta del mes"
                right={
                  <div className="text-right">
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Total</p>
                    <p className="text-lg font-bold text-gray-800 tabular-nums">
                      {formatMoney(data.categoriasMes.reduce((s, c) => s + c.monto, 0))}
                    </p>
                  </div>
                }
              />
              {data.categoriasMes.length === 0 ? (
                <EmptyState>Sin gasto registrado este mes</EmptyState>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left pb-2 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Categoría</th>
                      <th className="text-right pb-2 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Monto</th>
                      <th className="text-right pb-2 text-[11px] font-bold text-gray-400 uppercase tracking-wider">% de venta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.categoriasMes.map(c => (
                      <FilaCategoria key={c.nombre} c={c} max={data.categoriasMes[0]?.monto} />
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </section>

          <section>
            <SectionHeader title="Últimos 3 meses por categoría" sub="Monto, % de la venta neta y variación YoY de cada mes · histórico de BudgetSnapshot" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {data.ultimosTresMeses.map(m => <MesColumna key={m.mes} mes={m.mes} categorias={m.categorias} />)}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
