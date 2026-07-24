import { createContext, useContext, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const MesContext = createContext(null)

export function MesProvider({ children }) {
  const ahora = new Date()
  const [anio, setAnio] = useState(ahora.getFullYear())
  const [mes, setMes] = useState(ahora.getMonth() + 1) // 1-12

  const esMesActual = anio === ahora.getFullYear() && mes === ahora.getMonth() + 1

  function anterior() {
    if (mes === 1) { setMes(12); setAnio(a => a - 1) } else { setMes(m => m - 1) }
  }
  function siguiente() {
    if (esMesActual) return // no se permite seleccionar meses futuros
    if (mes === 12) { setMes(1); setAnio(a => a + 1) } else { setMes(m => m + 1) }
  }

  return (
    <MesContext.Provider value={{ anio, mes, esMesActual, anterior, siguiente }}>
      {children}
    </MesContext.Provider>
  )
}

export function useMesSeleccionado() {
  return useContext(MesContext)
}

export function SelectorMes() {
  const { anio, mes, esMesActual, anterior, siguiente } = useMesSeleccionado()
  const label = format(new Date(anio, mes - 1, 1), 'MMMM yyyy', { locale: es })
  return (
    <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-2 py-1.5 bg-white shadow-sm select-none">
      <button onClick={anterior} className="text-gray-400 hover:text-gold-700 transition-colors p-1">
        <ChevronLeft size={15} />
      </button>
      <span className="text-sm font-semibold text-gray-700 min-w-[110px] text-center capitalize">{label}</span>
      <button
        onClick={siguiente}
        disabled={esMesActual}
        className="text-gray-400 hover:text-gold-700 transition-colors p-1 disabled:opacity-30 disabled:hover:text-gray-400"
      >
        <ChevronRight size={15} />
      </button>
    </div>
  )
}
