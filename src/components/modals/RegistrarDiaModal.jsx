import { useState, useEffect, useCallback } from 'react'
import { useProductos } from '../../hooks/useProductos'
import { useRegistros } from '../../hooks/useRegistros'
import Modal from '../ui/Modal'
import { format } from 'date-fns'
import { Trash2 } from 'lucide-react'

function precioEnFecha(precios, fechaStr) {
  if (!precios?.length) return null
  return [...precios]
    .filter(p => p.vigente_desde <= fechaStr)
    .sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde))[0]?.precio ?? null
}

// ─── Vista: registros existentes (solo lectura + eliminar) ───────────────────
function VistaExistente({ fecha, onVacia }) {
  const [registros, setRegistros] = useState([])
  const [loading, setLoading]     = useState(true)
  const [deleting, setDeleting]   = useState(null)
  const { getRegistrosPorFecha, eliminarRegistro } = useRegistros()

  const cargar = useCallback(async () => {
    setLoading(true)
    const data = await getRegistrosPorFecha(new Date(fecha + 'T12:00:00'))
    setRegistros(data)
    setLoading(false)
    if (data.length === 0) onVacia()
  }, [fecha])

  useEffect(() => { cargar() }, [cargar])

  const handleEliminar = async (id) => {
    if (!window.confirm('¿Eliminar este registro?')) return
    setDeleting(id)
    await eliminarRegistro(id)
    const nuevos = registros.filter(r => r.id !== id)
    setRegistros(nuevos)
    setDeleting(null)
    if (nuevos.length === 0) onVacia()
  }

  const totalMonto    = registros.reduce((s, r) => s + Number(r.monto || 0), 0)
  const totalUnidades = registros.reduce((s, r) => s + Number(r.unidades || 0), 0)

  if (loading) return <p className="text-center py-16 text-gray-400 text-sm">Cargando registros...</p>

  return (
    <>
      {/* Aviso */}
      <div className="mx-4 mt-4 mb-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700 flex-shrink-0">
        Esta fecha ya tiene <span className="font-bold">{registros.length} registros</span> guardados.
        Para corregir uno, elimínalo con el ícono de basura y vuelve a abrirlo en blanco.
      </div>

      <div className="overflow-auto flex-1">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white border-b shadow-sm">
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
            {registros.map(r => (
              <tr key={r.id} className="hover:bg-red-50 group transition-colors">
                <td className="pl-3">
                  <button
                    onClick={() => handleEliminar(r.id)}
                    disabled={deleting === r.id}
                    className="text-red-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50 p-1"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
                <td className="px-4 py-2 text-gray-800 font-medium">{r.productos?.nombre}</td>
                <td className="px-4 py-2 text-gray-400 text-xs">{r.productos?.subcategoria}</td>
                <td className="px-4 py-2 text-right text-gray-400 text-xs tabular-nums">
                  {r.costo_unitario != null ? `$${r.costo_unitario}` : '—'}
                </td>
                <td className="px-4 py-2 text-right text-gray-700 tabular-nums font-medium">
                  {Number(r.unidades).toLocaleString('es-MX')}
                </td>
                <td className="px-4 py-2 text-right text-gray-700 tabular-nums font-medium">
                  ${Number(r.monto).toLocaleString('es-MX', { maximumFractionDigits: 0 })}
                </td>
              </tr>
            ))}
          </tbody>
          {registros.length > 0 && (
            <tfoot className="border-t bg-gray-50">
              <tr>
                <td colSpan={4} className="px-4 py-2 text-xs text-gray-400 font-semibold">TOTAL</td>
                <td className="px-4 py-2 text-right font-bold text-gray-800 tabular-nums">
                  {totalUnidades.toLocaleString('es-MX')}
                </td>
                <td className="px-4 py-2 text-right font-bold text-gray-800 tabular-nums">
                  ${totalMonto.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  )
}

// ─── Vista: captura nueva ────────────────────────────────────────────────────
function VistaCaptura({ fecha, onGuardado }) {
  const [filas, setFilas]   = useState([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg]       = useState('')

  const { productos }          = useProductos()
  const { registrarVenta }     = useRegistros()

  useEffect(() => {
    if (!fecha || !productos.length) return
    setFilas(productos.map(p => ({
      producto_id:  p.id,
      nombre:       p.nombre,
      subcategoria: p.subcategoria,
      unidades:     '',
      _precio:      precioEnFecha(p.precios, fecha),
      _monto:       null,
    })))
  }, [fecha, productos])

  const handleUnidades = (id, valor) => {
    setFilas(prev => prev.map(f => {
      if (f.producto_id !== id) return f
      const u = parseInt(valor) || 0
      return {
        ...f,
        unidades: valor,
        _monto: f._precio != null && u > 0 ? Math.round(u * f._precio) : null,
      }
    }))
  }

  const handleGuardar = async () => {
    setSaving(true)
    const registros = filas
      .filter(f => f.unidades !== '' && parseInt(f.unidades) > 0)
      .map(f => ({
        producto_id:    f.producto_id,
        fecha,
        unidades:       parseInt(f.unidades),
        monto:          f._monto ?? 0,
        costo_unitario: f._precio ?? null,
      }))

    let errors = 0
    for (const r of registros) {
      const err = await registrarVenta(r)
      if (err) errors++
    }

    setSaving(false)
    if (errors === 0) {
      setMsg(`✓ ${registros.length} registros guardados`)
      setTimeout(onGuardado, 1200)
    } else {
      setMsg(`Hubo ${errors} errores al guardar`)
    }
  }

  const totalMonto    = filas.reduce((s, f) => s + (f._monto || 0), 0)
  const totalUnidades = filas.reduce((s, f) => s + (parseInt(f.unidades) || 0), 0)

  return (
    <>
      {totalUnidades > 0 && (
        <div className="px-5 pt-3 flex-shrink-0 flex gap-6 justify-end">
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Unidades</p>
            <p className="text-lg font-bold text-gray-700">{totalUnidades.toLocaleString('es-MX')}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Total</p>
            <p className="text-lg font-bold text-gray-900">
              ${totalMonto.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>
      )}

      <div className="overflow-auto flex-1">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white border-b shadow-sm">
            <tr>
              <th className="text-left px-4 py-2.5 font-semibold text-gray-500 text-xs">Producto</th>
              <th className="text-left px-4 py-2.5 font-semibold text-gray-500 text-xs">Subcategoría</th>
              <th className="text-right px-4 py-2.5 font-semibold text-gray-500 text-xs">Precio unit.</th>
              <th className="text-right px-4 py-2.5 font-semibold text-gray-500 text-xs">Unidades</th>
              <th className="text-right px-4 py-2.5 font-semibold text-gray-500 text-xs">Monto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filas.map(f => (
              <tr key={f.producto_id} className={`hover:bg-gray-50 ${f.unidades ? 'bg-green-50/40' : ''}`}>
                <td className="px-4 py-1.5 text-gray-800 font-medium">{f.nombre}</td>
                <td className="px-4 py-1.5 text-gray-400 text-xs">{f.subcategoria}</td>
                <td className="px-4 py-1.5 text-right text-xs text-gray-400 tabular-nums">
                  {f._precio != null ? `$${f._precio}` : <span className="text-gray-200">--</span>}
                </td>
                <td className="px-4 py-1.5 text-right">
                  <input
                    type="number"
                    min="0"
                    value={f.unidades}
                    placeholder="—"
                    onChange={e => handleUnidades(f.producto_id, e.target.value)}
                    className="w-20 border rounded-lg px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-gold-400"
                  />
                </td>
                <td className="px-4 py-1.5 text-right">
                  <span className={`text-sm tabular-nums font-medium ${f._monto ? 'text-gray-800' : 'text-gray-200'}`}>
                    {f._monto ? `$${f._monto.toLocaleString('es-MX')}` : '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-5 border-t flex justify-between items-center flex-shrink-0">
        {msg
          ? <p className="text-sm text-green-600 font-medium">{msg}</p>
          : <p className="text-xs text-gray-400">Solo ingresa unidades — el monto se calcula solo.</p>
        }
        <button
          onClick={handleGuardar}
          disabled={saving}
          className="px-6 py-2 bg-gold-700 text-white rounded-lg font-semibold text-sm hover:bg-gold-600 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </>
  )
}

// ─── Modal principal ─────────────────────────────────────────────────────────
export default function RegistrarDiaModal({ onClose }) {
  const [fecha, setFecha]       = useState(format(new Date(), 'yyyy-MM-dd'))
  const [yaExiste, setYaExiste] = useState(null) // null = cargando
  const { yaExisteRegistro }    = useRegistros()

  // Verificar si existe cada vez que cambia la fecha
  useEffect(() => {
    if (!fecha) return
    setYaExiste(null)
    yaExisteRegistro(new Date(fecha + 'T12:00:00')).then(setYaExiste)
  }, [fecha])

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

      {/* Contenido según si ya existe o no */}
      {yaExiste === null ? (
        <p className="text-center py-16 text-gray-400 text-sm">Verificando...</p>
      ) : yaExiste ? (
        <VistaExistente
          fecha={fecha}
          onVacia={() => setYaExiste(false)}
        />
      ) : (
        <VistaCaptura
          fecha={fecha}
          onGuardado={onClose}
        />
      )}
    </Modal>
  )
}
