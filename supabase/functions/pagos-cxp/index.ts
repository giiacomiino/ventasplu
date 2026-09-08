import { corsHeaders, json, bubbleEnv, bubbleGet, bubbleGetAllFast, conOrg, requirePermiso, calcularFechaPago } from '../_shared/bubble.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const PROVEEDOR_EXCLUIDO = 'fonda la trattoria'

function mismoDia(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  return a.slice(0, 10) === b.slice(0, 10)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await requirePermiso(req, 'pagos')
  if (!user) return json({ error: 'No autorizado' }, 401)

  const { bubbleUrl, bubbleToken } = bubbleEnv()

  try {
    const hoy = new Date()
    const hace30dias = new Date(hoy.getTime() - 30 * 24 * 60 * 60 * 1000)

    const [proveedoresData, bancosData, pendientesCrudas, pagadasCrudas] = await Promise.all([
      bubbleGet(bubbleUrl, bubbleToken, 'Proveedor', { constraints: JSON.stringify(conOrg()), limit: '200' }),
      // "Bancos" es un dato secundario (solo para mostrar el nombre de la
      // cuenta de pago) — si falla por permisos no debe tumbar toda la
      // página de Pagos, solo se pierde ese detalle puntual.
      bubbleGet(bubbleUrl, bubbleToken, 'Bancos', { constraints: JSON.stringify(conOrg()), limit: '100' })
        .catch(() => ({ response: { results: [] } })),
      bubbleGetAllFast(bubbleUrl, bubbleToken, 'Inventario', conOrg(
        { key: 'Pagada?', constraint_type: 'equals', value: false },
        { key: 'borrada?', constraint_type: 'equals', value: false },
      )),
      bubbleGetAllFast(bubbleUrl, bubbleToken, 'Inventario', conOrg(
        { key: 'Pagada?', constraint_type: 'equals', value: true },
        { key: 'borrada?', constraint_type: 'equals', value: false },
        { key: 'FechaDePago', constraint_type: 'greater than', value: hace30dias.toISOString() },
      )),
    ])

    // Mapa de proveedor (por nombre, case-insensitive) -> días de crédito.
    // Los nombres de campo son suposiciones basadas en las etiquetas que se
    // ven en la UI de Bubble; si no calzan, diasCredito sale null y esa
    // factura queda marcada como "sin dato" en vez de romper el cálculo.
    const diasCreditoPorProveedor = new Map<string, number | null>()
    for (const p of proveedoresData.response.results) {
      const nombre = (p.RazonSocial || p['Razón Social'] || p.Nombre || '').trim().toLowerCase()
      if (!nombre) continue
      const dias = p['Días de crédito'] ?? p.DiasDeCredito ?? p['Dias de credito'] ?? null
      diasCreditoPorProveedor.set(nombre, typeof dias === 'number' ? dias : null)
    }

    // "Cuenta de pago" en Inventario es una referencia al tipo Bancos, no
    // texto — hay que resolver el id contra este mapa para sacar el nombre.
    // El campo de nombre real del tipo Bancos no está confirmado, se prueban
    // las variantes más probables.
    const nombrePorBancoId = new Map<string, string>()
    for (const b of bancosData.response.results) {
      const nombre = b.BancoNombre || b.Nombre || null
      if (nombre) nombrePorBancoId.set(b._id, nombre)
    }

    function procesarFactura(f: any) {
      const nombreProveedor = f.Prooveedor || 'Sin proveedor'
      // Preferimos los días de crédito guardados en la factura misma (el
      // valor real al momento de registrarla); si no están, caemos en los
      // días de crédito actuales del proveedor.
      const diasCreditoFactura = f['Dias de Credito RProv']
      const diasCredito = typeof diasCreditoFactura === 'number'
        ? diasCreditoFactura
        : diasCreditoPorProveedor.get(nombreProveedor.trim().toLowerCase()) ?? null
      const fechaPagoCalculada = calcularFechaPago(f.FechaDeIngreso, diasCredito)
      const fechaPagoVura = f.FechaDePago || null

      return {
        id: f._id,
        remision: f.Remision,
        proveedor: nombreProveedor,
        categoria: f['Categoría'] || 'Sin categoría',
        tipoProducto: f.TipoDeProducto || f['Tipo de Producto'] || f.Producto || null,
        monto: f.MontoSinIVA || 0,
        descripcion: f.Descripcion || '',
        fechaIngreso: f.FechaDeIngreso,
        fechaPagoVura,
        fechaPagoCalculada,
        calculoDisponible: diasCredito != null,
        diasCredito,
        coincide: diasCredito != null ? mismoDia(fechaPagoCalculada, fechaPagoVura) : null,
        pagada: f['Pagada?'] === true,
        // Campos "de auditoría" — nombres de campo sin confirmar contra el
        // esquema real de Bubble. Si no calzan salen null y la UI lo marca
        // como "no disponible" en vez de mostrar un dato falso.
        fechaRegistro: f['Created Date'] || null,
        registradaPor: f['Creator'] || f['Created By'] || null,
        cuentaPago: (f['Cuenta de pago'] && nombrePorBancoId.get(f['Cuenta de pago'])) || null,
        pagadaPor: f.PagadaPor || f['Pagada Por'] || null,
        fuente: 'bubble' as const,
      }
    }

    const pendientesBubble = pendientesCrudas
      .filter((f: any) => f['borrada?'] !== true)
      .filter((f: any) => (f.Prooveedor || '').trim().toLowerCase() !== PROVEEDOR_EXCLUIDO)
      .map(procesarFactura)

    const pagadasBubble = pagadasCrudas
      .filter((f: any) => f['borrada?'] !== true)
      .filter((f: any) => (f.Prooveedor || '').trim().toLowerCase() !== PROVEEDOR_EXCLUIDO)
      .map(procesarFactura)

    // ── Facturas nativas de VURA BI (Supabase) — el inicio de la migración.
    // Se registran y se marcan pagadas aquí mismo, sin tocar Bubble; se
    // fusionan con las de Bubble para que la vista sea una sola.
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)

    const [{ data: facturasNativas }, { data: perfiles }] = await Promise.all([
      admin.from('facturas').select('*').order('fecha_ingreso', { ascending: false }),
      admin.from('profiles').select('id, nombre, email'),
    ])

    const nombrePorPerfilId = new Map((perfiles ?? []).map((p: any) => [p.id, p.nombre || p.email]))

    function procesarFacturaNativa(f: any) {
      return {
        id: f.id,
        remision: f.remision,
        proveedor: f.proveedor,
        categoria: f.categoria,
        tipoProducto: f.tipo_producto,
        monto: Number(f.monto_sin_iva) || 0,
        descripcion: f.descripcion || '',
        fechaIngreso: f.fecha_ingreso,
        fechaPagoVura: null,
        fechaPagoCalculada: f.fecha_pago_calculada,
        calculoDisponible: f.dias_credito != null,
        diasCredito: f.dias_credito,
        coincide: null,
        pagada: f.pagada,
        fechaRegistro: f.created_at,
        registradaPor: nombrePorPerfilId.get(f.registrada_por) || null,
        cuentaPago: f.cuenta_pago,
        pagadaPor: nombrePorPerfilId.get(f.pagada_por) || null,
        fuente: 'supabase' as const,
      }
    }

    const nativas = (facturasNativas ?? []).map(procesarFacturaNativa)

    const pendientes = [...pendientesBubble, ...nativas.filter(f => !f.pagada)]
    const pagadas = [...pagadasBubble, ...nativas.filter(f => f.pagada)]
      .sort((a, b) => (b.fechaPagoVura || '').localeCompare(a.fechaPagoVura || ''))

    // Usamos la fecha calculada cuando está disponible (es la que queremos
    // migrar); si no hay días de crédito para ese proveedor, caemos en la
    // que ya trae Bubble para no dejar la factura sin fecha.
    const fechaEfectiva = (f: ReturnType<typeof procesarFactura>) => f.fechaPagoCalculada || f.fechaPagoVura

    const en10dias = new Date(hoy.getTime() + 10 * 24 * 60 * 60 * 1000)

    let totalPendiente = 0
    let totalVencido = 0
    let facturasVencidas = 0
    const proximas = { monto: 0, facturas: 0 }
    const resto = { monto: 0, facturas: 0 }
    const saldoPorProveedor = new Map<string, { monto: number; facturas: number }>()
    const discrepancias: typeof pendientes = []

    for (const f of pendientes) {
      totalPendiente += f.monto
      const fecha = fechaEfectiva(f)
      const fechaDate = fecha ? new Date(fecha) : null

      if (fechaDate && fechaDate < hoy) {
        totalVencido += f.monto
        facturasVencidas += 1
      } else if (fechaDate && fechaDate <= en10dias) {
        proximas.monto += f.monto
        proximas.facturas += 1
      } else {
        resto.monto += f.monto
        resto.facturas += 1
      }

      const acc = saldoPorProveedor.get(f.proveedor) ?? { monto: 0, facturas: 0 }
      acc.monto += f.monto
      acc.facturas += 1
      saldoPorProveedor.set(f.proveedor, acc)

      if (f.calculoDisponible && !f.coincide) discrepancias.push(f)
    }

    // Calendario: 5 días atrás + hoy + 9 días adelante (15 barras), cada una
    // partida en Pagado (verde) vs Falta de pagar (rojo) según la fecha
    // efectiva de pago — igual que la gráfica de Pagos en VURA. Lo vencido
    // con más de 5 días de atraso no entra día por día, se agrupa aparte
    // (si no, esa cola larga aplasta la escala de las barras recientes).
    const todas = [...pendientes, ...pagadas]
    const cincoDiasAtras = new Date(hoy)
    cincoDiasAtras.setUTCDate(cincoDiasAtras.getUTCDate() - 5)

    let vencidasAntiguasMonto = 0
    let vencidasAntiguasFacturas = 0
    for (const f of pendientes) {
      const fecha = fechaEfectiva(f)
      if (fecha && new Date(fecha) < cincoDiasAtras) {
        vencidasAntiguasMonto += f.monto
        vencidasAntiguasFacturas += 1
      }
    }

    const calendario = []
    for (let i = -5; i < 10; i++) {
      const dia = new Date(hoy)
      dia.setUTCDate(dia.getUTCDate() + i)
      const diaStr = dia.toISOString().slice(0, 10)
      const delDia = todas.filter(f => (fechaEfectiva(f) || '').slice(0, 10) === diaStr)
      const montoPagado = delDia.filter(f => f.pagada).reduce((s, f) => s + f.monto, 0)
      const montoPendiente = delDia.filter(f => !f.pagada).reduce((s, f) => s + f.monto, 0)
      calendario.push({ fecha: diaStr, montoPagado, montoPendiente, facturas: delDia.length })
    }

    const saldoPorProveedorArr = [...saldoPorProveedor.entries()]
      .map(([proveedor, v]) => ({ proveedor, ...v }))
      .sort((a, b) => b.monto - a.monto)

    return json({
      totalPendiente,
      totalFacturas: pendientes.length,
      totalVencido,
      facturasVencidas,
      proximas,
      resto,
      calendario,
      vencidasAntiguas: { monto: vencidasAntiguasMonto, facturas: vencidasAntiguasFacturas },
      saldoPorProveedor: saldoPorProveedorArr,
      pendientes: pendientes.sort((a, b) => (fechaEfectiva(a) || '').localeCompare(fechaEfectiva(b) || '')),
      pagadas,
      discrepancias,
      proveedoresConDiasCredito: diasCreditoPorProveedor.size,
      cuentasBancarias: [...nombrePorBancoId.values()].sort(),
      proveedoresCatalogo: proveedoresData.response.results
        .map((p: any) => p.RazonSocial || p['Razón Social'] || p.Nombre || null)
        .filter(Boolean)
        .sort(),
    })
  } catch (e) {
    return json({ error: e.message }, 502)
  }
})
