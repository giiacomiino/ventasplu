export const formatMoney = (n) =>
  n == null ? '--' : `$${Number(n).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`

export const formatUnits = (n) =>
  n == null ? '--' : Number(n).toLocaleString('es-MX')

export const formatMoM = (n) => {
  if (n == null) return null
  const sign = n > 0 ? '+' : ''
  return `${sign}${Number(n).toFixed(1)}%`
}

export const momColor = (n) => {
  if (n == null) return 'text-gray-400'
  return n >= 0
    ? 'text-green-600 bg-green-50'
    : 'text-red-500 bg-red-50'
}
