import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, json, requirePermiso } from '../_shared/bubble.ts'

// Para cada pago capturado en un reporte de venta diaria, proyecta a qué
// cuenta y en qué fecha debería caer el depósito (fecha del reporte +
// días de dispersión configurados). Los códigos sin cuenta asignada en
// formas_pago_config salen agrupados aparte como "sin configurar" — nunca
// se asume una cuenta o un plazo que no se haya capturado a mano.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await requirePermiso(req, 'pagos')
  if (!user) return json({ error: 'No autorizado' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  try {
    const [{ data: config, error: errorConfig }, { data: reportes, error: errorReportes }] = await Promise.all([
      admin.from('formas_pago_config').select('*'),
      admin
        .from('reportes_venta_diaria')
        .select('id, fecha, reportes_venta_diaria_pagos(codigo, descripcion, monto)')
        .order('fecha', { ascending: false })
        .limit(60),
    ])
    if (errorConfig) return json({ error: errorConfig.message }, 400)
    if (errorReportes) return json({ error: errorReportes.message }, 400)

    const configPorCodigo = new Map((config ?? []).map(c => [c.codigo, c]))
    const hoy = new Date().toISOString().slice(0, 10)

    const porCuenta = new Map<string, { pendiente: number; depositado: number }>()
    let sinConfigurar = 0

    for (const reporte of reportes ?? []) {
      for (const pago of reporte.reportes_venta_diaria_pagos ?? []) {
        const cfg = configPorCodigo.get(pago.codigo)
        if (!cfg?.cuenta_banco) {
          sinConfigurar += pago.monto || 0
          continue
        }
        const fechaDeposito = new Date(reporte.fecha)
        fechaDeposito.setUTCDate(fechaDeposito.getUTCDate() + (cfg.dias_dispersion ?? 0))
        const fechaDepositoStr = fechaDeposito.toISOString().slice(0, 10)

        const acc = porCuenta.get(cfg.cuenta_banco) ?? { pendiente: 0, depositado: 0 }
        if (fechaDepositoStr <= hoy) acc.depositado += pago.monto || 0
        else acc.pendiente += pago.monto || 0
        porCuenta.set(cfg.cuenta_banco, acc)
      }
    }

    const cuentas = [...porCuenta.entries()]
      .map(([cuenta, v]) => ({ cuenta, ...v, total: v.pendiente + v.depositado }))
      .sort((a, b) => b.total - a.total)

    return json({ cuentas, sinConfigurar })
  } catch (e) {
    return json({ error: e.message }, 502)
  }
})
