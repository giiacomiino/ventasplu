import { supabase } from '../../lib/supabase'
import { cachedCall, limpiarCache } from '../../lib/cache'

export const GOOD = '#0ca30c'
export const WARNING = '#fab219'
export const SERIOUS = '#ec835a'
export const CRITICAL = '#d03b3b'
export const GOLD_RAMP = ['#7a6020', '#a67e22', '#c49a2e', '#d4a737', '#dbb75c', '#e3c780', '#ebd7a3', '#f0e3bd']
export const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

export async function llamar(fn, body) {
  const key = `${fn}:${JSON.stringify(body ?? null)}`
  return cachedCall(key, async () => {
    const { data, error } = await supabase.functions.invoke(fn, body ? { body } : undefined)
    if (error) {
      const detalle = await error.context?.json?.().catch(() => null)
      throw new Error(detalle?.error || error.message)
    }
    if (data?.error) throw new Error(data.error)
    return data
  })
}

export function refrescarBI() {
  limpiarCache()
}

export function estadoPresupuesto(pct) {
  if (pct == null) return { color: GOOD, label: 'Sin datos' }
  if (pct >= 1) return { color: CRITICAL, label: 'Excedido' }
  if (pct >= 0.9) return { color: SERIOUS, label: 'Crítico' }
  if (pct >= 0.7) return { color: WARNING, label: 'Atención' }
  return { color: GOOD, label: 'Bajo control' }
}
