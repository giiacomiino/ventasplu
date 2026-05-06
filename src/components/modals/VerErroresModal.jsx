import { useState, useEffect } from 'react'
import { useRegistros } from '../../hooks/useRegistros'
import Modal from '../ui/Modal'

export default function VerErroresModal({ onClose }) {
  const [errores, setErrores] = useState([])
  const [loading, setLoading] = useState(true)
  const { getDiasFaltantes }  = useRegistros()

  useEffect(() => {
    getDiasFaltantes().then(data => {
      setErrores(data || [])
      setLoading(false)
    })
  }, [])

  return (
    <Modal onClose={onClose} maxWidth="max-w-xl">
      <div className="flex justify-between items-center p-6 border-b flex-shrink-0">
        <h2 className="text-lg font-bold text-gold-700 text-center flex-1 leading-tight">
          Lista de productos que falta<br />algún día por llenar
        </h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none ml-4">×</button>
      </div>

      <div className="overflow-auto flex-1">
        {loading ? (
          <p className="text-center py-10 text-gray-400">Calculando días faltantes...</p>
        ) : errores.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-3xl mb-2">✓</p>
            <p className="text-green-600 font-semibold">Sin días faltantes este mes</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white border-b">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs">Subcategoría</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs">Producto</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs">Registros</th>
                <th className="text-right px-4 py-3 font-semibold text-gold-600 text-xs">Faltantes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {errores.map((e, i) => (
                <tr key={i} className="hover:bg-red-50 transition-colors">
                  <td className="px-4 py-2.5 text-gold-600 font-medium">{e.subcategoria}</td>
                  <td className="px-4 py-2.5 text-gray-800">{e.producto}</td>
                  <td className="px-4 py-2.5 text-right text-gray-400">{e.registros}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-red-500">{e.faltantes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  )
}
