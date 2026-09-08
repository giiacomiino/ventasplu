import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, AlertTriangle, Search, CheckCircle2, Scale, X } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatMoney } from '../../utils/formatters'
import { llamar, CRITICAL, WARNING, GOOD } from './shared'
import { Card, SectionHeader, PageHeader, LoadingState, ErrorState, EmptyState } from './ui'
import { fechaCorta, esVencida, fechaEfectivaCliente, ModalDetalleFactura, ModalMarcarPagada } from './cxpShared'

function TabButton({ active, onClick, children, count, tono }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-2 px-3 py-2 text-sm font-semibold transition-colors ${
        active ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'
      }`}
    >
      {children}
      {count != null && (
        <span
          className="text-[11px] font-bold rounded-full px-1.5 py-0.5 min-w-[19px] text-center"
          style={{ color: tono || (active ? '#7a6020' : '#9ca3af'), background: tono ? `${tono}14` : active ? '#7a602014' : '#f3f4f6' }}
        >
          {count}
        </span>
      )}
      {active && <span className="absolute -bottom-[13px] left-0 right-0 h-[2px] bg-[#7a6020] rounded-full" />}
    </button>
  )
}

// ─── Calendario: barras gruesas apiladas Pagado (verde) / Falta de pagar
// (rojo), 5 días atrás + hoy + 9 adelante, más un bloque aparte que agrupa
// lo vencido con más de 5 días (si no, esa cola aplasta la escala de las
// barras recientes). Etiqueta de total siempre visible; el desglose exacto
// sale al pasar el cursor.
function Calendario({ dias, vencidasAntiguas, filtro, onFiltrar }) {
  const [hover, setHover] = useState(null)
  const ALTO = 148
  const totales = dias.map(d => d.montoPagado + d.montoPendiente)
  const max = Math.max(...totales, vencidasAntiguas.monto, 1) * 1.18
  const fmtK = n => n >= 1000 ? `$${Math.round(n / 1000)}k` : n > 0 ? formatMoney(n) : ''
  const hoyIdx = 5 // el back manda -5..+9: el índice 5 siempre es "hoy"

  function Barra({ id, total, pagado, pendiente, tooltipTitulo, facturas, activo, onClick, esHoy, esPasado }) {
    const hPagado = Math.max((pagado / max) * ALTO, pagado > 0 ? 3 : 0)
    const hPendiente = Math.max((pendiente / max) * ALTO, pendiente > 0 ? 3 : 0)
    const clickeable = total > 0
    const opacidadBase = esPasado ? 0.55 : 1
    return (
      <div
        className={`relative flex-1 flex flex-col items-center justify-end ${clickeable ? 'cursor-pointer' : 'cursor-default'}`}
        style={{ height: ALTO }}
        onMouseEnter={() => setHover(id)}
        onMouseLeave={() => setHover(null)}
        onClick={clickeable ? onClick : undefined}
      >
        {esHoy && (
          <div
            className="absolute -inset-x-1.5 -top-1.5 -bottom-1.5 rounded-xl z-0"
            style={{ background: 'linear-gradient(180deg, #c49a2e1c, #c49a2e08)', boxShadow: '0 0 0 1px #c49a2e2e inset' }}
          />
        )}
        {hover === id && total > 0 && (
          <div className="absolute -top-1 -translate-y-full left-1/2 -translate-x-1/2 z-20 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg pointer-events-none">
            <p className="font-semibold">{tooltipTitulo}</p>
            {pagado > 0 && <p className="tabular-nums" style={{ color: '#86efac' }}>Pagado: {formatMoney(pagado)}</p>}
            {pendiente > 0 && <p className="tabular-nums" style={{ color: '#fca5a5' }}>Falta: {formatMoney(pendiente)}</p>}
            <p className="text-gray-400 mt-0.5">{facturas} factura{facturas === 1 ? '' : 's'}{clickeable ? ' · clic para ver' : ''}</p>
          </div>
        )}
        {total > 0 && (
          <span className={`relative z-10 mb-1.5 text-[10px] font-bold tabular-nums whitespace-nowrap ${esHoy ? 'text-[#7a6020]' : activo ? 'text-gray-900' : 'text-gray-500'}`}>
            {fmtK(total)}
          </span>
        )}
        <div
          className="relative z-10 w-full rounded-t-[3px] overflow-hidden flex flex-col justify-end transition-[opacity,outline] duration-150"
          style={{
            height: `${Math.max(hPagado + hPendiente, total > 0 ? 4 : 2)}px`,
            opacity: hover != null && hover !== id && !activo ? 0.45 : opacidadBase,
            outline: activo ? '2px solid #111827' : 'none',
            outlineOffset: activo ? '2px' : 0,
          }}
        >
          {hPendiente > 0 && (
            <div className="w-full flex items-start justify-center pt-1" style={{ height: `${hPendiente}px`, background: CRITICAL }}>
              {hPendiente > 22 && <span className="text-[9px] font-bold text-white/90 tabular-nums">{fmtK(pendiente)}</span>}
            </div>
          )}
          {hPagado > 0 && (
            <div className="w-full flex items-start justify-center pt-1" style={{ height: `${hPagado}px`, background: GOOD }}>
              {hPagado > 22 && <span className="text-[9px] font-bold text-white/90 tabular-nums">{fmtK(pagado)}</span>}
            </div>
          )}
          {total === 0 && <div className="w-full h-full flex items-end justify-center pb-0.5"><span className="text-gray-300 text-xs">—</span></div>}
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: GOOD }} /> Pagado</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: CRITICAL }} /> Falta de pagar</span>
        </div>
        <span className="text-[11px] text-gray-300">Clic en una barra para filtrar la tabla</span>
      </div>

      <div className="min-w-[820px]">
        <div className="flex gap-3">
          <Barra
            id="antiguas"
            total={vencidasAntiguas.monto}
            pagado={0}
            pendiente={vencidasAntiguas.monto}
            facturas={vencidasAntiguas.facturas}
            tooltipTitulo="Vencidas hace más de 5 días"
            activo={filtro?.tipo === 'antiguas'}
            onClick={() => onFiltrar({ tipo: 'antiguas', label: 'Vencidas hace más de 5 días' })}
          />
          <div className="w-px bg-gray-100" style={{ height: ALTO }} />
          {dias.map((d, i) => (
            <Barra
              key={d.fecha}
              id={i}
              total={d.montoPagado + d.montoPendiente}
              pagado={d.montoPagado}
              pendiente={d.montoPendiente}
              facturas={d.facturas}
              tooltipTitulo={format(new Date(d.fecha), "EEEE d 'de' MMM", { locale: es })}
              activo={filtro?.tipo === 'dia' && filtro.fecha === d.fecha}
              esHoy={i === hoyIdx}
              esPasado={i < hoyIdx}
              onClick={() => onFiltrar({ tipo: 'dia', fecha: d.fecha, label: format(new Date(d.fecha), "EEEE d 'de' MMM", { locale: es }) })}
            />
          ))}
        </div>

        <div className="flex gap-3 mt-2">
          <div className="flex-1 flex flex-col items-center">
            <span className="text-[11px] font-bold text-gray-400 text-center leading-tight">Vencidas<br />+5 días</span>
          </div>
          <div className="w-px" />
          {dias.map((d, i) => (
            <div key={d.fecha} className="flex-1 flex flex-col items-center gap-1">
              <span className={`text-[11px] font-bold tabular-nums ${i === hoyIdx ? 'text-[#7a6020]' : i < hoyIdx ? 'text-gray-300' : 'text-gray-400'}`}>
                {format(new Date(d.fecha), 'd', { locale: es })}
              </span>
              {i === hoyIdx ? (
                <span className="text-[9px] font-bold uppercase tracking-wide text-white bg-[#7a6020] rounded-full px-2 py-0.5">Hoy</span>
              ) : (
                <span className="text-[10px] uppercase tracking-wide text-gray-300">{format(new Date(d.fecha), 'EEE', { locale: es })}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function FilaFactura({ f, onAbrir }) {
  const vencida = esVencida(f)
  return (
    <tr onClick={() => onAbrir(f)} className="cursor-pointer border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors">
      <td className="px-4 py-3 text-xs text-gray-400 tabular-nums">{f.remision}</td>
      <td className="px-4 py-3 text-gray-700 font-medium">{f.proveedor}</td>
      <td className="px-4 py-3 text-xs text-gray-400">{f.categoria}</td>
      <td className="px-4 py-3 text-xs text-gray-400 tabular-nums">{fechaCorta(f.fechaIngreso)}</td>
      <td className="px-4 py-3 text-xs tabular-nums">
        <div className="flex flex-col gap-1">
          <span className={vencida ? 'font-bold' : 'text-gray-600'} style={vencida ? { color: CRITICAL } : undefined}>
            {fechaCorta(f.fechaPagoCalculada || f.fechaPagoVura)}
          </span>
          {f.calculoDisponible && !f.coincide && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold w-fit px-1.5 py-0.5 rounded-full" style={{ color: WARNING, background: '#fab21914' }}>
              <Scale size={10} /> VURA: {fechaCorta(f.fechaPagoVura)}
            </span>
          )}
          {!f.calculoDisponible && <span className="text-[10px] text-gray-300">sin días de crédito</span>}
        </div>
      </td>
      <td className="px-4 py-3 text-right font-bold text-gray-800 tabular-nums">{formatMoney(f.monto)}</td>
      <td className="px-4 py-3 text-right">
        {f.pagada ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: GOOD }}>
            <CheckCircle2 size={13} /> Pagada
          </span>
        ) : (
          <span className="text-xs text-gray-300">Ver detalle</span>
        )}
      </td>
    </tr>
  )
}

function TablaFacturas({ facturas, onAbrir }) {
  if (facturas.length === 0) return <EmptyState>Sin facturas en esta vista</EmptyState>
  return (
    <div className="overflow-x-auto -mx-6 px-6">
      <table className="w-full text-sm min-w-[760px]">
        <thead>
          <tr className="border-b border-gray-100">
            {['Folio', 'Proveedor', 'Categoría', 'Ingreso', 'Fecha de pago', '', ''].map((c, i) => (
              <th key={i} className={`px-4 py-2.5 text-[11px] font-bold text-gray-400 uppercase tracking-wider ${i >= 5 ? 'text-right' : 'text-left'}`}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {facturas.map(f => <FilaFactura key={f.id} f={f} onAbrir={onAbrir} />)}
        </tbody>
      </table>
    </div>
  )
}

export default function BICxPFacturas() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('pendientes')
  const [busqueda, setBusqueda] = useState('')
  const [facturaAbierta, setFacturaAbierta] = useState(null)
  const [modalPago, setModalPago] = useState(null)
  const [filtroCalendario, setFiltroCalendario] = useState(null)

  useEffect(() => {
    llamar('pagos-cxp').then(setDatos).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [])

  function elegirTab(t) {
    setFiltroCalendario(null)
    setTab(t)
  }

  function elegirFiltroCalendario(f) {
    setFiltroCalendario(prev => (prev?.tipo === f.tipo && prev.fecha === f.fecha ? null : f))
  }

  const listaActiva = useMemo(() => {
    if (!datos) return []
    let base
    if (filtroCalendario?.tipo === 'antiguas') {
      const cincoDiasAtras = new Date()
      cincoDiasAtras.setDate(cincoDiasAtras.getDate() - 5)
      base = datos.pendientes.filter(f => {
        const fecha = fechaEfectivaCliente(f)
        return fecha && new Date(fecha) < cincoDiasAtras
      })
    } else if (filtroCalendario?.tipo === 'dia') {
      base = [...datos.pendientes, ...datos.pagadas].filter(f => (fechaEfectivaCliente(f) || '').slice(0, 10) === filtroCalendario.fecha)
    } else {
      base = tab === 'pendientes' ? datos.pendientes
        : tab === 'vencidas' ? datos.pendientes.filter(esVencida)
        : tab === 'pagadas' ? datos.pagadas
        : datos.discrepancias
    }
    if (!busqueda.trim()) return base
    const q = busqueda.trim().toLowerCase()
    return base.filter(f => String(f.remision).toLowerCase().includes(q) || f.proveedor.toLowerCase().includes(q))
  }, [datos, tab, busqueda, filtroCalendario])

  function abrirFactura(f) {
    setFacturaAbierta(f)
  }

  function recargar() {
    llamar('pagos-cxp').then(setDatos).catch(e => setError(e.message))
  }

  return (
    <div className="w-full px-4 py-4 sm:px-8 sm:py-8 max-w-[1600px] mx-auto space-y-8">
      <div>
        <Link to="/pagos" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-700 mb-3 transition-colors">
          <ArrowLeft size={15} /> Cuentas por pagar
        </Link>
        <PageHeader title="Facturas" sub="Calendario de pagos y validación de fechas contra VURA" />
      </div>

      {loading && <LoadingState>Cargando...</LoadingState>}
      {error && <ErrorState message={error} />}

      {datos && (
        <>
          <Card>
            <SectionHeader title="Calendario de pago" sub="Fecha calculada: ingreso + días de crédito del proveedor" />
            <Calendario dias={datos.calendario} vencidasAntiguas={datos.vencidasAntiguas} filtro={filtroCalendario} onFiltrar={elegirFiltroCalendario} />
          </Card>

          <Card className="!p-0">
            <div className="px-6 pt-6 flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-0">
                <div className="flex gap-5">
                  <TabButton active={!filtroCalendario && tab === 'pendientes'} onClick={() => elegirTab('pendientes')} count={datos.pendientes.length}>Por pagar</TabButton>
                  <TabButton active={!filtroCalendario && tab === 'vencidas'} onClick={() => elegirTab('vencidas')} count={datos.facturasVencidas} tono={CRITICAL}>Vencidas</TabButton>
                  <TabButton active={!filtroCalendario && tab === 'pagadas'} onClick={() => elegirTab('pagadas')} count={datos.pagadas.length}>Pagadas (30d)</TabButton>
                  <TabButton active={!filtroCalendario && tab === 'discrepancias'} onClick={() => elegirTab('discrepancias')} count={datos.discrepancias.length} tono={WARNING}>Diferencias</TabButton>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 -mt-1">
                {filtroCalendario ? (
                  <button
                    onClick={() => setFiltroCalendario(null)}
                    className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-full pl-3 pr-2 py-1.5 transition-colors"
                  >
                    Filtrando calendario: {filtroCalendario.label}
                    <X size={13} />
                  </button>
                ) : <span />}
                <div className="relative w-full sm:w-64">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
                  <input
                    value={busqueda} onChange={e => setBusqueda(e.target.value)}
                    placeholder="Buscar folio o proveedor..."
                    className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c49a2e]/40"
                  />
                </div>
              </div>
            </div>
            <div className="pt-2 pb-2">
              <TablaFacturas facturas={listaActiva} onAbrir={abrirFactura} />
            </div>
          </Card>

          {datos.discrepancias.length > 0 ? (
            <button
              onClick={() => elegirTab('discrepancias')}
              className="w-full flex items-center gap-3 text-left rounded-2xl border px-5 py-4 transition-colors hover:brightness-[0.98]"
              style={{ background: '#fab21910', borderColor: '#fab21935' }}
            >
              <Scale size={18} style={{ color: WARNING }} className="flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-gray-900">
                  {datos.discrepancias.length} factura{datos.discrepancias.length === 1 ? '' : 's'} con fecha de pago distinta a la calculada
                </p>
                <p className="text-xs text-gray-500 mt-0.5">Compara contra lo que ya tiene guardado VURA antes de confiar en la migración</p>
              </div>
              <span className="text-xs font-bold flex-shrink-0" style={{ color: WARNING }}>Revisar →</span>
            </button>
          ) : (
            <p className="text-xs text-gray-400 flex items-center gap-1.5 px-1">
              <CheckCircle2 size={13} style={{ color: GOOD }} /> Sin diferencias entre la fecha calculada y la de VURA, de {datos.proveedoresConDiasCredito} proveedores con días de crédito.
            </p>
          )}
        </>
      )}

      {facturaAbierta && (
        <ModalDetalleFactura
          factura={facturaAbierta}
          onClose={() => setFacturaAbierta(null)}
          onMarcarPagada={f => { setFacturaAbierta(null); setModalPago(f) }}
        />
      )}

      {modalPago && (
        <ModalMarcarPagada
          factura={modalPago}
          cuentas={datos?.cuentasBancarias ?? []}
          onClose={() => setModalPago(null)}
          onPagada={() => {
            setModalPago(null)
            recargar()
          }}
        />
      )}
    </div>
  )
}
