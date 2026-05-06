import { useState } from 'react'
import { useRegistros } from '../../hooks/useRegistros'
import Modal from '../ui/Modal'
import { formatMoney, formatUnits } from '../../utils/formatters'
import { format } from 'date-fns'
import { Trash2 } from 'lucide-react'

export default function AuditarDiaModal({ onClose }) {
  const [fecha, setFecha]         = useState(format(new Date(), 'yyyy-MM-dd'))
  const [registros, setRegistros] = useState([])
  const [loading, setLoading]     = useState(false)
  const [buscado, setBuscado]     = useState(false)
  const { getRegistrosPorFecha, eliminarRegistro } = useRegistros()

  const buscar = async () => {
    setLoading(true)
    const data = await getRegistrosPorFecha(new Date(fecha + 'T12:00:00'))
    setRegistros(data)
    setLoading(false)
    setBuscado(true)
  }

  const handleEliminar = async (id) => {
    if (!window.confirm('¿Eliminar este registro? Esta acción no se puede deshacer.')) return
    await eliminarRegistro(id)
    setRegistros(prev => prev.filter(r => r.id !== id))
  }

  const totalMonto    = registros.reduce((s, r) => s + Number(r.monto    || 0), 0)
  const totalUnidades = registros.reduce((s, r) => s + Number(r.unidades || 0), 0)

  return (
    <Modal onClose={onClose} maxWidth="max-w-2xl">
      <div className="flex justify-between items-center p-6 border-b flex-shrink-0">
        <h2 className="text-xl font-bold text-gray-800">Auditar por día</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
      </div>

      {/* Selector fecha */}
      <div className="p-6 border-b flex gap-3 items-end flex-shrink-0">
        <div>
          <label className="block text-xs text-gray-500 font-semibold mb-1 uppercase tracking-wide">Fecha</label>
          <input type="date" value={fecha}
            onChange={e => { setFecha(e.target.value); setBuscado(false) }}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
          />
        </div>
        <button onClick={buscar}
          className="px-5 py-2 bg-gold-700 text-white rounded-lg text-sm font-semibold hover:bg-gold-600 transition-colors">
          Buscar
        </button>
        {buscado && registros.length > 0 && (
          <div className="ml-auto text-sm text-gray-500">
            <span className="font-semibold text-gray-800">{registros.length}</span> registros ·{' '}
            <span className="font-semibold text-gray-800">{formatMoney(totalMonto)}</span>
          </div>
        )}
      </div>

      {/* Tabla */}
      <div className="overflow-auto flex-1">
        {loading ? (
          <p className="text-center py-10 text-gray-400">Cargando...</p>
        ) : !buscado ? (
          <p className="text-center py-10 text-gray-300">Selecciona una fecha y presiona Buscar</p>
        ) : registros.length === 0 ? (
          <p className="text-center py-10 text-gray-400">No hay registros para esta fecha</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white border-b">
              <tr>
                <th className="w-10"></th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs">Producto</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs">Subcategoría</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs">Unidades</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {registros.map(r => (
                <tr key={r.id} className="hover:bg-red-50 group transition-colors">
                  <td className="pl-4">
                    <button onClick={() => handleEliminar(r.id)}
                      className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity p-1">
                      <Trash2 size={14} />
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-gray-800 font-medium">{r.productos?.nombre}</td>
                  <td className="px-4 py-2.5 text-gray-500">{r.productos?.subcategoria}</td>
                  <td className="px-4 py-2.5 text-right text-gold-600 font-semibold">{formatUnits(r.unidades)}</td>
                  <td className="px-4 py-2.5 text-right text-gold-600 font-semibold">{formatMoney(r.monto)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t bg-gray-50">
              <tr>
                <td colSpan={3} className="px-4 py-2.5 text-xs text-gray-400 font-semibold">TOTAL</td>
                <td className="px-4 py-2.5 text-right font-bold text-gray-800">{formatUnits(totalUnidades)}</td>
                <td className="px-4 py-2.5 text-right font-bold text-gray-800">{formatMoney(totalMonto)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </Modal>
  )
}
