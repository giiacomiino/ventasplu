import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, json, bubbleEnv, bubbleGetAll, conOrg, requireRole } from '../_shared/bubble.ts'

// Siembra/actualiza el catálogo nativo `proveedores` desde Bubble. Nunca
// escribe en Bubble, solo lee. Días de crédito siempre se actualiza desde
// aquí (Bubble es la fuente). Categoría y tipo de producto solo se llenan
// si el registro nativo todavía no los tiene — una vez que se "aprenden"
// desde una factura real capturada aquí, eso manda sobre lo que diga
// Bubble.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await requireRole(req, ['owner'])
  if (!user) return json({ error: 'No autorizado' }, 401)

  try {
    const { bubbleUrl, bubbleToken } = bubbleEnv()
    const proveedoresBubble = await bubbleGetAll(bubbleUrl, bubbleToken, 'Proveedor', conOrg())

    const filas = proveedoresBubble
      .map((p: any) => {
        const nombre = (p.NombreComercial || p['Razon Social'] || p['Razón Social'] || '').trim()
        const dias = p.DiasCredito ?? null
        const categoria = (p['Categoría'] || p.Categoria || '').trim() || null
        const tipoProducto = (p.TipoDeProducto || '').trim() || null
        return nombre
          ? { nombre, dias_credito: typeof dias === 'number' ? dias : null, categoria, tipo_producto: tipoProducto }
          : null
      })
      .filter(Boolean) as { nombre: string; dias_credito: number | null; categoria: string | null; tipo_producto: string | null }[]

    // Diagnóstico: si Bubble no trae nada, o trae registros pero ninguno
    // matchea un campo de nombre conocido, esto muestra por qué — sin
    // esto, "0 sincronizados" no dice si el problema es la consulta a
    // Bubble o el nombre de los campos.
    if (proveedoresBubble.length === 0) {
      return json({ sincronizados: 0, diagnostico: 'Bubble no regresó ningún registro de Proveedor con el filtro de organización actual.' })
    }
    if (filas.length === 0) {
      return json({
        sincronizados: 0,
        diagnostico: `Bubble regresó ${proveedoresBubble.length} proveedores, pero ninguno tiene un campo de nombre reconocido.`,
        camposDeEjemplo: Object.keys(proveedoresBubble[0]),
        primerRegistro: proveedoresBubble[0],
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)

    let actualizados = 0
    for (const fila of filas) {
      const { data: existente } = await admin.from('proveedores').select('id, categoria, tipo_producto').eq('nombre', fila.nombre).maybeSingle()
      if (existente) {
        await admin.from('proveedores').update({
          dias_credito: fila.dias_credito,
          categoria: existente.categoria ?? fila.categoria,
          tipo_producto: existente.tipo_producto ?? fila.tipo_producto,
          updated_at: new Date().toISOString(),
        }).eq('id', existente.id)
      } else {
        await admin.from('proveedores').insert({
          nombre: fila.nombre,
          dias_credito: fila.dias_credito,
          categoria: fila.categoria,
          tipo_producto: fila.tipo_producto,
        })
      }
      actualizados += 1
    }

    return json({ sincronizados: actualizados })
  } catch (e) {
    return json({ error: e.message }, 502)
  }
})
