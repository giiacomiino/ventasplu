import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, json, requirePermiso } from '../_shared/bubble.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await requirePermiso(req, 'rh')
  if (!user) return json({ error: 'No autorizado' }, 401)

  const body = await req.json().catch(() => ({}))
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  try {
    if (body.action === 'list') {
      const anio = new Date().getUTCFullYear()
      const inicioAnio = `${anio}-01-01`

      const { data: pagosAnio, error: errorAnio } = await admin
        .from('rh_pagos_nomina')
        .select('monto')
        .gte('fecha_pago', inicioAnio)
      if (errorAnio) return json({ error: errorAnio.message }, 400)

      const { data: pagos, error: errorPagos } = await admin
        .from('rh_pagos_nomina')
        .select('fecha_pago, monto')
        .order('fecha_pago', { ascending: false })
        .limit(20)
      if (errorPagos) return json({ error: errorPagos.message }, 400)

      const nominaYtd = (pagosAnio ?? []).reduce((s, p) => s + Number(p.monto), 0)
      const ultimoPago = pagos && pagos.length > 0
        ? { fecha: pagos[0].fecha_pago, monto: Number(pagos[0].monto) }
        : null

      return json({
        nominaYtd,
        ultimoPago,
        pagos: (pagos ?? []).map(p => ({ fecha_pago: p.fecha_pago, monto: Number(p.monto) })),
      })
    }

    if (body.action === 'create') {
      const { fechaPago, monto } = body
      if (!fechaPago || monto == null) return json({ error: 'Faltan datos' }, 400)
      const { error } = await admin.from('rh_pagos_nomina').insert({
        fecha_pago: fechaPago,
        monto: Number(monto),
        registrado_por: user.id,
      })
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    return json({ error: 'Acción no reconocida' }, 400)
  } catch (e) {
    return json({ error: e.message }, 502)
  }
})
