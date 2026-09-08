import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, ChevronLeft, UploadCloud, AlertTriangle, Gift, Package } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatMoney } from '../../utils/formatters'
import { llamar, GOLD_RAMP, WARNING, CRITICAL } from './shared'
import { Card, SectionHeader, PageHeader, KpiTile, DeltaPill, LoadingState, ErrorState } from './ui'
import { PronosticoAnualChart } from './PronosticoAnualChart'

const PALETA_ZONAS = [WARNING, '#9ca3af', '#c49a2e', '#d1d5db']
const PALETA_PAGOS = ['#5b7fb8', '#8a5a3a', '#c49a2e', '#6b9080', '#9ca3af', '#d1d5db']

function SelectorPeriodo({ periodo, setPeriodo }) {
  const ahora = new Date()
  const esMesActual = periodo.anio === ahora.getFullYear() && periodo.mes === ahora.getMonth() + 1

  function mesAnterior() {
    setPeriodo(p => p.mes === 1 ? { ...p, anio: p.anio - 1, mes: 12 } : { ...p, mes: p.mes - 1 })
  }
  function mesSiguiente() {
    if (esMesActual) return
    setPeriodo(p => p.mes === 12 ? { ...p, anio: p.anio + 1, mes: 1 } : { ...p, mes: p.mes + 1 })
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex border border-gray-200 rounded-lg overflow-hidden bg-white">
        {[{ key: 'mes', label: 'Mes' }, { key: 'ytd', label: 'YTD' }].map(op => (
          <button
            key={op.key}
            onClick={() => setPeriodo(p => ({ ...p, tipo: op.key }))}
            className={`px-3 py-2 text-xs font-semibold transition-colors ${
              periodo.tipo === op.key ? 'bg-[#7a6020] text-white' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            {op.label}
          </button>
        ))}
      </div>
      {periodo.tipo === 'mes' ? (
        <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
          <button onClick={mesAnterior} className="text-gray-400 hover:text-gold-700 p-1"><ChevronLeft size={15} /></button>
          <span className="text-sm font-semibold text-gray-700 min-w-[100px] text-center capitalize">
            {format(new Date(periodo.anio, periodo.mes - 1, 1), 'MMMM yyyy', { locale: es })}
          </span>
          <button onClick={mesSiguiente} disabled={esMesActual} className="text-gray-400 hover:text-gold-700 p-1 disabled:opacity-30">
            <ChevronRight size={15} />
          </button>
        </div>
      ) : (
        <span className="text-sm font-semibold text-gray-700 px-2">{periodo.anio}</span>
      )}
    </div>
  )
}

function Bloque({ to, titulo, sub, children }) {
  return (
    <Link to={to} className="block group h-full">
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

// Doughnut compacto para las tarjetas del overview — mismo cálculo que
// MixDonut en Tendencia, pero sin leyenda completa (solo top 3 + "Otros").
function MiniDonut({ items, palette }) {
  const total = items.reduce((s, i) => s + i.monto, 0)
  if (items.length === 0 || !total) return <p className="text-xs text-gray-300 text-center py-6">Sin datos</p>

  const top = items.slice(0, 3)
  const resto = items.slice(3)
  const restoMonto = resto.reduce((s, i) => s + i.monto, 0)
  const mostrar = restoMonto > 0 ? [...top, { nombre: `Otros ${resto.length}`, monto: restoMonto, pct: restoMonto / total }] : top

  const R = 46, ri = 30, cx = 54, cy = 54
  let angle = -Math.PI / 2
  const slices = items.map((item, i) => {
    const pct = item.monto / total
    const s = angle, e = angle + pct * 2 * Math.PI
    angle = e
    const large = pct > 0.5 ? 1 : 0
    const d = [
      `M ${cx + R * Math.cos(s)} ${cy + R * Math.sin(s)}`,
      `A ${R} ${R} 0 ${large} 1 ${cx + R * Math.cos(e)} ${cy + R * Math.sin(e)}`,
      `L ${cx + ri * Math.cos(e)} ${cy + ri * Math.sin(e)}`,
      `A ${ri} ${ri} 0 ${large} 0 ${cx + ri * Math.cos(s)} ${cy + ri * Math.sin(s)}`,
      'Z',
    ].join(' ')
    return { color: palette[i % palette.length], d }
  })

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 108 108" width={72} height={72} className="flex-shrink-0">
        {slices.map((s, i) => <path key={i} d={s.d} fill={s.color} stroke="white" strokeWidth={1.5} />)}
      </svg>
      <div className="flex-1 min-w-0 space-y-1">
        {mostrar.map((item, i) => (
          <div key={item.nombre} className="flex items-center gap-1.5 text-[11px]">
            <span className="w-1.5 h-1.5 rounded-sm flex-shrink-0" style={{ background: palette[i % palette.length] }} />
            <span className="text-gray-600 truncate flex-1">{item.nombre}</span>
            <span className="text-gray-500 tabular-nums flex-shrink-0">{(item.pct * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function BIVentasOverview() {
  const ahora = new Date()
  const [periodo, setPeriodo] = useState({ tipo: 'mes', anio: ahora.getFullYear(), mes: ahora.getMonth() + 1 })
  const [datos, setDatos] = useState(null)
  const [pronostico, setPronostico] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const body = periodo.tipo === 'ytd'
      ? { ytd: true, anio: periodo.anio }
      : { anio: periodo.anio, mes: periodo.mes }
    llamar('insights-venta-diaria', body).then(setDatos).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [periodo])

  useEffect(() => {
    setPronostico(null)
    llamar('pronostico-anual', { anio: periodo.anio }).then(setPronostico).catch(() => {})
  }, [periodo.anio])

  return (
    <div className="w-full px-4 py-4 sm:px-8 sm:py-8 max-w-[1600px] mx-auto space-y-6">
      <PageHeader
        title="Ventas"
        sub="Resumen general del negocio — clic en cualquier bloque para ver el desglose"
        right={
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to="/ventas/reporte-diario"
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-500 hover:bg-gray-50 transition-colors"
            >
              <UploadCloud size={14} /> Subir reporte diario
            </Link>
            <SelectorPeriodo periodo={periodo} setPeriodo={setPeriodo} />
          </div>
        }
      />

      {loading && <LoadingState>Cargando...</LoadingState>}
      {error && <ErrorState message={error} />}

      {datos && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
            <KpiTile
              label="Venta neta" value={formatMoney(datos.totales.ventaNeta)} sub={`${datos.dias} día${datos.dias === 1 ? '' : 's'}`}
              delta={<><DeltaPill pct={datos.mom?.ventaNeta} suffix=" MoM" compact /><DeltaPill pct={datos.yoy?.ventaNeta} suffix=" YoY" compact /></>}
            />
            <KpiTile
              label="Venta bruta" value={formatMoney(datos.totales.ventaBruta)} sub="con IVA"
              delta={<><DeltaPill pct={datos.mom?.ventaBruta} suffix=" MoM" compact /><DeltaPill pct={datos.yoy?.ventaBruta} suffix=" YoY" compact /></>}
            />
            <KpiTile
              label="Ticket promedio" value={datos.totales.ticketPromedio != null ? formatMoney(datos.totales.ticketPromedio) : '—'} sub="promedio del periodo"
              delta={<><DeltaPill pct={datos.mom?.ticketPromedio} suffix=" MoM" compact /><DeltaPill pct={datos.yoy?.ticketPromedio} suffix=" YoY" compact /></>}
            />
            <KpiTile
              label="Clientes" value={datos.totales.clientes?.toLocaleString('es-MX') ?? '—'} sub={`${datos.totales.cuentas?.toLocaleString('es-MX') ?? '—'} cuentas`}
              delta={<><DeltaPill pct={datos.mom?.clientes} suffix=" MoM" compact /><DeltaPill pct={datos.yoy?.clientes} suffix=" YoY" compact /></>}
            />
          </div>

          {pronostico ? (
            <Link to="/ventas/tendencia" className="block group">
              <Card className="transition-all group-hover:border-[#c49a2e]/40 group-hover:shadow-md">
                <SectionHeader
                  title={`Pronóstico ${pronostico.anio}`}
                  sub="Venta real (sólido) vs. pronóstico del resto del año (punteado) — clic para ver el detalle completo"
                  right={<ChevronRight size={16} className="text-gray-300 group-hover:text-[#c49a2e] group-hover:translate-x-0.5 transition-all" />}
                />
                <PronosticoAnualChart meses={pronostico.meses} />
              </Card>
            </Link>
          ) : (
            <Card><p className="text-xs text-gray-300 py-10 text-center">Cargando pronóstico...</p></Card>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <Bloque to="/ventas/cancelaciones" titulo="Cancelaciones" sub="Del periodo seleccionado">
              <div className="flex items-center gap-3 py-1">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${CRITICAL}14` }}>
                  <AlertTriangle size={18} style={{ color: CRITICAL }} />
                </div>
                <p className="text-2xl font-bold text-gray-800 tabular-nums">{formatMoney(datos.totales.cancelaciones)}</p>
              </div>
            </Bloque>

            <Bloque to="/ventas/cortesias" titulo="Cortesías" sub="Del periodo seleccionado">
              <div className="flex items-center gap-3 py-1">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${WARNING}14` }}>
                  <Gift size={18} style={{ color: WARNING }} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-800 tabular-nums">{formatMoney(datos.totales.cortesias)}</p>
                  {datos.totales.cortesiasPct != null && (
                    <p className="text-[11px] text-gray-400 tabular-nums">{(datos.totales.cortesiasPct * 100).toFixed(1)}% de la venta</p>
                  )}
                </div>
              </div>
            </Bloque>

            <Bloque to="/" titulo="Ventas por PLU" sub="Detalle por producto">
              <div className="flex items-center gap-3 py-1">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${GOLD_RAMP[1]}14` }}>
                  <Package size={18} style={{ color: GOLD_RAMP[1] }} />
                </div>
                <span className="text-sm font-semibold text-gray-500">Ver productos</span>
              </div>
            </Bloque>

            <Bloque to="/ventas/mix-categoria" titulo="Mix por categoría" sub="% de venta">
              <MiniDonut items={datos.mixCategorias} palette={GOLD_RAMP} />
            </Bloque>

            <Bloque to="/ventas/zonas" titulo="Comedor vs. para llevar" sub="% de venta por zona">
              <MiniDonut items={datos.mixZonas} palette={PALETA_ZONAS} />
            </Bloque>

            <Bloque to="/ventas/formas-pago" titulo="Formas de pago" sub="% del cobrado">
              <MiniDonut items={datos.mixPagos} palette={PALETA_PAGOS} />
            </Bloque>
          </div>
        </>
      )}
    </div>
  )
}
