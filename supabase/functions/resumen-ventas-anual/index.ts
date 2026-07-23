import { corsHeaders, json, bubbleEnv, bubbleGetAll, conOrg, requireProfile } from '../_shared/bubble.ts'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await requireProfile(req)
  if (!user) return json({ error: 'No autorizado' }, 401)

  const { bubbleUrl, bubbleToken } = bubbleEnv()

  try {
    const ventas = await bubbleGetAll(bubbleUrl, bubbleToken, 'Venta', conOrg())

    // promedio de VentaNeta por mes calendario (YYYY-MM)
    const porMes = new Map<string, { suma: number; n: number }>()
    for (const v of ventas) {
      const d = new Date(v.DiaDeVenta)
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
      const actual = porMes.get(key) ?? { suma: 0, n: 0 }
      actual.suma += v.VentaNeta || 0
      actual.n += 1
      porMes.set(key, actual)
    }
    const promedioPorMes = new Map(
      [...porMes.entries()].map(([k, v]) => [k, v.suma / v.n]),
    )

    // últimos 12 meses calendario (rolling, terminando en el mes más reciente con datos)
    const clavesOrdenadas = [...porMes.keys()].sort()
    const ultimaClave = clavesOrdenadas[clavesOrdenadas.length - 1]
    const [yUlt, mUlt] = ultimaClave.split('-').map(Number)

    const serie = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(yUlt, mUlt - 1 - i, 1))
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
      const dAnt = new Date(Date.UTC(d.getUTCFullYear() - 1, d.getUTCMonth(), 1))
      const keyAnt = `${dAnt.getUTCFullYear()}-${String(dAnt.getUTCMonth() + 1).padStart(2, '0')}`
      serie.push({
        mes: `${MESES[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`,
        actual: promedioPorMes.get(key) ?? null,
        anterior: promedioPorMes.get(keyAnt) ?? null,
      })
    }

    const valoresActual = serie.map(s => s.actual).filter((v): v is number => v != null)
    const promedioGeneral = valoresActual.length
      ? valoresActual.reduce((a, b) => a + b, 0) / valoresActual.length
      : null

    return json({ serie, promedioGeneral })
  } catch (e) {
    return json({ error: e.message }, 502)
  }
})
