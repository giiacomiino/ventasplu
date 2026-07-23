import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'No autorizado' }, 401)

  const admin = createClient(supabaseUrl, serviceKey)
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: { user } } = await caller.auth.getUser()
  if (!user) return json({ error: 'No autorizado' }, 401)

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('rol')
    .eq('id', user.id)
    .single()

  if (callerProfile?.rol !== 'owner') {
    return json({ error: 'Solo el owner puede administrar usuarios' }, 403)
  }

  const body = await req.json().catch(() => ({}))

  if (body.action === 'list') {
    const { data: profiles, error: perr } = await admin
      .from('profiles')
      .select('*')
      .order('created_at')
    if (perr) return json({ error: perr.message }, 400)

    const { data: usersPage, error: uerr } = await admin.auth.admin.listUsers({ perPage: 1000 })
    if (uerr) return json({ error: uerr.message }, 400)

    const usuarios = (profiles ?? []).map((p) => ({
      ...p,
      last_sign_in_at: usersPage.users.find((u) => u.id === p.id)?.last_sign_in_at ?? null,
    }))
    return json({ usuarios })
  }

  if (body.action === 'create') {
    const { email, password, nombre, rol } = body
    if (!email || !password || !rol) return json({ error: 'Faltan datos' }, 400)

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (error) return json({ error: error.message }, 400)

    const { error: perr } = await admin
      .from('profiles')
      .insert({ id: data.user.id, email, nombre, rol })
    if (perr) {
      await admin.auth.admin.deleteUser(data.user.id)
      return json({ error: perr.message }, 400)
    }
    return json({ ok: true })
  }

  if (body.action === 'update') {
    const { id, nombre, rol } = body
    if (!id) return json({ error: 'Falta id' }, 400)
    const { error } = await admin.from('profiles').update({ nombre, rol }).eq('id', id)
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true })
  }

  if (body.action === 'delete') {
    const { id } = body
    if (!id) return json({ error: 'Falta id' }, 400)
    if (id === user.id) return json({ error: 'No puedes borrarte a ti mismo' }, 400)
    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true })
  }

  return json({ error: 'Acción no reconocida' }, 400)
})
