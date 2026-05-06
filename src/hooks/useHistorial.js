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

      const { data: rows, error: err } = await supabase
        .from('ventas_plu')
        .select('fecha, unidades, monto, producto_id, productos(nombre, subcategoria, categoria)')
        .gte('fecha', format(inicio, 'yyyy-MM-dd'))
        .lte('fecha', format(hoy, 'yyyy-MM-dd'))

      if (err) { setError(err.message); setLoading(false); return }

      const months = Array.from({ length: numMeses }, (_, i) =>
        format(subMonths(hoy, numMeses - 1 - i), 'yyyy-MM')
      )

      // tree: category → subcategoria → { monthly, productos }
      const tree = {}

      for (const r of rows) {
        const { categoria, subcategoria, nombre } = r.productos
        const ym = r.fecha.slice(0, 7)

        if (!tree[categoria]) tree[categoria] = {}
        if (!tree[categoria][subcategoria]) {
          tree[categoria][subcategoria] = { monthly: {}, productos: {} }
        }
        const subNode = tree[categoria][subcategoria]

        if (!subNode.monthly[ym]) subNode.monthly[ym] = { monto: 0, unidades: 0 }
        subNode.monthly[ym].monto    += Number(r.monto    || 0)
        subNode.monthly[ym].unidades += Number(r.unidades || 0)

        if (!subNode.productos[r.producto_id]) {
          subNode.productos[r.producto_id] = { id: r.producto_id, nombre, monthly: {} }
        }
        const pNode = subNode.productos[r.producto_id]
        if (!pNode.monthly[ym]) pNode.monthly[ym] = { monto: 0, unidades: 0 }
        pNode.monthly[ym].monto    += Number(r.monto    || 0)
        pNode.monthly[ym].unidades += Number(r.unidades || 0)
      }

      setData({ months, tree })
      setLoading(false)
    }

    load()
  }, [numMeses])

  return { data, loading, error }
}
