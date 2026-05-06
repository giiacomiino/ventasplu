import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export const toDateStr    = (d) => format(d, 'yyyy-MM-dd')
export const toLabel      = (d) => format(d, "EEE, dd MMM yy", { locale: es })
export const toMonthLabel = (d) => format(d, "MMM-yy", { locale: es })
