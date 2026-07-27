import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, AlertTriangle, ChevronDown, ChevronUp, Search } from 'lucide-react'
import { formatMoney } from '../../utils/formatters'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { llamar, GOLD_RAMP, WARNING } from './shared'
import { Card, SectionHeader, PageHeader, KpiTile, DeltaPill, MiniBar, LoadingState, ErrorState, EmptyState } from './ui'
import { useMesSeleccionado, SelectorMes } from './mesContext'

function Tooltip({ children }) {
  return (
    <div className="absolute -top-2 -translate-y-full z-20 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg pointer-events-none left-1/2 -translate-x-1/2">
      {children}
    </div>
  )
}

// ─── Tendencia mensual de un proveedor (12 meses) ──────────────────────────

function TendenciaProveedor({ serieMensual }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(...serieMensual.map(s => s.monto), 1) * 1.15

  return (
    <div>
      <div className="relative flex items-end gap-1.5 h-24">
        {serieMensual.map((s, i) => (
          <div
            key={s.mes}
            className="flex-1 h-full flex flex-col justify-end items-center relative cursor-pointer"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            {hover === i && (
              <Tooltip>
                <p className="font-semibold capitalize">{format(new Date(`${s.mes}-01T00:00:00`), 'MMMM yyyy', { locale: es })}</p>
                <p className="text-gray-300">{formatMoney(s.monto)}</p>
              </Tooltip>
            )}
            <div
              className="w-full rounded-t-sm transition-opacity"
              style={{ height: `${Math.max((s.monto / max) * 100, s.monto ? 4 : 0)}%`, background: GOLD_RAMP[1], opacity: hover === i ? 0.7 : 1 }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 mt-1">
        {serieMensual.map(s => (
          <div key={s.mes} className="flex-1 text-center text-[9px] text-gray-300 font-medium">{s.mes.slice(5)}</div>
        ))}
      </div>
    </div>
  )
}

// ─── Fila de proveedor (expandible) ────────────────────────────────────────

function ProveedorRow({ p, maxMonto }) {
  const [abierto, setAbierto] = useState(false)
  const tagsVisibles = p.categorias.slice(0, 2)
  const restoTags = p.categorias.length - tagsVisibles.length

  return (
    <div className="border-b border-gray-50 last:border-0">
      <button
        onClick={() => setAbierto(a => !a)}
        className="w-full text-left py-4 hover:bg-gray-50/60 transition-colors px-1 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-400"
      >
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="min-w-0 flex items-center gap-2">
            {abierto ? <ChevronUp size={15} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={15} className="text-gray-400 flex-shrink-0" />}
            <span className="text-sm font-bold text-gray-900 truncate">{p.nombre}</span>
            <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
              {tagsVisibles.map(c => (
                <span key={c.nombre} className="text-[10px] font-semibold text-gray-500 bg-gray-100 rounded-full px-2 py-0.5 whitespace-nowrap">{c.nombre}</span>
              ))}
              {restoTags > 0 && <span className="text-[10px] font-semibold text-gray-400">+{restoTags}</span>}
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="text-xs text-gray-400">{p.facturas} factura{p.facturas === 1 ? '' : 's'}</span>
            {p.yoyPct != null && <DeltaPill pct={p.yoyPct} invert suffix=" YoY" compact />}
          </div>
        </div>
        <div className="flex items-center gap-3 pl-6">
          <MiniBar pct={maxMonto ? p.monto / maxMonto : 0} color={GOLD_RAMP[1]} />
          <span className="text-sm font-bold text-gray-800 tabular-nums flex-shrink-0">{formatMoney(p.monto)}</span>
          <span className="text-xs text-gray-400 flex-shrink-0">{p.pctDelTotal != null ? `${(p.pctDelTotal * 100).toFixed(1)}% del total` : ''}</span>
        </div>
      </button>

      {abierto && (
        <div className="ml-6 mr-1 mb-4 p-4 rounded-xl bg-gray-50/70 grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Tendencia — últimos 12 meses</p>
            <TendenciaProveedor serieMensual={p.serieMensual} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Categorías que factura</p>
            <div className="space-y-2">
              {p.categorias.map(c => (
                <div key={c.nombre} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-gray-600 truncate">{c.nombre}</span>
                  <span className="font-semibold text-gray-800 tabular-nums flex-shrink-0">{formatMoney(c.monto)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function BIProveedores() {
  const { anio, mes } = useMesSeleccionado()
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState('')

  useEffect(() => {
    setLoading(true)
    llamar('proveedores-auditoria', { anio, mes }).then(setDatos).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [anio, mes])

  const proveedoresFiltrados = useMemo(() => {
    if (!datos) return []
    const q = busqueda.trim().toLowerCase()
    return datos.proveedores.filter(p =>
      (!q || p.nombre.toLowerCase().includes(q)) &&
      (!categoriaFiltro || p.categorias.some(c => c.nombre === categoriaFiltro)),
    )
  }, [datos, busqueda, categoriaFiltro])

  const maxMonto = datos?.proveedores[0]?.monto ?? 0

  return (
    <div className="w-full px-4 py-4 sm:px-8 sm:py-8 max-w-[1600px] mx-auto space-y-8">
      <div>
        <Link to="/business-intelligence" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-700 mb-3 transition-colors">
          <ArrowLeft size={15} /> Business Intelligence
        </Link>
        <PageHeader
          title="Proveedores"
          sub="Auditoría de gasto por proveedor — ventana móvil de 12 meses (excluye Fonda La Trattoria, proveedor interno)"
          right={<SelectorMes />}
        />
      </div>

      {loading && <LoadingState>Cargando auditoría de proveedores...</LoadingState>}
      {error && <ErrorState message={error} />}

      {datos && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
            <KpiTile label="Gasto total (12 meses)" value={formatMoney(datos.totalGastado)} sub={`${datos.totalFacturas} facturas`} />
            <KpiTile label="Proveedores activos" value={datos.totalProveedores.toLocaleString('es-MX')} />
            <KpiTile
              label="Concentración top 5"
              value={datos.concentracionTop5 != null ? `${(datos.concentracionTop5 * 100).toFixed(0)}%` : '—'}
              sub={
                datos.concentracionTop5 >= 0.5 ? (
                  <span className="inline-flex items-center gap-1 font-semibold" style={{ color: WARNING }}>
                    <AlertTriangle size={12} /> Dependencia alta
                  </span>
                ) : null
              }
            />
            <KpiTile label="Categorías representadas" value={datos.categoriasDisponibles.length.toLocaleString('es-MX')} />
          </div>

          <Card padded={false}>
            <div className="p-6 pb-4 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
                <input
                  type="text"
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  placeholder="Buscar proveedor..."
                  className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
                />
              </div>
              <select
                value={categoriaFiltro}
                onChange={e => setCategoriaFiltro(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-gold-400 sm:w-64"
              >
                <option value="">Todas las categorías</option>
                {datos.categoriasDisponibles.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="px-6 pb-4">
              <SectionHeader
                title="Todos los proveedores"
                sub={`${proveedoresFiltrados.length} de ${datos.proveedores.length} · ordenado por gasto en la ventana`}
              />
              {proveedoresFiltrados.length === 0 ? (
                <EmptyState>Sin proveedores que coincidan con la búsqueda</EmptyState>
              ) : (
                <div>
                  {proveedoresFiltrados.map(p => <ProveedorRow key={p.nombre} p={p} maxMonto={maxMonto} />)}
                </div>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
