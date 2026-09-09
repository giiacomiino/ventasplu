import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, json, bubbleEnv, bubbleGetAll, conOrg, requireRole } from '../_shared/bubble.ts'

// Siembra/actualiza el catálogo nativo `proveedores` con los días de
// crédito que ya existen en Bubble — de ahí en adelante esa tabla es la
// fuente para el formulario de Compras. Nunca escribe en Bubble, solo lee.
// Solo toca días de crédito: categoría y tipo de producto se aprenden
// desde el propio formulario de registro, no se pisan aquí.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await requireRole(req, ['owner'])
  if (!user) return json({ error: 'No autorizado' }, 401)

  try {
    const { bubbleUrl, bubbleToken } = bubbleEnv()
    const proveedoresBubble = await bubbleGetAll(bubbleUrl, bubbleToken, 'Proveedor', conOrg())

    const filas = proveedoresBubble
      .map((p: any) => {
        const nombre = (p.RazonSocial || p['Razón Social'] || p.Nombre || '').trim()
        const dias = p['Días de crédito'] ?? p.DiasDeCredito ?? p['Dias de credito'] ?? null
        return nombre ? { nombre, dias_credito: typeof dias === 'number' ? dias : null } : null
      })
      .filter(Boolean) as { nombre: string; dias_credito: number | null }[]

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)

    let actualizados = 0
    for (const fila of filas) {
      const { data: existente } = await admin.from('proveedores').select('id').eq('nombre', fila.nombre).maybeSingle()
      if (existente) {
        await admin.from('proveedores').update({ dias_credito: fila.dias_credito, updated_at: new Date().toISOString() }).eq('id', existente.id)
      } else {
        await admin.from('proveedores').insert({ nombre: fila.nombre, dias_credito: fila.dias_credito })
      }
      actualizados += 1
    }

    return json({ sincronizados: actualizados })
  } catch (e) {
    return json({ error: e.message }, 502)
  }
})
