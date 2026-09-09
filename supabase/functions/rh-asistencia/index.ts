import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, json, bubbleEnv, bubbleGetAll, conOrg, requirePermiso } from '../_shared/bubble.ts'

function fechaISO(d: Date) {
  return d.toISOString().slice(0, 10)
}

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
      const lunes = body.lunes
      if (!lunes) return json({ error: 'Falta lunes' }, 400)

      const lunesDate = new Date(`${lunes}T00:00:00Z`)
      const dias7 = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(lunesDate)
        d.setUTCDate(d.getUTCDate() + i)
        return fechaISO(d)
      })
      const domingo = dias7[6]

      const { bubbleUrl, bubbleToken } = bubbleEnv()
      const [empleados, areas, puestos] = await Promise.all([
        bubbleGetAll(bubbleUrl, bubbleToken, 'Empleado', conOrg()),
        bubbleGetAll(bubbleUrl, bubbleToken, 'Área', conOrg()),
        bubbleGetAll(bubbleUrl, bubbleToken, 'Puestos', conOrg()),
      ])
      const activos = empleados.filter((e: any) => e.EstatusEmpleado === 'Activo')
      const areaPorId = new Map(areas.map((a: any) => [a._id, a['NombreÁrea']]))
      const puestoPorId = new Map(puestos.map((p: any) => [p._id, p.NombrePuesto]))

      const { data: registros, error } = await admin
        .from('rh_asistencias')
        .select('empleado_bubble_id, fecha, estado')
        .gte('fecha', lunes)
        .lte('fecha', domingo)
      if (error) return json({ error: error.message }, 400)

      const registroPorClave = new Map<string, string>()
      for (const r of registros ?? []) registroPorClave.set(`${r.empleado_bubble_id}:${r.fecha}`, r.estado)

      const resumenSemana: Record<string, number> = { trabajo: 0, descanso: 0, vacaciones: 0, falta: 0, incapacidad: 0, permiso: 0 }

      const empleadosResp = activos.map((e: any) => {
        const nombre = e.NombreEmpleado || 'Sin nombre'
        const dias = dias7.map(fecha => {
          const estado = registroPorClave.get(`${e._id}:${fecha}`) ?? null
          if (estado && estado in resumenSemana) resumenSemana[estado] += 1
          return { fecha, estado }
        })

        return {
          empleadoBubbleId: e._id,
          nombre,
          area: areaPorId.get(e['Área']) ?? 'Sin área',
          puesto: puestoPorId.get(e.Puesto) ?? 'Sin puesto',
          dias,
        }
      }).sort((a, b) => a.nombre.localeCompare(b.nombre))

      return json({ empleados: empleadosResp, resumenSemana })
    }

    if (body.action === 'save') {
      const { empleadoBubbleId, empleadoNombre, fecha, estado } = body
      if (!empleadoBubbleId || !fecha) return json({ error: 'Faltan datos' }, 400)

      if (estado == null) {
        const { error } = await admin.from('rh_asistencias').delete()
          .eq('empleado_bubble_id', empleadoBubbleId).eq('fecha', fecha)
        if (error) return json({ error: error.message }, 400)
        return json({ ok: true })
      }

      const { error } = await admin.from('rh_asistencias').upsert({
        empleado_bubble_id: empleadoBubbleId,
        empleado_nombre: empleadoNombre || '',
        fecha,
        estado,
        registrado_por: user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'empleado_bubble_id,fecha' })
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    return json({ error: 'Acción no reconocida' }, 400)
  } catch (e) {
    return json({ error: e.message }, 502)
  }
})
