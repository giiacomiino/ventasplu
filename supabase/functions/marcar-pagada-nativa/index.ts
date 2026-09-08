import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, json, requirePermiso } from '../_shared/bubble.ts'

// Marca como pagada una factura NATIVA de VURA BI (tabla facturas en
// Supabase). Solo aplica a lo registrado aquí — las facturas que vienen de
// Bubble se siguen marcando pagadas en VURA hasta el corte completo.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await requirePermiso(req, 'pagos')
  if (!user) return json({ error: 'No autorizado' }, 401)

  const { id, fechaPago, cuentaPago } = await req.json().catch(() => ({}))
  if (!id || !fechaPago || !cuentaPago) {
    return json({ error: 'Faltan campos obligatorios (factura, fecha de pago, cuenta)' }, 400)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  const { data, error } = await admin
    .from('facturas')
    .update({
      pagada: true,
      fecha_pago_real: fechaPago,
      cuenta_pago: cuentaPago,
      pagada_por: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('pagada', false)
    .select()
    .single()

  if (error) return json({ error: error.message }, 400)
  if (!data) return json({ error: 'Factura no encontrada o ya estaba pagada' }, 404)
  return json({ factura: data })
})
