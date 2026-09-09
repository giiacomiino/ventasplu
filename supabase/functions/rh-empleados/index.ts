import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, json, bubbleEnv, bubbleGetAll, conOrg, requirePermiso } from '../_shared/bubble.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await requirePermiso(req, 'rh')
  if (!user) return json({ error: 'No autorizado' }, 401)

  const body = await req.json().catch(() => ({}))
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  try {
    if (body.action === 'catalogos') {
      const { bubbleUrl, bubbleToken } = bubbleEnv()
      const [areasB, puestosB] = await Promise.all([
        bubbleGetAll(bubbleUrl, bubbleToken, 'Área', conOrg()),
        bubbleGetAll(bubbleUrl, bubbleToken, 'Puestos', conOrg()),
      ])

      const { data: nativos, error } = await admin.from('empleados_nativos').select('area, puesto, sueldo_diario')
      if (error) return json({ error: error.message }, 400)

      const areasBubble = areasB.map((a: any) => a['NombreÁrea']).filter(Boolean)
      const areasNativas = (nativos ?? []).map((n: any) => n.area).filter(Boolean)
      const areas = [...new Set([...areasBubble, ...areasNativas])].sort((a, b) => a.localeCompare(b))

      const sueldosPorPuesto = new Map<string, number[]>()
      for (const p of puestosB) {
        const nombre = p.NombrePuesto
        const sueldo = Number(p.SuedoDiario) || 0
        if (!nombre) continue
        if (!sueldosPorPuesto.has(nombre)) sueldosPorPuesto.set(nombre, [])
        sueldosPorPuesto.get(nombre)!.push(sueldo)
      }
      for (const n of nativos ?? []) {
        if (!n.puesto) continue
        if (!sueldosPorPuesto.has(n.puesto)) sueldosPorPuesto.set(n.puesto, [])
        sueldosPorPuesto.get(n.puesto)!.push(Number(n.sueldo_diario) || 0)
      }
      const puestos = [...sueldosPorPuesto.entries()]
        .map(([nombre, sueldos]) => ({ nombre, sueldoDiario: sueldos.reduce((a, b) => a + b, 0) / sueldos.length }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre))

      return json({ areas, puestos })
    }

    if (body.action === 'crear') {
      const { nombre, area, puesto, sueldoDiario, fechaIngreso, nss } = body
      if (!nombre || !area || !puesto || sueldoDiario == null || !fechaIngreso) {
        return json({ error: 'Faltan datos' }, 400)
      }
      const { data, error } = await admin.from('empleados_nativos').insert({
        nombre,
        area,
        puesto,
        sueldo_diario: Number(sueldoDiario),
        fecha_ingreso: fechaIngreso,
        nss: nss || null,
        estatus: 'Activo',
        registrado_por: user.id,
      }).select('numero_colaborador').single()
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true, numeroColaborador: data.numero_colaborador })
    }

    return json({ error: 'Acción no reconocida' }, 400)
  } catch (e) {
    return json({ error: e.message }, 502)
  }
})
