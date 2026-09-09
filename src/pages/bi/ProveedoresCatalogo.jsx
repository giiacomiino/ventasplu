import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Search } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { llamar } from './shared'
import { Card, PageHeader, LoadingState, ErrorState, EmptyState } from './ui'

function fechaCorta(iso) {
  if (!iso) return '—'
  try { return format(new Date(iso), 'd MMM yyyy', { locale: es }) } catch { return '—' }
}

export default function BIProveedoresCatalogo() {
  const [proveedores, setProveedores] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    llamar('proveedores-lista').then(d => setProveedores(d.proveedores)).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [])

  const filtrados = useMemo(() => {
    if (!proveedores) return []
    const q = busqueda.trim().toLowerCase()
    if (!q) return proveedores
    return proveedores.filter(p => p.nombre.toLowerCase().includes(q) || (p.categoria ?? '').toLowerCase().includes(q))
  }, [proveedores, busqueda])

  return (
    <div className="w-full px-4 py-4 sm:px-8 sm:py-8 max-w-[1400px] mx-auto space-y-6">
      <div>
        <Link to="/proveedores" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-700 mb-3 transition-colors">
          <ArrowLeft size={15} /> Proveedores
        </Link>
        <PageHeader
          title="Catálogo de proveedores"
          sub={proveedores ? `${proveedores.length} proveedores` : 'Nombre, categoría, tipo de producto y días de crédito'}
          right={
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
              <input
                value={busqueda} onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre o categoría..."
                className="pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-[#7a6020]/15 focus:border-[#7a6020]/40"
              />
            </div>
          }
        />
      </div>

      {loading && <LoadingState>Cargando...</LoadingState>}
      {error && <ErrorState message={error} />}

      {!loading && proveedores && (
        <Card padded={false}>
          {filtrados.length === 0 ? (
            <EmptyState>{busqueda ? 'Sin resultados para tu búsqueda.' : 'Sin proveedores registrados aún.'}</EmptyState>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Proveedor</th>
                  <th className="text-left px-6 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Categoría</th>
                  <th className="text-left px-6 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Tipo de producto</th>
                  <th className="text-right px-6 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Días de crédito</th>
                  <th className="text-right px-6 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Actualizado</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((p, i) => (
                  <tr key={`${p.nombre}-${i}`} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                    <td className="px-6 py-3 text-gray-800 font-semibold">{p.nombre}</td>
                    <td className="px-6 py-3 text-gray-600">{p.categoria || <span className="text-gray-300">Sin categoría</span>}</td>
                    <td className="px-6 py-3 text-gray-600">{p.tipoProducto || <span className="text-gray-300">—</span>}</td>
                    <td className="px-6 py-3 text-right text-gray-600 tabular-nums">{p.diasCredito != null ? `${p.diasCredito} días` : <span className="text-gray-300">—</span>}</td>
                    <td className="px-6 py-3 text-right text-gray-400 text-xs">{fechaCorta(p.actualizado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  )
}
