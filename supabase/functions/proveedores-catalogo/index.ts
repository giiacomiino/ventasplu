import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, json, requirePermiso } from '../_shared/bubble.ts'

const CATEGORIA_ALMACEN = 'INSUMOS'

// Catálogo de proveedores nativo de VURA BI, para el formulario de
// Compras. Quien tenga marcado "Solo proveedores de insumos"
// (permisos.compras_solo_insumos) solo ve proveedores de insumos — es
// todo lo que puede registrar; el resto ve el catálogo completo. No se
// expone días de crédito — es un dato interno solo para calcular fecha
// de pago.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await requirePermiso(req, ['pagos', 'compras'])
  if (!user) return json({ error: 'No autorizado' }, 401)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)

    let query = admin.from('proveedores').select('nombre, categoria, tipo_producto').order('nombre')
    if (user.rol !== 'owner' && user.permisos?.compras_solo_insumos === true) query = query.eq('categoria', CATEGORIA_ALMACEN)

    const { data, error } = await query
    if (error) return json({ error: error.message }, 400)

    return json({
      proveedores: (data ?? []).map(p => ({ nombre: p.nombre, categoria: p.categoria, tipoProducto: p.tipo_producto })),
    })
  } catch (e) {
    return json({ error: e.message }, 502)
  }
})
