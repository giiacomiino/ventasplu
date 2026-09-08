import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, json, requirePermiso } from '../_shared/bubble.ts'

// Guarda el reporte de venta diaria ya parseado y revisado en el navegador
// (drag-and-drop del PDF "Ventas por Empresa"). Upsert por fecha: si se
// vuelve a subir el mismo día (corrección), reemplaza categorías, zonas y
// pagos por completo para no dejar filas viejas mezcladas con las nuevas.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await requirePermiso(req, 'ventas')
  if (!user) return json({ error: 'No autorizado' }, 401)

  const body = await req.json().catch(() => ({}))
  const { fecha, totales, categorias, zonas, pagos, archivoNombre } = body

  if (!fecha || !totales) return json({ error: 'Faltan datos del reporte' }, 400)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)

    const { data: reporte, error: errorReporte } = await admin
      .from('reportes_venta_diaria')
      .upsert(
        { fecha, ...totales, archivo_nombre: archivoNombre || null, registrado_por: user.id },
        { onConflict: 'fecha' },
      )
      .select()
      .single()

    if (errorReporte) return json({ error: errorReporte.message }, 400)

    await admin.from('reportes_venta_diaria_categorias').delete().eq('reporte_id', reporte.id)
    await admin.from('reportes_venta_diaria_zonas').delete().eq('reporte_id', reporte.id)
    await admin.from('reportes_venta_diaria_pagos').delete().eq('reporte_id', reporte.id)

    if (Array.isArray(categorias) && categorias.length) {
      const { error } = await admin
        .from('reportes_venta_diaria_categorias')
        .insert(categorias.map((c: Record<string, unknown>) => ({ ...c, reporte_id: reporte.id })))
      if (error) return json({ error: error.message }, 400)
    }

    if (Array.isArray(zonas) && zonas.length) {
      const { error } = await admin
        .from('reportes_venta_diaria_zonas')
        .insert(zonas.map((z: Record<string, unknown>) => ({ ...z, reporte_id: reporte.id })))
      if (error) return json({ error: error.message }, 400)
    }

    if (Array.isArray(pagos) && pagos.length) {
      const { error } = await admin
        .from('reportes_venta_diaria_pagos')
        .insert(pagos.map((p: Record<string, unknown>) => ({ ...p, reporte_id: reporte.id })))
      if (error) return json({ error: error.message }, 400)
    }

    return json({ reporte })
  } catch (e) {
    return json({ error: e.message }, 502)
  }
})
