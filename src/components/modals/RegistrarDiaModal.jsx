import { useState, useEffect, useCallback } from 'react'
import { useProductos } from '../../hooks/useProductos'
import { useRegistros } from '../../hooks/useRegistros'
import Modal from '../ui/Modal'
import { format } from 'date-fns'
import { Trash2, Lock } from 'lucide-react'

function precioEnFecha(precios, fechaStr) {
  if (!precios?.length) return null
  return [...precios]
    .filter(p => p.vigente_desde <= fechaStr)
    .sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde))[0]?.precio ?? null
}

// ─── Vista unificada: productos ya registrados + faltantes ───────────────────
function VistaRegistro({ fecha, onGuardado }) {
  const [filas,    setFilas]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [msg,      setMsg]      = useState('')

  const { productos }                                          = useProductos()
  const { getRegistrosPorFecha, registrarVenta, eliminarRegistro } = useRegistros()

  const cargar = useCallback(async () => {
    if (!fecha || !productos.length) return
    setLoading(true)
    const existentes = await getRegistrosPorFecha(new Date(fecha + 'T12:00:00'))
    const existMap   = Object.fromEntries(existentes.map(r => [r.producto_id, r]))

    setFilas(productos.map(p => {
      const exist  = existMap[p.id]
      const precio = precioEnFecha(p.precios, fecha)
      if (exist) {
        return {
          producto_id:  p.id,
          nombre:       p.nombre,
          subcategoria: p.subcategoria,
          unidades:     String(exist.unidades),
          _precio:      exist.costo_unitario ?? precio,
          _monto:       Number(exist.monto),
          existingId:   exist.id,
          locked:       true,
        }
      }
      return {
        producto_id:  p.id,
        nombre:       p.nombre,
        subcategoria: p.subcategoria,
        unidades:     '',
        _precio:      precio,
        _monto:       null,
        existingId:   null,
        locked:       false,
      }
    }))
    setLoading(false)
  }, [fecha, productos])

  useEffect(() => { cargar() }, [cargar])

  const handleUnidades = (id, valor) => {
    setFilas(prev => prev.map(f => {
      if (f.producto_id !== id || f.locked) return f
      const hasVal = valor !== ''
      const u = parseInt(valor) || 0
      return {
        ...f,
        unidades: valor,
        _monto: hasVal && f._precio != null ? Math.round(u * f._precio) : null,
      }
    }))
  }

  const handleEliminar = async (existingId) => {
    if (!window.confirm('¿Eliminar este registro?')) return
    setDeleting(existingId)
    await eliminarRegistro(existingId)
    // Unlock the row so it can be re-filled
    setFilas(prev => prev.map(f =>
      f.existingId === existingId
        ? { ...f, unidades: '', _monto: null, existingId: null, locked: false }
        : f
    ))
    setDeleting(null)
  }

  const handleGuardar = async () => {
    const nuevos = filas.filter(f => !f.locked && f.unidades !== '')
    if (!nuevos.length) return
    setSaving(true)
    let errors = 0
    for (const f of nuevos) {
      const err = await registrarVenta({
        producto_id:    f.producto_id,
        fecha,
        unidades:       parseInt(f.unidades),
        monto:          f._monto ?? 0,
        costo_unitario: f._precio ?? null,
      })
      if (err) errors++
    }
    setSaving(false)
    if (errors === 0) {
      setMsg(`✓ ${nuevos.length} registro${nuevos.length !== 1 ? 's' : ''} guardado${nuevos.length !== 1 ? 's' : ''}`)
      setTimeout(onGuardado, 1200)
    } else {
      setMsg(`Hubo ${errors} errores al guardar`)
    }
  }

  const locked   = filas.filter(f => f.locked)
  const unlocked = filas.filter(f => !f.locked)
  const pendientes = unlocked.filter(f => f.unidades !== '')

  const totalUnidadesNuevas = pendientes.reduce((s, f) => s + (parseInt(f.unidades) || 0), 0)
  const totalMontoNuevo     = pendientes.reduce((s, f) => s + (f._monto || 0), 0)

  if (loading) return <p className="text-center py-16 text-gray-400 text-sm">Cargando...</p>

  return (
    <>
      {/* Resumen si hay mezcla */}
      {locked.length > 0 && unlocked.length > 0 && (
        <div className="mx-4 mt-4 mb-0 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700 flex-shrink-0">
          <span className="font-bold">{locked.length}</span> producto{locked.length !== 1 ? 's' : ''} ya registrado{locked.length !== 1 ? 's' : ''} ·{' '}
          <span className="font-bold">{unlocked.length}</span> pendiente{unlocked.length !== 1 ? 's' : ''}
        </div>
      )}

      {/* Totales de los nuevos */}
      {totalUnidadesNuevas > 0 && (
        <div className="px-5 pt-3 flex-shrink-0 flex gap-6 justify-end">
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Unidades nuevas</p>
            <p className="text-lg font-bold text-gray-700">{totalUnidadesNuevas.toLocaleString('es-MX')}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Monto nuevo</p>
            <p className="text-lg font-bold text-gray-900">
              ${totalMontoNuevo.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>
      )}

      <div className="overflow-auto flex-1">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white border-b shadow-sm z-10">
            <tr>
              <th className="w-8" />
              <th className="text-left px-4 py-2.5 font-semibold text-gray-500 text-xs">Producto</th>
              <th className="text-left px-4 py-2.5 font-semibold text-gray-500 text-xs">Subcategoría</th>
              <th className="text-right px-4 py-2.5 font-semibold text-gray-500 text-xs">Precio unit.</th>
              <th className="text-right px-4 py-2.5 font-semibold text-gray-500 text-xs">Unidades</th>
              <th className="text-right px-4 py-2.5 font-semibold text-gray-500 text-xs">Monto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filas.map(f => (
              <tr key={f.producto_id}
                className={`
                  ${f.locked ? 'bg-green-50/50' : f.unidades ? 'bg-amber-50/30' : 'hover:bg-gray-50'}
                  transition-colors
                `}>
                {/* Acción */}
                <td className="pl-3">
                  {f.locked ? (
                    <button
                      onClick={() => handleEliminar(f.existingId)}
                      disabled={deleting === f.existingId}
                      title="Eliminar registro"
                      className="text-red-200 hover:text-red-400 disabled:opacity-40 p-1 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  ) : (
                    <span className="p-1 block w-5" />
                  )}
                </td>

                {/* Nombre */}
                <td className="px-4 py-1.5 font-medium text-gray-800">
                  <span className="flex items-center gap-1.5">
                    {f.nombre}
                    {f.locked && <Lock size={10} className="text-green-400 flex-shrink-0" />}
                  </span>
                </td>

                <td className="px-4 py-1.5 text-gray-400 text-xs">{f.subcategoria}</td>

                <td className="px-4 py-1.5 text-right text-xs text-gray-400 tabular-nums">
                  {f._precio != null ? `$${f._precio}` : <span className="text-gray-200">--</span>}
                </td>

                {/* Unidades */}
                <td className="px-4 py-1.5 text-right">
                  {f.locked ? (
                    <span className="text-sm font-bold text-green-700 tabular-nums">
                      {Number(f.unidades).toLocaleString('es-MX')}
                    </span>
                  ) : (
                    <input
                      type="number"
                      min="0"
                      value={f.unidades}
                      placeholder="—"
                      onChange={e => handleUnidades(f.producto_id, e.target.value)}
                      className="w-20 border rounded-lg px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-gold-400"
                    />
                  )}
                </td>

                {/* Monto */}
                <td className="px-4 py-1.5 text-right">
                  <span className={`text-sm tabular-nums font-medium
                    ${f.locked ? 'text-green-700' : f._monto != null ? 'text-gray-800' : 'text-gray-200'}`}>
                    {f._monto != null ? `$${f._monto.toLocaleString('es-MX', { maximumFractionDigits: 0 })}` : '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-5 border-t flex justify-between items-center flex-shrink-0">
        {msg ? (
          <p className="text-sm text-green-600 font-medium">{msg}</p>
        ) : (
          <p className="text-xs text-gray-400">
            {unlocked.length === 0
              ? 'Todos los productos están registrados.'
              : 'Solo ingresa unidades — el monto se calcula solo.'}
          </p>
        )}
        {unlocked.length > 0 && (
          <button
            onClick={handleGuardar}
            disabled={saving || pendientes.length === 0}
            className="px-6 py-2 bg-gold-700 text-white rounded-lg font-semibold text-sm hover:bg-gold-600 disabled:opacity-40 transition-colors"
          >
            {saving ? 'Guardando...' : `Guardar${pendientes.length ? ` (${pendientes.length})` : ''}`}
          </button>
        )}
      </div>
    </>
  )
}

// ─── Modal principal ─────────────────────────────────────────────────────────
export default function RegistrarDiaModal({ onClose }) {
  const [fecha, setFecha] = useState(format(new Date(), 'yyyy-MM-dd'))

  return (
    <Modal onClose={onClose} maxWidth="max-w-3xl">
      {/* Header */}
      <div className="flex justify-between items-center p-6 border-b flex-shrink-0">
        <h2 className="text-xl font-bold text-green-800">Registrar día</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
      </div>

      {/* Selector de fecha */}
      <div className="p-5 border-b flex-shrink-0">
        <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Fecha</label>
        <input
          type="date"
          value={fecha}
          onChange={e => setFecha(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
        />
      </div>

      <VistaRegistro key={fecha} fecha={fecha} onGuardado={onClose} />
    </Modal>
  )
}
