import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, json, requirePermiso } from '../_shared/bubble.ts'

// Administra el mapeo forma de pago -> cuenta bancaria + días de
// dispersión. 'list' regresa todos los códigos que alguna vez aparecieron
// en un reporte de venta, fusionados con su configuración (si ya existe) —
// así se ve en la UI incluso el código que todavía no se ha mapeado.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await requirePermiso(req, 'pagos')
  if (!user) return json({ error: 'No autorizado' }, 401)

  const body = await req.json().catch(() => ({}))
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  try {
    if (body.action === 'list') {
      const [{ data: pagos, error: errorPagos }, { data: config, error: errorConfig }] = await Promise.all([
        admin.from('reportes_venta_diaria_pagos').select('codigo, descripcion'),
        admin.from('formas_pago_config').select('*'),
      ])
      if (errorPagos) return json({ error: errorPagos.message }, 400)
      if (errorConfig) return json({ error: errorConfig.message }, 400)

      const configPorCodigo = new Map((config ?? []).map(c => [c.codigo, c]))
      const descripcionPorCodigo = new Map()
      for (const p of pagos ?? []) if (!descripcionPorCodigo.has(p.codigo)) descripcionPorCodigo.set(p.codigo, p.descripcion)

      const codigos = new Set([...descripcionPorCodigo.keys(), ...configPorCodigo.keys()])
      const lista = [...codigos].map(codigo => ({
        codigo,
        descripcion: configPorCodigo.get(codigo)?.descripcion || descripcionPorCodigo.get(codigo) || '',
        cuenta_banco: configPorCodigo.get(codigo)?.cuenta_banco ?? null,
        dias_dispersion: configPorCodigo.get(codigo)?.dias_dispersion ?? null,
      })).sort((a, b) => a.codigo.localeCompare(b.codigo))

      return json({ formasPago: lista })
    }

    if (body.action === 'save') {
      const { codigo, descripcion, cuenta_banco, dias_dispersion } = body
      if (!codigo) return json({ error: 'Falta código' }, 400)
      const { error } = await admin.from('formas_pago_config').upsert({
        codigo,
        descripcion: descripcion || null,
        cuenta_banco: cuenta_banco || null,
        dias_dispersion: dias_dispersion ?? null,
        updated_at: new Date().toISOString(),
      })
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    return json({ error: 'Acción no reconocida' }, 400)
  } catch (e) {
    return json({ error: e.message }, 502)
  }
})
