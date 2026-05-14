import { useState } from 'react'
import * as XLSX from 'xlsx'
import Modal from '../ui/Modal'
import { supabase } from '../../lib/supabase'
import { format, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { Download } from 'lucide-react'

const today = format(new Date(), 'yyyy-MM-dd')
const firstOfMonth = format(startOfMonth(new Date()), 'yyyy-MM-dd')

export default function DescargarExcelModal({ onClose }) {
  const [desde,      setDesde]      = useState(firstOfMonth)
  const [hasta,      setHasta]      = useState(today)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)

  const handleDescargar = async () => {
    if (!desde || !hasta || desde > hasta) {
      setError('La fecha de inicio debe ser anterior a la fecha de fin.')
      return
    }
    setError(null)
    setLoading(true)

    // Paginate to bypass Supabase 1000-row limit
    const PAGE = 999
    let rows = []
    for (let from = 0; ; from += PAGE) {
      const { data, error: err } = await supabase
        .from('ventas_plu')
        .select('fecha, unidades, monto, costo_unitario, productos(nombre, subcategoria, categoria)')
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .order('fecha', { ascending: true })
        .order('productos(categoria)', { ascending: true })
        .range(from, from + PAGE - 1)
      if (err) { setError(err.message); setLoading(false); return }
      if (!data?.length) break
      rows = rows.concat(data)
      if (data.length < PAGE) break
    }

    if (!rows.length) {
      setError('No hay registros para el período seleccionado.')
      setLoading(false)
      return
    }

    // Build worksheet rows
    const wsData = [
      ['Fecha', 'Categoría', 'Subcategoría', 'Producto', 'Unidades', 'Precio Unit.', 'Monto'],
      ...rows.map(r => [
        r.fecha,
        r.productos?.categoria    ?? '',
        r.productos?.subcategoria ?? '',
        r.productos?.nombre       ?? '',
        Number(r.unidades),
        r.costo_unitario != null ? Number(r.costo_unitario) : '',
        Number(r.monto),
      ]),
    ]

    const ws = XLSX.utils.aoa_to_sheet(wsData)

    // Column widths
    ws['!cols'] = [
      { wch: 12 }, // Fecha
      { wch: 12 }, // Categoría
      { wch: 16 }, // Subcategoría
      { wch: 26 }, // Producto
      { wch: 10 }, // Unidades
      { wch: 13 }, // Precio Unit.
      { wch: 12 }, // Monto
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Ventas PLU')

    const fileName = `ventas_plu_${desde}_${hasta}.xlsx`
    XLSX.writeFile(wb, fileName)

    setLoading(false)
    onClose()
  }

  const desdeLabel = desde ? format(new Date(desde + 'T12:00'), "d 'de' MMMM yyyy", { locale: es }) : '—'
  const hastaLabel = hasta ? format(new Date(hasta + 'T12:00'), "d 'de' MMMM yyyy", { locale: es }) : '—'

  return (
    <Modal onClose={onClose} maxWidth="max-w-sm">
      <div className="flex justify-between items-center px-6 py-5 border-b">
        <h2 className="text-lg font-bold text-gray-800">Descargar Excel</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
      </div>

      <div className="p-6 space-y-5">
        {/* Date range */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Desde
            </label>
            <input
              type="date"
              value={desde}
              onChange={e => setDesde(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Hasta
            </label>
            <input
              type="date"
              value={hasta}
              onChange={e => setHasta(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
            />
          </div>
        </div>

        {/* Preview label */}
        {desde && hasta && desde <= hasta && (
          <p className="text-xs text-gray-400 text-center capitalize">
            {desdeLabel} — {hastaLabel}
          </p>
        )}

        {/* Error */}
        {error && (
          <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {/* Columns preview */}
        <div className="bg-gray-50 rounded-xl border border-gray-100 px-4 py-3">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Columnas incluidas</p>
          <div className="flex flex-wrap gap-1.5">
            {['Fecha', 'Categoría', 'Subcategoría', 'Producto', 'Unidades', 'Precio Unit.', 'Monto'].map(c => (
              <span key={c} className="text-[10px] font-semibold bg-white border border-gray-200 text-gray-500 px-2 py-0.5 rounded">
                {c}
              </span>
            ))}
          </div>
        </div>

        {/* Download button */}
        <button
          onClick={handleDescargar}
          disabled={loading || !desde || !hasta || desde > hasta}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#7a6020] text-white rounded-lg font-semibold text-sm hover:bg-[#5c4718] disabled:opacity-40 transition-colors"
        >
          <Download size={15} />
          {loading ? 'Descargando...' : 'Descargar'}
        </button>
      </div>
    </Modal>
  )
}
