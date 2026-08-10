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

// Marca cuándo fue la última vez que este usuario cargó la app (no
// cuándo inició sesión — la sesión se queda viva días/semanas, así que
// "last login" casi nunca refleja uso real). Pasa por Edge Function con
// service role, en vez de dejar que el cliente actualice su propia fila
// de "profiles" directo: así el usuario solo puede tocar su propio
// last_seen, nunca su rol ni el de nadie más.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'No autorizado' }, 401)

  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user } } = await caller.auth.getUser()
  if (!user) return json({ error: 'No autorizado' }, 401)

  const admin = createClient(supabaseUrl, serviceKey)
  const { error } = await admin
    .from('profiles')
    .update({ last_seen: new Date().toISOString() })
    .eq('id', user.id)

  if (error) return json({ error: error.message }, 400)
  return json({ ok: true })
})
