import { useState } from 'react'
import { useProductos } from '../../hooks/useProductos'
import Modal from '../ui/Modal'
import { format } from 'date-fns'
import { Pencil, Check, X, Plus, History } from 'lucide-react'

// Calcula vigente_hasta de cada precio a partir del siguiente
function preciosConRango(precios) {
  if (!precios?.length) return []
  const sorted = [...precios].sort((a, b) => a.vigente_desde.localeCompare(b.vigente_desde))
  return sorted.map((p, i) => ({
    ...p,
    vigente_hasta: i < sorted.length - 1 ? sorted[i + 1].vigente_desde : null
  }))
}

function formatFecha(str) {
  if (!str) return null
  return format(new Date(str + 'T12:00'), 'dd MMM yyyy')
}

// Un día antes de una fecha ISO
function diaAntes(isoStr) {
  const d = new Date(isoStr + 'T12:00')
  d.setDate(d.getDate() - 1)
  return format(d, 'dd MMM yyyy')
}

export default function ListaProductosModal({ onClose }) {
  const { productos, loading, precioVigente, actualizarPrecio, agregarProducto } = useProductos()
  const [editando, setEditando]       = useState(null)
  const [nuevoPrecio, setNuevo]       = useState('')
  const [nuevaFecha, setNuevaFecha]   = useState(format(new Date(), 'yyyy-MM-dd'))
  const [agregando, setAgregando]     = useState(false)
  const [historialAbierto, setHistorialAbierto] = useState(new Set())
  const [nuevoP, setNuevoP]           = useState({ nombre: '', subcategoria: '', categoria: 'Alimentos' })
  const [saving, setSaving]           = useState(false)

  const toggleHistorial = (id) => setHistorialAbierto(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const handleGuardarPrecio = async () => {
    if (!editando || !nuevoPrecio) return
    setSaving(true)
    await actualizarPrecio(editando, nuevoPrecio, nuevaFecha)
    setEditando(null)
    setNuevo('')
    setSaving(false)
  }

  const handleAgregar = async () => {
    if (!nuevoP.nombre || !nuevoP.subcategoria) return
    setSaving(true)
    await agregarProducto(nuevoP)
    setAgregando(false)
    setNuevoP({ nombre: '', subcategoria: '', categoria: 'Alimentos' })
    setSaving(false)
  }

  return (
    <Modal onClose={onClose} maxWidth="max-w-4xl">
      <div className="flex justify-between items-center p-6 border-b flex-shrink-0">
        <h2 className="text-xl font-bold text-gray-800">Lista de Productos y Precios</h2>
        <div className="flex gap-3 items-center">
          <button onClick={() => setAgregando(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gold-700 border border-gold-400 rounded-lg hover:bg-gold-50 transition-colors">
            <Plus size={14} /> Nuevo producto
          </button>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
      </div>

      {/* Formulario nuevo producto */}
      {agregando && (
        <div className="p-4 border-b bg-gold-50 flex gap-3 items-end flex-shrink-0">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Nombre</label>
            <input value={nuevoP.nombre} onChange={e => setNuevoP(p => ({...p, nombre: e.target.value}))}
              className="border rounded-lg px-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-1 focus:ring-gold-400" placeholder="Nombre PLU" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Subcategoría</label>
            <input value={nuevoP.subcategoria} onChange={e => setNuevoP(p => ({...p, subcategoria: e.target.value}))}
              className="border rounded-lg px-3 py-1.5 text-sm w-36 focus:outline-none focus:ring-1 focus:ring-gold-400" placeholder="Subcategoría" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Categoría</label>
            <select value={nuevoP.categoria} onChange={e => setNuevoP(p => ({...p, categoria: e.target.value}))}
              className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold-400">
              <option>Alimentos</option>
              <option>Bebidas</option>
            </select>
          </div>
          <button onClick={handleAgregar} disabled={saving}
            className="px-4 py-1.5 bg-gold-700 text-white rounded-lg text-sm font-semibold hover:bg-gold-600 disabled:opacity-50">
            {saving ? '...' : 'Agregar'}
          </button>
        </div>
      )}

      <div className="overflow-auto flex-1">
        {loading ? (
          <p className="text-center py-10 text-gray-400">Cargando productos...</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white border-b shadow-sm">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs">Producto</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs">Subcategoría</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs">Precio actual</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs">Vigente desde</th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {productos.map(p => {
                const pv       = precioVigente(p)
                const isEditing = editando === p.id
                const histOpen  = historialAbierto.has(p.id)
                const rangos    = preciosConRango(p.precios)

                return [
                  /* Fila principal */
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors border-b border-gray-100">
                    <td className="px-4 py-2.5 text-gray-800 font-medium">{p.nombre}</td>
                    <td className="px-4 py-2.5 text-gray-500">{p.subcategoria}</td>

                    {/* Precio actual con edición inline */}
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-800">
                      {isEditing ? (
                        <div className="flex gap-1 justify-end items-center">
                          <span className="text-gray-400 text-xs">$</span>
                          <input type="number" value={nuevoPrecio}
                            onChange={e => setNuevo(e.target.value)}
                            className="w-20 border rounded px-2 py-0.5 text-right text-sm focus:outline-none focus:ring-1 focus:ring-gold-400"
                            placeholder="0" autoFocus
                          />
                          <span className="text-gray-400 text-xs mx-1">desde</span>
                          <input type="date" value={nuevaFecha}
                            onChange={e => setNuevaFecha(e.target.value)}
                            className="border rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-gold-400"
                          />
                          <button onClick={handleGuardarPrecio} disabled={saving}
                            className="text-green-600 hover:text-green-800 p-1"><Check size={14} /></button>
                          <button onClick={() => setEditando(null)}
                            className="text-gray-400 hover:text-gray-600 p-1"><X size={14} /></button>
                        </div>
                      ) : (
                        pv ? `$${pv.precio}` : <span className="text-gray-300">--</span>
                      )}
                    </td>

                    <td className="px-4 py-2.5 text-right text-xs text-gray-400">
                      {pv ? formatFecha(pv.vigente_desde) : '--'}
                    </td>

                    <td className="px-4 py-2.5 text-right">
                      <div className="flex gap-1 justify-end">
                        {/* Historial de precios */}
                        {rangos.length > 1 && (
                          <button onClick={() => toggleHistorial(p.id)}
                            title="Ver historial de precios"
                            className={`p-1 rounded transition-colors ${
                              histOpen ? 'text-gold-600 bg-gold-50' : 'text-gray-300 hover:text-gold-500'
                            }`}>
                            <History size={13} />
                          </button>
                        )}
                        {/* Editar precio */}
                        {!isEditing && (
                          <button onClick={() => {
                            setEditando(p.id)
                            setNuevo(pv?.precio?.toString() || '')
                            setNuevaFecha(format(new Date(), 'yyyy-MM-dd'))
                          }}
                            className="p-1 text-gold-600 hover:text-gold-800 transition-colors">
                            <Pencil size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>,

                  /* Historial de precios expandido */
                  histOpen && (
                    <tr key={`hist-${p.id}`} className="bg-amber-50/40">
                      <td colSpan={5} className="px-4 pb-3 pt-1">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 pl-2">
                          Historial de precios — {p.nombre}
                        </p>
                        <table className="w-full text-xs border rounded-lg overflow-hidden">
                          <thead>
                            <tr className="bg-white border-b">
                              <th className="text-right px-3 py-2 font-semibold text-gray-500">Precio</th>
                              <th className="text-center px-3 py-2 font-semibold text-gray-500">Vigente desde</th>
                              <th className="text-center px-3 py-2 font-semibold text-gray-500">Vigente hasta</th>
                              <th className="text-center px-3 py-2 font-semibold text-gray-500">Estado</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {[...rangos].reverse().map((r, i) => (
                              <tr key={i} className={r.vigente_hasta === null ? 'bg-green-50' : 'bg-white'}>
                                <td className="text-right px-3 py-2 font-bold text-gray-800">${r.precio}</td>
                                <td className="text-center px-3 py-2 text-gray-600">{formatFecha(r.vigente_desde)}</td>
                                <td className="text-center px-3 py-2 text-gray-600">
                                  {r.vigente_hasta ? diaAntes(r.vigente_hasta) : '—'}
                                </td>
                                <td className="text-center px-3 py-2">
                                  {r.vigente_hasta === null
                                    ? <span className="inline-block px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold text-xs">Actual</span>
                                    : <span className="inline-block px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 text-xs">Anterior</span>
                                  }
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )
                ]
              })}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  )
}
