import { useState } from 'react'
import { useVentasPlu } from '../hooks/useVentasPlu'
import MonthPicker from '../components/ui/MonthPicker'
import CategoryCard from '../components/dashboard/CategoryCard'
import RegistrarDiaModal   from '../components/modals/RegistrarDiaModal'
import ListaProductosModal from '../components/modals/ListaProductosModal'
import VerErroresModal     from '../components/modals/VerErroresModal'
import AuditarDiaModal     from '../components/modals/AuditarDiaModal'
import AnalisisModal       from '../components/modals/AnalisisModal'
import { Plus, List, AlertCircle, Eye, BarChart2 } from 'lucide-react'
import { toLabel } from '../utils/dateHelpers'

const MODAL = {
  REGISTRAR: 'registrar',
  PRODUCTOS: 'productos',
  ERRORES:   'errores',
  AUDITAR:   'auditar',
  ANALISIS:  'analisis',
}

export default function VentasPlu() {
  const [mes, setMes]     = useState(new Date())
  const [modal, setModal] = useState(null)

  const { bebidas, alimentos, bTotales, aTotales, loading, error } = useVentasPlu(mes)

  const btnClass    = "flex items-center gap-2 px-4 py-2 bg-[#7a6020] text-white rounded-lg text-sm font-semibold hover:bg-[#5c4718] transition-colors shadow-sm"
  const btnAltClass = "flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg text-sm font-semibold hover:bg-gray-50 hover:border-gray-300 transition-colors shadow-sm"

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* Título */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Ventas por PLU</h1>
          <p className="text-sm text-gray-400 mt-1">
            Evaluación del desempeño por producto y categoría para optimizar la rentabilidad del menú y sus precios.
          </p>
        </div>

        {/* Barra de acciones */}
        <div className="flex flex-wrap items-center gap-3 mb-3">
          {/* Acciones primarias */}
          <button onClick={() => setModal(MODAL.REGISTRAR)} className={btnClass}>
            <Plus size={15} /> Registrar día
          </button>
          <button onClick={() => setModal(MODAL.PRODUCTOS)} className={btnClass}>
            <List size={15} /> Productos y precios
          </button>
          <button onClick={() => setModal(MODAL.ERRORES)} className={btnClass}>
            <AlertCircle size={15} /> Ver errores
          </button>
          <button onClick={() => setModal(MODAL.AUDITAR)} className={btnClass}>
            <Eye size={15} /> Auditar por día
          </button>

          {/* Separador visual */}
          <div className="w-px h-6 bg-gray-200" />

          {/* Análisis */}
          <button onClick={() => setModal(MODAL.ANALISIS)} className={btnAltClass}>
            <BarChart2 size={15} className="text-gold-600" /> Análisis detallado
          </button>

          <div className="ml-auto">
            <MonthPicker value={mes} onChange={setMes} />
          </div>
        </div>

        {/* Info fecha */}
        <p className="text-xs text-gray-400 mb-6">
          Información hasta: {toLabel(new Date())}
        </p>

        {/* Error */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
            ⚠ Error al cargar datos: {error}
          </div>
        )}

        {/* Dashboard */}
        {loading ? (
          <div className="flex items-center justify-center py-24 text-gray-300">
            <div className="text-center">
              <div className="text-4xl mb-3">⟳</div>
              <p className="text-sm">Cargando datos...</p>
            </div>
          </div>
        ) : (
          <div className="flex gap-6">
            <CategoryCard titulo="Bebidas"   data={bebidas}   totales={bTotales} />
            <CategoryCard titulo="Alimentos" data={alimentos} totales={aTotales} />
          </div>
        )}
      </div>

      {/* Modales */}
      {modal === MODAL.REGISTRAR && <RegistrarDiaModal   onClose={() => setModal(null)} />}
      {modal === MODAL.PRODUCTOS && <ListaProductosModal onClose={() => setModal(null)} />}
      {modal === MODAL.ERRORES   && <VerErroresModal     onClose={() => setModal(null)} />}
      {modal === MODAL.AUDITAR   && <AuditarDiaModal     onClose={() => setModal(null)} />}
      {modal === MODAL.ANALISIS  && <AnalisisModal       onClose={() => setModal(null)} />}
    </div>
  )
}
