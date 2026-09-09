import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, json, requirePermiso } from '../_shared/bubble.ts'

// Catálogo nativo completo de proveedores (a diferencia de
// proveedores-catalogo, que es solo el insumo para el searchbox de
// Compras y a propósito no expone días de crédito). Esta sí es para
// verlos: nombre, categoría, tipo de producto y días de crédito de cada
// uno.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await requirePermiso(req, 'proveedores')
  if (!user) return json({ error: 'No autorizado' }, 401)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)

    const { data, error } = await admin
      .from('proveedores')
      .select('nombre, categoria, tipo_producto, dias_credito, updated_at')
      .order('nombre')
    if (error) return json({ error: error.message }, 400)

    return json({
      proveedores: (data ?? []).map(p => ({
        nombre: p.nombre,
        categoria: p.categoria,
        tipoProducto: p.tipo_producto,
        diasCredito: p.dias_credito,
        actualizado: p.updated_at,
      })),
    })
  } catch (e) {
    return json({ error: e.message }, 502)
  }
})
