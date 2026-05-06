import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { startOfMonth, format, subMonths } from 'date-fns'

export function useHistorial(numMeses = 6) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const hoy    = new Date()
      const inicio = startOfMonth(subMonths(hoy, numMeses - 1))

      // Paginate to work around Supabase's server-side 1000-row limit
      const PAGE = 999
      let rows = []
      for (let from = 0; ; from += PAGE) {
        const { data, error: err } = await supabase
          .from('ventas_plu')
          .select('fecha, unidades, monto, producto_id, productos(nombre, subcategoria, categoria)')
          .gte('fecha', format(inicio, 'yyyy-MM-dd'))
          .lte('fecha', format(hoy, 'yyyy-MM-dd'))
          .order('fecha', { ascending: true })
          .range(from, from + PAGE - 1)
        if (err) { setError(err.message); setLoading(false); return }
        if (!data?.length) break
        rows = rows.concat(data)
        if (data.length < PAGE) break
      }

      const months = Array.from({ length: numMeses }, (_, i) =>
        format(subMonths(hoy, numMeses - 1 - i), 'yyyy-MM')
      )

      const currentYm = months.at(-1)

      // tree: category → subcategoria → { monthly, productos }
      const tree = {}

      // For missing-day detection (current month only)
      const activeDates  = new Set()  // all dates in current month with ANY data
      const productDates = {}         // productId → Set<string> of dates with data
      const productMeta  = {}         // productId → { nombre, subcategoria, categoria }

      for (const r of rows) {
        // Skip rows with no product join match
        if (!r.productos) continue
        const { categoria, subcategoria, nombre } = r.productos
        if (!categoria || !subcategoria) continue

        const ym = r.fecha.slice(0, 7)

        if (!tree[categoria]) tree[categoria] = {}
        if (!tree[categoria][subcategoria]) {
          tree[categoria][subcategoria] = { monthly: {}, daily: {}, productos: {} }
        }
        const subNode = tree[categoria][subcategoria]

        if (!subNode.monthly[ym]) subNode.monthly[ym] = { monto: 0, unidades: 0 }
        subNode.monthly[ym].monto    += Number(r.monto    || 0)
        subNode.monthly[ym].unidades += Number(r.unidades || 0)

        if (!subNode.daily[r.fecha]) subNode.daily[r.fecha] = { monto: 0, unidades: 0 }
        subNode.daily[r.fecha].monto    += Number(r.monto    || 0)
        subNode.daily[r.fecha].unidades += Number(r.unidades || 0)

        if (!subNode.productos[r.producto_id]) {
          subNode.productos[r.producto_id] = { id: r.producto_id, nombre, monthly: {}, daily: {} }
        }
        const pNode = subNode.productos[r.producto_id]
        if (!pNode.monthly[ym]) pNode.monthly[ym] = { monto: 0, unidades: 0 }
        pNode.monthly[ym].monto    += Number(r.monto    || 0)
        pNode.monthly[ym].unidades += Number(r.unidades || 0)

        if (!pNode.daily[r.fecha]) pNode.daily[r.fecha] = { monto: 0, unidades: 0 }
        pNode.daily[r.fecha].monto    += Number(r.monto    || 0)
        pNode.daily[r.fecha].unidades += Number(r.unidades || 0)

        // Track per-product dates for current month only
        if (ym === currentYm) {
          activeDates.add(r.fecha)
          if (!productDates[r.producto_id]) productDates[r.producto_id] = new Set()
          productDates[r.producto_id].add(r.fecha)
          productMeta[r.producto_id] = { nombre, subcategoria, categoria }
        }
      }

      // Missing days: days where SOME product has data but a specific product doesn't
      // (using activeDates avoids false-positives on restaurant-closed days)
      const sortedActive = [...activeDates].sort()
      const missingData = []
      for (const [id, meta] of Object.entries(productMeta)) {
        const dates   = productDates[id]
        const missing = sortedActive.filter(d => !dates.has(d))
        if (missing.length > 0) {
          missingData.push({ id, ...meta, missingDates: missing })
        }
      }
      missingData.sort((a, b) => b.missingDates.length - a.missingDates.length)

      const maxDayInCurrentMonth = activeDates.size > 0
        ? Math.max(...[...activeDates].map(d => parseInt(d.slice(8, 10))))
        : 0

      setData({ months, tree, missingData, maxDayInCurrentMonth })
      setLoading(false)
    }

    load()
  }, [numMeses])

  return { data, loading, error }
}
