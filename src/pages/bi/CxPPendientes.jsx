import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, FileWarning, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatMoney } from '../../utils/formatters'
import { llamar, GOLD_RAMP, GOOD, WARNING } from './shared'
import { Card, PageHeader, LoadingState, ErrorState } from './ui'

const FACTURAS_COLOR = '#5b7fb8'

// Barritas de los últimos 6 meses de este proveedor — mismo patrón que la
// tendencia de /proveedores, pero sin nada que dependa del presupuesto.
// Segundo eje (línea punteada): promedio redondeado de facturas por mes,
// en su propia escala — no comparte eje con el monto de las barras.
function TendenciaMensual({ serieMensual }) {
  const [hover, setHover] = useState(null)
  const [mesAbierto, setMesAbierto] = useState(null)
  const maxMonto = Math.max(...serieMensual.map(s => s.monto), 1) * 1.15
  const maxFacturas = Math.max(...serieMensual.map(s => s.facturas), 1) * 1.25
  const promedioFacturas = Math.round(serieMensual.reduce((s, m) => s + m.facturas, 0) / serieMensual.length)
  const alturaLineaFacturas = Math.min((promedioFacturas / maxFacturas) * 100, 100)
  const fmtK = n => n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : formatMoney(n)
  const seleccionado = serieMensual.find(s => s.mes === mesAbierto)

  return (
    <div>
      <div className="relative flex items-end gap-1.5 h-24 pr-8">
        <div
          className="absolute left-0 right-8 border-t-2 border-dashed z-10 pointer-events-none"
          style={{ bottom: `${alturaLineaFacturas}%`, borderColor: FACTURAS_COLOR }}
        >
          <span className="absolute right-0 -translate-y-1/2 translate-x-full pl-1.5 text-[10px] font-bold tabular-nums whitespace-nowrap" style={{ color: FACTURAS_COLOR }}>
            ~{promedioFacturas}
          </span>
        </div>
        {serieMensual.map((s, i) => (
          <button
            key={s.mes}
            type="button"
            onClick={() => s.monto > 0 && setMesAbierto(m => m === s.mes ? null : s.mes)}
            className="flex-1 h-full flex flex-col justify-end items-center relative"
            style={{ cursor: s.monto > 0 ? 'pointer' : 'default' }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            {hover === i && (
              <div className="absolute -top-2 -translate-y-full z-20 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg pointer-events-none left-1/2 -translate-x-1/2">
                <p className="font-semibold capitalize">{format(new Date(`${s.mes}-01T00:00:00`), 'MMMM yyyy', { locale: es })}</p>
                <p className="text-gray-300 tabular-nums">{formatMoney(s.monto)} · {s.facturas} factura{s.facturas === 1 ? '' : 's'}</p>
                {s.monto > 0 && <p className="text-gray-400 mt-0.5">clic para ver el desglose</p>}
              </div>
            )}
            <div
              className="relative w-full rounded-t-sm transition-opacity"
              style={{
                height: `${Math.max((s.monto / maxMonto) * 100, s.monto ? 4 : 0)}%`,
                background: GOLD_RAMP[1],
                opacity: hover === i ? 0.7 : 1,
                outline: mesAbierto === s.mes ? `2px solid ${GOLD_RAMP[1]}` : 'none',
                outlineOffset: '2px',
              }}
            >
              {s.monto > 0 && (
                <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white tabular-nums px-0.5 text-center">
                  {fmtK(s.monto)}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
      <div className="flex gap-1.5 mt-1 pr-8">
        {serieMensual.map(s => (
          <div key={s.mes} className="flex-1 text-center text-[9px] text-gray-300 font-medium capitalize">
            {format(new Date(`${s.mes}-01T00:00:00`), 'MMM', { locale: es })}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: GOLD_RAMP[1] }} /> Monto mensual</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 rounded-full flex-shrink-0" style={{ background: FACTURAS_COLOR }} /> Promedio de facturas/mes</span>
      </div>

      {seleccionado && (
        <div className="mt-3 p-3 rounded-lg bg-white border border-gray-100">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 capitalize">
            Facturas de {format(new Date(`${seleccionado.mes}-01T00:00:00`), 'MMMM yyyy', { locale: es })}
          </p>
          {seleccionado.detalle.length === 0 ? (
            <p className="text-xs text-gray-300">Sin detalle disponible</p>
          ) : (
            <div className="space-y-1.5">
              {seleccionado.detalle.map((f, i) => (
                <div key={i} className="flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="text-gray-400 flex-shrink-0">#{f.remision || '—'}</span>
                    <span className="text-gray-600 truncate">{f.descripcion || 'Sin descripción'}</span>
                    {!f.pagada && <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full flex-shrink-0">pendiente</span>}
                  </div>
                  <span className="font-bold text-gray-800 tabular-nums flex-shrink-0">{formatMoney(f.monto)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function FilaProveedor({ p }) {
  const [abierto, setAbierto] = useState(false)

  return (
    <div className="border-b border-gray-50 last:border-0">
      <button
        onClick={() => setAbierto(a => !a)}
        className="w-full flex items-center gap-3 py-3 hover:bg-gray-50/60 transition-colors px-1 -mx-1 rounded-lg text-left"
      >
        {abierto ? <ChevronUp size={14} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />}
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#fab21914' }}>
          <FileWarning size={14} style={{ color: WARNING }} />
        </div>
        <p className="text-sm font-semibold text-gray-800 truncate flex-1 min-w-0">{p.nombre}</p>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-bold text-gray-700 tabular-nums">
            {p.promedio6m != null ? `~${formatMoney(p.promedio6m)}` : 'sin historial'}
          </p>
          <p className="text-[11px] text-gray-400">promedio histórico</p>
        </div>
      </button>

      {abierto && (
        <div className="ml-6 mr-1 mb-3 p-4 rounded-xl bg-gray-50/70">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Facturas registradas — últimos 6 meses</p>
          <TendenciaMensual serieMensual={p.serieMensual} />
        </div>
      )}
    </div>
  )
}

function CategoriaAbatible({ categoria }) {
  const [abierta, setAbierta] = useState(true)

  return (
    <Card>
      <button
        onClick={() => setAbierta(a => !a)}
        className={`w-full flex items-start justify-between gap-3 text-left ${abierta ? 'mb-5' : ''}`}
      >
        <div className="min-w-0">
          <h2 className="text-base font-bold text-gray-900 tracking-tight">{categoria.nombre}</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {categoria.proveedores.length} proveedor{categoria.proveedores.length === 1 ? '' : 'es'} sin registro
          </p>
        </div>
        {abierta ? <ChevronUp size={16} className="text-gray-400 flex-shrink-0 mt-1" /> : <ChevronDown size={16} className="text-gray-400 flex-shrink-0 mt-1" />}
      </button>
      {abierta && (
        <div>
          {categoria.proveedores.map(p => <FilaProveedor key={p.nombre} p={p} />)}
        </div>
      )}
    </Card>
  )
}

// Mismo desglose que ve el dueño en Presupuesto, pero sin nada que venga
// del presupuesto (límites, % usado, implied budget) — esos números se
// arman a partir de la venta y no son para esta vista. Aquí todo sale del
// histórico real de facturas de cada proveedor: cuánto ha subido antes y
// cuándo fue la última vez, para saber qué falta capturar sin exponer
// nada de ingresos.
export default function BICxPPendientes() {
  const [presupuesto, setPresupuesto] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    llamar('presupuesto-arbol').then(setPresupuesto).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [])

  const categoriasConPendientes = useMemo(() => {
    if (!presupuesto) return []
    return presupuesto.categorias
      .map(c => {
        const proveedores = c.proveedores
          .filter(p => p.cadenciaMeses === 1 && p.gastoActual === 0)
          .map(p => {
            const historicoMensual = p.serieMensual.filter(m => m.monto > 0)
            const promedio6m = historicoMensual.length
              ? historicoMensual.reduce((s, m) => s + m.monto, 0) / historicoMensual.length
              : null
            return { nombre: p.nombre, serieMensual: p.serieMensual, promedio6m }
          })
          .sort((a, b) => (b.promedio6m ?? 0) - (a.promedio6m ?? 0))
        return { nombre: c.nombre, proveedores }
      })
      .filter(c => c.proveedores.length > 0)
      .sort((a, b) => b.proveedores.length - a.proveedores.length)
  }, [presupuesto])

  const totalPendientes = categoriasConPendientes.reduce((s, c) => s + c.proveedores.length, 0)

  return (
    <div className="w-full px-4 py-4 sm:px-8 sm:py-8 max-w-[1600px] mx-auto space-y-6">
      <div>
        <Link to="/pagos" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-700 mb-3 transition-colors">
          <ArrowLeft size={15} /> Cuentas por pagar
        </Link>
        <PageHeader
          title="Facturas pendientes de subir"
          sub="Proveedores recurrentes mensuales sin registro este mes — según su historial de facturación"
        />
      </div>

      {loading && <LoadingState>Cargando...</LoadingState>}
      {error && <ErrorState message={error} />}

      {presupuesto && (
        totalPendientes === 0 ? (
          <Card>
            <div className="flex flex-col items-center text-center gap-2 py-10">
              <CheckCircle2 size={24} style={{ color: GOOD }} />
              <p className="text-sm font-semibold" style={{ color: GOOD }}>Todo lo mensual ya está registrado este mes</p>
            </div>
          </Card>
        ) : (
          <div className="space-y-5">
            {categoriasConPendientes.map(c => (
              <CategoriaAbatible key={c.nombre} categoria={c} />
            ))}
          </div>
        )
      )}
    </div>
  )
}
