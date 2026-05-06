import { momColor, formatMoM } from '../../utils/formatters'

export default function Badge({ value }) {
  if (value == null) return <span className="text-gray-300 text-sm">--</span>
  return (
    <span className={`inline-block px-2 py-0.5 rounded-md text-sm font-semibold ${momColor(value)}`}>
      {formatMoM(value)}
    </span>
  )
}
