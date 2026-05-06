import Badge from '../ui/Badge'
import { formatMoney, formatUnits } from '../../utils/formatters'

export default function CategoryCard({ titulo, data, totales }) {
  return (
    <div className="flex-1 min-w-0">
      <h2 className="text-center text-xl font-bold text-gold-700 mb-4">
        {titulo}
      </h2>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-400 font-medium mb-1">$$$</p>
          <p className="font-bold text-gray-800 text-sm">{formatMoney(totales?.monto)}</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-400 font-medium mb-1">###</p>
          <p className="font-bold text-gray-800 text-sm">{formatUnits(totales?.unidades)}</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-400 font-medium mb-1">MoM%</p>
          <Badge value={totales?.mom} />
        </div>
      </div>

      {/* Tabla subcategorías */}
      <div className="border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-white">
              <th className="text-left px-4 py-2.5 font-semibold text-gray-500 text-xs">Subcategoría</th>
              <th className="text-right px-4 py-2.5 font-semibold text-gray-500 text-xs">Unidades</th>
              <th className="text-right px-4 py-2.5 font-semibold text-gray-500 text-xs">Monto</th>
              <th className="text-right px-4 py-2.5 font-semibold text-gray-500 text-xs">MoM%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(!data || data.length === 0) ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-300 text-sm">
                  Sin datos para este mes
                </td>
              </tr>
            ) : data.map((row) => (
              <tr key={row.subcategoria} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-2.5 text-gold-600 font-medium">{row.subcategoria}</td>
                <td className="px-4 py-2.5 text-right text-gray-700">{formatUnits(row.unidades)}</td>
                <td className="px-4 py-2.5 text-right text-gray-700">{formatMoney(row.monto)}</td>
                <td className="px-4 py-2.5 text-right">
                  <Badge value={row.mom_pct != null ? Number(row.mom_pct) : null} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
