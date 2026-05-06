import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addMonths, subMonths } from 'date-fns'
import { toMonthLabel } from '../../utils/dateHelpers'

export default function MonthPicker({ value, onChange }) {
  return (
    <div className="flex items-center gap-2 border rounded-lg px-3 py-2 bg-white shadow-sm select-none">
      <button
        onClick={() => onChange(subMonths(value, 1))}
        className="text-gray-400 hover:text-gold-700 transition-colors p-0.5"
      >
        <ChevronLeft size={16} />
      </button>
      <span className="text-sm font-semibold text-gray-700 min-w-[64px] text-center">
        {toMonthLabel(value)}
      </span>
      <button
        onClick={() => onChange(addMonths(value, 1))}
        className="text-gray-400 hover:text-gold-700 transition-colors p-0.5"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  )
}
