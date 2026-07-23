import { supabase } from '../../lib/supabase'

export const GOOD = '#0ca30c'
export const WARNING = '#fab219'
export const SERIOUS = '#ec835a'
export const CRITICAL = '#d03b3b'
export const GOLD_RAMP = ['#7a6020', '#a67e22', '#c49a2e', '#d4a737', '#dbb75c', '#e3c780', '#ebd7a3', '#f0e3bd']
export const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

// Caché en memoria (dura mientras la pestaña siga abierta): evita volver a
// pedirle todo a Bubble cada vez que se navega entre páginas de BI.
const TTL = 5 * 60 * 1000 // 5 minutos
const cache = new Map()
const enVuelo = new Map()

export async function llamar(fn, body) {
  const key = `${fn}:${JSON.stringify(body ?? null)}`
  const cacheada = cache.get(key)
  if (cacheada && Date.now() - cacheada.ts < TTL) return cacheada.data

  if (enVuelo.has(key)) return enVuelo.get(key)

  const promesa = (async () => {
    const { data, error } = await supabase.functions.invoke(fn, body ? { body } : undefined)
    if (error) {
      const detalle = await error.context?.json?.().catch(() => null)
      throw new Error(detalle?.error || error.message)
    }
    if (data?.error) throw new Error(data.error)
    cache.set(key, { data, ts: Date.now() })
    return data
  })()

  enVuelo.set(key, promesa)
  try {
    return await promesa
  } finally {
    enVuelo.delete(key)
  }
}

export function refrescarBI() {
  cache.clear()
}

export function estadoPresupuesto(pct) {
  if (pct == null) return { color: GOOD, label: 'Sin datos' }
  if (pct >= 1) return { color: CRITICAL, label: 'Excedido' }
  if (pct >= 0.9) return { color: SERIOUS, label: 'Crítico' }
  if (pct >= 0.7) return { color: WARNING, label: 'Atención' }
  return { color: GOOD, label: 'Bajo control' }
}
