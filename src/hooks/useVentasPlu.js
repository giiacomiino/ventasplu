import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useVentasPlu(selectedMonth) {
  const [bebidas,   setBebidas]   = useState([])
  const [alimentos, setAlimentos] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      const year  = selectedMonth.getFullYear()
      const month = selectedMonth.getMonth() + 1

      const [bRes, aRes] = await Promise.all([
        supabase.rpc('ventas_por_subcategoria', { p_categoria: 'Bebidas',   p_year: year, p_month: month }),
        supabase.rpc('ventas_por_subcategoria', { p_categoria: 'Alimentos', p_year: year, p_month: month }),
      ])

      if (bRes.error) setError(bRes.error.message)
      if (aRes.error) setError(aRes.error.message)

      setBebidas(bRes.data   || [])
      setAlimentos(aRes.data || [])
      setLoading(false)
    }
    fetchData()
  }, [selectedMonth])

  const calcTotales = (data) => {
    if (!data || data.length === 0) return { monto: 0, unidades: 0, mom: null }
    const monto    = data.reduce((s, r) => s + Number(r.monto    || 0), 0)
    const unidades = data.reduce((s, r) => s + Number(r.unidades || 0), 0)
    // Derive each subcategory's previous-month monto from its mom_pct, then
    // compute the true category-level MoM% from the aggregated totals.
    const conMom = data.filter(r => r.mom_pct != null)
    let mom = null
    if (conMom.length > 0) {
      const totalPrev = conMom.reduce((s, r) => {
        const prev = Number(r.monto) / (1 + Number(r.mom_pct) / 100)
        return s + prev
      }, 0)
      const totalCurr = conMom.reduce((s, r) => s + Number(r.monto), 0)
      if (totalPrev > 0) mom = Math.round((totalCurr - totalPrev) / totalPrev * 1000) / 10
    }
    return { monto, unidades, mom }
  }

  return {
    bebidas,
    alimentos,
    bTotales: calcTotales(bebidas),
    aTotales: calcTotales(alimentos),
    loading,
    error
  }
}
