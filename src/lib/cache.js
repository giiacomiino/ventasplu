// Caché en memoria compartida (dura mientras la pestaña siga abierta): evita
// volver a pedir lo mismo cada vez que se navega entre páginas. Cualquier
// mutación que cambie datos ya cacheados debe llamar a limpiarCache().
const TTL_DEFAULT = 5 * 60 * 1000 // 5 minutos
const cache = new Map()
const enVuelo = new Map()

export async function cachedCall(key, fetchFn, ttlMs = TTL_DEFAULT) {
  const cacheada = cache.get(key)
  if (cacheada && Date.now() - cacheada.ts < ttlMs) return cacheada.data

  if (enVuelo.has(key)) return enVuelo.get(key)

  const promesa = (async () => {
    const data = await fetchFn()
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

export function limpiarCache() {
  cache.clear()
}
