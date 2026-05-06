import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useProductos() {
  const [productos, setProductos] = useState([])
  const [loading,   setLoading]   = useState(true)

  const fetchProductos = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('productos')
      .select(`id, nombre, subcategoria, categoria, activo, created_at,
               precios (precio, vigente_desde)`)
      .eq('activo', true)
      .order('categoria')
      .order('subcategoria')
      .order('nombre')
    setProductos(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchProductos() }, [fetchProductos])

  const precioVigente = (producto) => {
    if (!producto.precios || producto.precios.length === 0) return null
    return [...producto.precios].sort(
      (a, b) => new Date(b.vigente_desde) - new Date(a.vigente_desde)
    )[0]
  }

  const actualizarPrecio = async (productoId, nuevoPrecio, vigenteDesde) => {
    const { error } = await supabase.from('precios').insert({
      producto_id:   productoId,
      precio:        Number(nuevoPrecio),
      vigente_desde: vigenteDesde
    })
    if (!error) fetchProductos()
    return error
  }

  const agregarProducto = async ({ nombre, subcategoria, categoria }) => {
    const { error } = await supabase.from('productos').insert({ nombre, subcategoria, categoria })
    if (!error) fetchProductos()
    return error
  }

  return { productos, loading, precioVigente, actualizarPrecio, agregarProducto, refetch: fetchProductos }
}
