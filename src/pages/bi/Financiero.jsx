import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { formatMoney } from '../../utils/formatters'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { llamar, GOOD } from './shared'
import { Card, SectionHeader, PageHeader, KpiTile, DeltaPill, MiniBar, LoadingState, ErrorState } from './ui'

function MargenCard({ titulo, monto, pct, sub }) {
  return (
    <Card className="flex flex-col gap-2">
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{titulo}</p>
      <div className="flex items-baseline gap-3">
        <p className="text-2xl font-bold text-gray-900 tabular-nums">{formatMoney(monto)}</p>
        <p className="text-base font-bold" style={{ color: pct >= 0.2 ? GOOD : '#6b7280' }}>
          {pct != null ? `${(pct * 100).toFixed(1)}%` : '—'}
        </p>
      </div>
      {sub && <p className="text-xs text-gray-400 leading-relaxed">{sub}</p>}
    </Card>
  )
}

function FilaCategoria({ c, max }) {
  return (
    <tr className="border-b border-gray-50 last:border-0">
      <td className="py-3 text-gray-700 font-medium">{c.nombre}</td>
      <td className="py-3 text-right font-semibold text-gray-800 tabular-nums">{formatMoney(c.monto)}</td>
      <td className="py-3 text-right">
        <div className="flex items-center justify-end gap-3">
          <span className="text-gray-500 tabular-nums w-12 text-right">
            {c.pctVenta != null ? `${(c.pctVenta * 100).toFixed(1)}%` : '—'}
          </span>
          <MiniBar pct={max ? c.monto / max : 0} color="#a67e22" />
        </div>
      </td>
    </tr>
  )
}

function MesColumna({ mes, categorias }) {
  const top = categorias.slice(0, 7)
  const resto = categorias.slice(7)
  const restoMonto = resto.reduce((s, c) => s + c.monto, 0)
  return (
    <div>
      <p className="text-sm font-bold text-gray-800 mb-3 pb-2 border-b border-gray-100">
        {format(new Date(mes), 'MMMM yyyy', { locale: es })}
      </p>
      <div className="space-y-2.5">
        {top.map(c => (
          <div key={c.nombre} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-gray-600 truncate">{c.nombre}</span>
            <span className="text-gray-800 font-semibold tabular-nums flex-shrink-0">
              {formatMoney(c.monto)}
              <span className="text-gray-400 font-normal ml-1.5">
                {c.pctVenta != null ? `${(c.pctVenta * 100).toFixed(1)}%` : '—'}
              </span>
            </span>
          </div>
        ))}
        {resto.length > 0 && (
          <div className="flex items-baseline justify-between gap-3 text-sm pt-2 border-t border-gray-50">
            <span className="text-gray-400">+{resto.length} categorías menores</span>
            <span className="text-gray-400 font-semibold tabular-nums">{formatMoney(restoMonto)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default function BIFinanciero() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    llamar('resumen-financiero').then(setData).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [])

  return (
    <div className="w-full px-8 py-8 max-w-[1600px] mx-auto space-y-8">
      <div>
        <Link to="/business-intelligence" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-700 mb-3 transition-colors">
          <ArrowLeft size={15} /> Business Intelligence
        </Link>
        <PageHeader title="Panorama financiero" sub="KPIs YTD, márgenes y estructura de gasto de La Trattoria" />
      </div>

      {loading && <LoadingState>Cargando panorama financiero...</LoadingState>}
      {error && <ErrorState message={error} />}

      {data && (
        <>
          <section>
            <SectionHeader title="Desempeño del año (YTD)" sub="Acumulado 2026, comparado contra el mismo periodo del año anterior" />
            <div className="grid grid-cols-4 gap-5">
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
                sub={format(new Date(data.margenes.mes), 'MMMM yyyy', { locale: es })}
              />
            </div>
          </section>

          <section>
            <SectionHeader title="Márgenes" sub="Utilidad bruta y de operación, mes en curso vs acumulado del año" />
            <div className="grid grid-cols-2 gap-5">
              <MargenCard
                titulo={`Margen bruto · ${format(new Date(data.margenes.mes), 'MMMM', { locale: es })}`}
                monto={data.margenes.margenBrutoMes}
                pct={data.margenes.margenBrutoPctMes}
                sub={`Sobre venta neta del mes de ${formatMoney(data.margenes.ventaNetaMes)} · recalculado desde facturas sin borradas`}
              />
              <MargenCard
                titulo="Margen bruto · YTD"
                monto={data.margenesYTD.margenBrutoYTD}
                pct={data.margenesYTD.margenBrutoPctYTD}
                sub="Con gasto histórico de BudgetSnapshot"
              />
              <MargenCard
                titulo={`Margen de operación · ${format(new Date(data.margenes.mes), 'MMMM', { locale: es })}`}
                monto={data.margenes.margenOperacionMes}
                pct={data.margenes.margenOperacionPctMes}
              />
              <MargenCard
                titulo="Margen de operación · YTD"
                monto={data.margenesYTD.margenOperacionYTD}
                pct={data.margenesYTD.margenOperacionPctYTD}
              />
            </div>
          </section>

          <section>
            <Card>
              <SectionHeader
                title={`Categorías de gasto · ${format(new Date(data.margenes.mes), 'MMMM yyyy', { locale: es })}`}
                sub="Monto y participación sobre la venta neta del mes"
                right={<span className="text-sm font-bold text-gray-800 tabular-nums">{formatMoney(data.categoriasMes.reduce((s, c) => s + c.monto, 0))}</span>}
              />
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
            </Card>
          </section>

          <section>
            <Card>
              <SectionHeader title="Últimos 3 meses por categoría" sub="Monto y % de la venta neta de cada mes · histórico de BudgetSnapshot" />
              <div className="grid grid-cols-3 gap-8">
                {data.ultimosTresMeses.map(m => <MesColumna key={m.mes} mes={m.mes} categorias={m.categorias} />)}
              </div>
            </Card>
          </section>
        </>
      )}
    </div>
  )
}
