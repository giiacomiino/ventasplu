import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, json, requirePermiso, calcularFechaPago } from '../_shared/bubble.ts'

const CATEGORIA_ALMACEN = 'INSUMOS'

// Registra una factura nueva NATIVA de VURA BI (no toca Bubble). Es el
// arranque de la migración de Compras/Pagos: de aquí en adelante, lo nuevo
// vive en Supabase; lo histórico se queda en Bubble como solo-lectura.
//
// Cualquiera con acceso a Pagos o Compras puede registrar aquí. Quien tenga
// marcado "solo insumos" (típicamente Almacén, que solo recibe materia
// prima) solo puede hacerlo con proveedores de categoría INSUMOS. RH
// también puede registrar aquí, pero únicamente pagos de nómina (proveedor
// "Fonda La Trattoria", categoría NOMINA fija) — es como se registra el
// pago de nómina desde /rh, reforzado server-side para que no dependa de
// que el frontend mande los valores correctos. El proveedor debe existir
// ya en el catálogo nativo `proveedores` — no se crean proveedores nuevos
// desde aquí (el frontend solo deja elegir del catálogo, para evitar
// errores de dedo; esto lo refuerza server-side).
const PROVEEDOR_NOMINA = 'fonda la trattoria'
const CATEGORIA_NOMINA = 'NOMINA'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await requirePermiso(req, ['pagos', 'compras', 'rh'])
  if (!user) return json({ error: 'No autorizado' }, 401)

  const body = await req.json().catch(() => ({}))
  const { proveedor, categoria, tipoProducto, montoSinIva, descripcion, fechaIngreso } = body

  if (!proveedor || !categoria || !montoSinIva || !fechaIngreso) {
    return json({ error: 'Faltan campos obligatorios (proveedor, categoría, monto, fecha de ingreso)' }, 400)
  }

  const soloInsumos = user.rol !== 'owner' && user.permisos?.compras_solo_insumos === true
  if (soloInsumos && String(categoria).toUpperCase() !== CATEGORIA_ALMACEN) {
    return json({ error: 'Solo puedes registrar facturas de proveedores de insumos' }, 403)
  }

  const soloNomina = user.rol !== 'owner' && !user.permisos?.pagos && !user.permisos?.compras
  if (soloNomina && (String(categoria).toUpperCase() !== CATEGORIA_NOMINA || String(proveedor).trim().toLowerCase() !== PROVEEDOR_NOMINA)) {
    return json({ error: 'Con este permiso solo puedes registrar pagos de nómina' }, 403)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)

    const nombreProveedor = String(proveedor).trim()
    const { data: proveedorExistente } = await admin
      .from('proveedores')
      .select('*')
      .eq('nombre', nombreProveedor)
      .maybeSingle()

    if (!proveedorExistente) {
      return json({ error: 'Ese proveedor no existe en el catálogo — elígelo de la lista' }, 400)
    }

    if (soloInsumos && (proveedorExistente.categoria || '').toUpperCase() !== CATEGORIA_ALMACEN) {
      return json({ error: 'Ese proveedor no está registrado como de insumos' }, 403)
    }

    // El catálogo "aprende": actualiza categoría y tipo de producto con lo
    // capturado ahora, para que la próxima factura de este proveedor ya
    // salga sugerida. Días de crédito no se toca aquí — viene de Bubble.
    const { data: proveedorGuardado, error: errorProveedor } = await admin
      .from('proveedores')
      .update({
        categoria: soloInsumos ? CATEGORIA_ALMACEN : categoria,
        tipo_producto: tipoProducto || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', proveedorExistente.id)
      .select()
      .single()

    if (errorProveedor) return json({ error: errorProveedor.message }, 400)

    const diasCredito = typeof proveedorGuardado.dias_credito === 'number' ? proveedorGuardado.dias_credito : null
    const fechaPagoCalculada = calcularFechaPago(new Date(fechaIngreso).toISOString(), diasCredito)

    const { data: remisionData, error: errorRemision } = await admin.rpc('siguiente_remision')
    if (errorRemision) return json({ error: errorRemision.message }, 400)

    const { data, error } = await admin.from('facturas').insert({
      remision: String(remisionData),
      proveedor: nombreProveedor,
      categoria: soloInsumos ? CATEGORIA_ALMACEN : categoria,
      tipo_producto: tipoProducto || null,
      monto_sin_iva: montoSinIva,
      descripcion: descripcion || null,
      fecha_ingreso: fechaIngreso,
      dias_credito: diasCredito,
      fecha_pago_calculada: fechaPagoCalculada ? fechaPagoCalculada.slice(0, 10) : null,
      registrada_por: user.id,
    }).select().single()

    if (error) return json({ error: error.message }, 400)
    return json({ factura: data })
  } catch (e) {
    return json({ error: e.message }, 502)
  }
})
