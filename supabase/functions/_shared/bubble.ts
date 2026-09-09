import { createClient } from 'jsr:@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Bubble es multi-tenant: TODAS las tablas (Venta, Categorías, BudgetSnapshot,
// Inventario...) mezclan varias organizaciones. Sin este filtro se cuelan
// registros de orgs de prueba en los reportes.
export const ORG_LA_TRATTORIA = '1758754194749x770981416549010200'

export function conOrg(...constraints: unknown[]) {
  return [{ key: 'Organizacion', constraint_type: 'equals', value: ORG_LA_TRATTORIA }, ...constraints]
}

export async function bubbleGet(bubbleUrl: string, bubbleToken: string, type: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${bubbleUrl}/${encodeURIComponent(type)}?${qs}`, {
    headers: { Authorization: `Bearer ${bubbleToken}` },
  })
  if (!res.ok) throw new Error(`Bubble ${type} falló (${res.status})`)
  return res.json()
}

export async function bubbleGetAll(
  bubbleUrl: string,
  bubbleToken: string,
  type: string,
  constraints: unknown[],
  maxPages = 50,
) {
  const results: any[] = []
  let cursor = 0
  for (let page = 0; page < maxPages; page++) {
    const data = await bubbleGet(bubbleUrl, bubbleToken, type, {
      constraints: JSON.stringify(constraints),
      limit: '100',
      cursor: String(cursor),
    })
    results.push(...data.response.results)
    if (data.response.remaining <= 0) break
    cursor += 100
  }
  return results
}

// Igual que bubbleGetAll pero pagina en paralelo (por tandas) en vez de
// una página a la vez. El cursor de Bubble es un offset numérico, no un
// token opaco, así que una vez que sabemos el total (primera página +
// remaining) podemos pedir el resto de las páginas de golpe. Para
// consultas grandes (varios miles de filas) esto es varias veces más
// rápido que bubbleGetAll.
export async function bubbleGetAllFast(
  bubbleUrl: string,
  bubbleToken: string,
  type: string,
  constraints: unknown[],
  maxPages = 200,
) {
  const primera = await bubbleGet(bubbleUrl, bubbleToken, type, {
    constraints: JSON.stringify(constraints),
    limit: '100',
    cursor: '0',
  })
  const results: any[] = [...primera.response.results]
  const total = primera.response.results.length + (primera.response.remaining ?? 0)
  const totalPaginas = Math.min(Math.ceil(total / 100), maxPages)

  const TANDA = 10
  for (let inicio = 1; inicio < totalPaginas; inicio += TANDA) {
    const paginas = []
    for (let page = inicio; page < Math.min(inicio + TANDA, totalPaginas); page++) paginas.push(page)
    const datas = await Promise.all(
      paginas.map(page => bubbleGet(bubbleUrl, bubbleToken, type, {
        constraints: JSON.stringify(constraints),
        limit: '100',
        cursor: String(page * 100),
      })),
    )
    for (const d of datas) results.push(...d.response.results)
  }
  return results
}

// Bubble usa 1=lunes ... 7=domingo (ISO weekday).
export function isoWeekday(dateStr: string) {
  const d = new Date(dateStr)
  const day = d.getUTCDay() // 0=domingo ... 6=sábado
  return day === 0 ? 7 : day
}

// Verifica que quien llama tiene sesión válida y un profile en Supabase.
export async function requireProfile(req: Request) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return null

  const admin = createClient(supabaseUrl, serviceKey)
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: { user } } = await caller.auth.getUser()
  if (!user) return null

  const { data: profile } = await admin.from('profiles').select('id').eq('id', user.id).single()
  return profile ? user : null
}

// Igual que requireProfile, pero además exige que el rol del perfil esté en
// la lista permitida (ej. Business Intelligence es solo owner/admin, no rh).
export async function requireRole(req: Request, roles: string[]) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return null

  const admin = createClient(supabaseUrl, serviceKey)
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: { user } } = await caller.auth.getUser()
  if (!user) return null

  const { data: profile } = await admin.from('profiles').select('rol').eq('id', user.id).single()
  return profile && roles.includes(profile.rol) ? { ...user, rol: profile.rol } : null
}

// Control de acceso por apartado: profiles.permisos es un jsonb con un
// booleano por sección ({ pagos: true, compras: true, ... }). El owner
// siempre pasa sin importar lo que tenga marcado — es el único que puede
// asignar permisos, así que nunca debe poder bloquearse a sí mismo.
// `seccion` puede ser un string o un arreglo (basta con tener acceso a
// una) para funciones que alimentan más de una página con distinto permiso.
export async function requirePermiso(req: Request, seccion: string | string[]) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return null

  const admin = createClient(supabaseUrl, serviceKey)
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: { user } } = await caller.auth.getUser()
  if (!user) return null

  const { data: profile } = await admin.from('profiles').select('rol, permisos').eq('id', user.id).single()
  if (!profile) return null

  const permisos = profile.permisos ?? {}
  if (profile.rol !== 'owner') {
    const secciones = Array.isArray(seccion) ? seccion : [seccion]
    if (!secciones.some(s => permisos[s] === true)) return null
  }

  return { ...user, rol: profile.rol, permisos }
}

export function bubbleEnv() {
  return {
    bubbleUrl: Deno.env.get('BUBBLE_API_URL')!,
    bubbleToken: Deno.env.get('BUBBLE_API_TOKEN')!,
  }
}

// Fecha de pago = ingreso + días de crédito del proveedor, recorrida 2 días
// atrás si cae en sábado o domingo. Usado tanto para leer facturas de
// Bubble (pagos-cxp) como para calcular la de una factura nueva nativa
// (crear-factura) — misma fórmula en los dos lados.
export function ajustarFinDeSemana(fecha: Date): Date {
  const dia = fecha.getUTCDay() // 0=domingo ... 6=sábado
  if (dia === 6 || dia === 0) {
    const ajustada = new Date(fecha)
    ajustada.setUTCDate(ajustada.getUTCDate() - 2)
    return ajustada
  }
  return fecha
}

export function calcularFechaPago(fechaIngresoISO: string, diasCredito: number | null): string | null {
  if (diasCredito == null || !fechaIngresoISO) return null
  const base = new Date(fechaIngresoISO)
  base.setUTCDate(base.getUTCDate() + diasCredito)
  return ajustarFinDeSemana(base).toISOString()
}

// Empleados nativos (registrados desde /rh en la tabla empleados_nativos,
// no viven en Bubble) se disfrazan con la misma forma que un registro de
// Empleado de Bubble, para que resumen-rh/rh-rotacion/rh-asistencia no
// necesiten tratarlos distinto. Área/Puesto llevan el nombre en texto
// plano en vez de un _id de Bubble — cualquier lookup tipo
// `areaPorId.get(e['Área'])` no lo va a encontrar, así que en cada lugar
// que se usa hace falta el fallback `?? e['Área']` / `?? e.Puesto` para
// usar el texto tal cual como nombre. El sueldo va aparte en
// `_sueldoNativo` porque no hay un Puesto de Bubble del que sacarlo.
export function mapearEmpleadosNativos(nativos: any[]) {
  return nativos.map((e: any) => ({
    _id: `nativo:${e.id}`,
    NombreEmpleado: e.nombre,
    EstatusEmpleado: e.estatus,
    FechaIngreso: e.fecha_ingreso,
    FechaSalida: e.fecha_salida,
    'Área': e.area,
    Puesto: e.puesto,
    _sueldoNativo: Number(e.sueldo_diario) || 0,
  }))
}
