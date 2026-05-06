import { supabase } from '../lib/supabase'
import { format } from 'date-fns'

export function useRegistros() {

  const getRegistrosPorFecha = async (fecha) => {
    const { data } = await supabase
      .from('ventas_plu')
      .select(`id, unidades, monto, costo_unitario, fecha,
               productos (nombre, subcategoria, categoria)`)
      .eq('fecha', format(fecha, 'yyyy-MM-dd'))
      .order('created_at')
    return data || []
  }

  const registrarVenta = async (venta) => {
    const { error } = await supabase
      .from('ventas_plu')
      .upsert(venta, { onConflict: 'producto_id,fecha' })
    return error
  }

  const eliminarRegistro = async (id) => {
    const { error } = await supabase.from('ventas_plu').delete().eq('id', id)
    return error
  }

  const getDiasFaltantes = async () => {
    const { data } = await supabase.rpc('dias_faltantes')
    return data || []
  }

  const yaExisteRegistro = async (fecha) => {
    const { count } = await supabase
      .from('ventas_plu')
      .select('id', { count: 'exact', head: true })
      .eq('fecha', format(fecha, 'yyyy-MM-dd'))
    return (count || 0) > 0
  }

  return { getRegistrosPorFecha, registrarVenta, eliminarRegistro, getDiasFaltantes, yaExisteRegistro }
}
