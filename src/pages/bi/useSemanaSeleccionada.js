import { useState } from 'react'
import { startOfWeek, addWeeks, format } from 'date-fns'
import { es } from 'date-fns/locale'

// Semana ISO: lunes a domingo. Se guarda el lunes como referencia; todo lo
// demás (domingo, etiquetas, límites de consulta) se deriva de ahí.
export function useSemanaSeleccionada() {
  const hoy = new Date()
  const lunesActual = startOfWeek(hoy, { weekStartsOn: 1 })
  const [lunes, setLunes] = useState(lunesActual)

  const domingo = new Date(lunes)
  domingo.setDate(domingo.getDate() + 6)

  const esSemanaActual = lunes.getTime() === lunesActual.getTime()

  function anterior() {
    setLunes(l => addWeeks(l, -1))
  }
  function siguiente() {
    if (esSemanaActual) return
    setLunes(l => addWeeks(l, 1))
  }

  const lunesStr = format(lunes, 'yyyy-MM-dd')
  const label = lunes.getMonth() === domingo.getMonth()
    ? `${format(lunes, 'd')} – ${format(domingo, 'd MMM yyyy', { locale: es })}`
    : `${format(lunes, 'd MMM', { locale: es })} – ${format(domingo, 'd MMM yyyy', { locale: es })}`

  return { lunes, domingo, lunesStr, esSemanaActual, anterior, siguiente, label }
}
