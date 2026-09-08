import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, json, isoWeekday, requirePermiso } from '../_shared/bubble.ts'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const CAMPOS_VALIDOS = ['cancelaciones', 'cortesias_monto']

// Página dedicada a UNA sola métrica (cancelaciones o cortesías): serie
// diaria del año, comportamiento por día de la semana y top de días — para
// que al picarle a ese bloque en el overview solo se hable de eso, nada
// mezclado con lo demás.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await requirePermiso(req, 'ventas')
  if (!user) return json({ error: 'No autorizado' }, 401)

  const body = await req.json().catch(() => ({}))
  const campo = body.campo
  if (!CAMPOS_VALIDOS.includes(campo)) return json({ error: 'Campo no reconocido' }, 400)

  const hoyReal = new Date()
  const anio = body.anio ?? hoyReal.getUTCFullYear()

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)

    const inicio = new Date(Date.UTC(anio, 0, 1)).toISOString().slice(0, 10)
    const fin = new Date(Date.UTC(anio, 11, 31)).toISOString().slice(0, 10)

    const { data: reportes, error } = await admin
      .from('reportes_venta_diaria')
      .select(`fecha, venta_neta, ${campo}`)
      .gte('fecha', inicio)
      .lte('fecha', fin)
      .order('fecha', { ascending: true })

    if (error) return json({ error: error.message }, 400)

    // Nunca deberían ser negativas — si algún día quedó mal parseado, un
    // signo negativo ahí no representa nada real.
    const filas = (reportes ?? []).map((r: any) => ({ fecha: r.fecha, valor: Math.max(r[campo] ?? 0, 0), ventaNeta: r.venta_neta ?? 0 }))

    const serieDiaria = filas.map(f => ({ fecha: f.fecha, valor: f.valor }))

    const porMesMap = new Map<string, number>()
    for (const f of filas) {
      const key = f.fecha.slice(0, 7)
      porMesMap.set(key, (porMesMap.get(key) ?? 0) + f.valor)
    }
    const serieMensual = []
    for (let m = 0; m < 12; m++) {
      const key = `${anio}-${String(m + 1).padStart(2, '0')}`
      serieMensual.push({ mes: `${MESES[m]} ${String(anio).slice(2)}`, total: porMesMap.get(key) ?? 0 })
    }

    const acumPorDiaSemana = new Map<number, { suma: number; n: number }>()
    for (const f of filas) {
      const dia = isoWeekday(`${f.fecha}T12:00:00Z`)
      const acc = acumPorDiaSemana.get(dia) ?? { suma: 0, n: 0 }
      acc.suma += f.valor
      acc.n += 1
      acumPorDiaSemana.set(dia, acc)
    }
    const porDiaSemana = [1, 2, 3, 4, 5, 6, 7].map(dia => {
      const acc = acumPorDiaSemana.get(dia)
      return { diaSemana: dia, total: acc?.suma ?? 0, promedio: acc ? acc.suma / acc.n : null }
    })

    const conValor = filas.filter(f => f.valor > 0)
    const suma = conValor.reduce((s, f) => s + f.valor, 0)
    const sumaVentaNeta = filas.reduce((s, f) => s + f.ventaNeta, 0)
    const promedio = conValor.length ? suma / conValor.length : null
    const maxDia = conValor.length ? conValor.reduce((a, b) => b.valor > a.valor ? b : a) : null
    const topDias = [...conValor].sort((a, b) => b.valor - a.valor).slice(0, 10)

    return json({
      anio,
      serieDiaria,
      serieMensual,
      porDiaSemana,
      topDias,
      totales: {
        suma,
        promedio,
        diasConValor: conValor.length,
        maxDia,
        pctDeVenta: sumaVentaNeta ? suma / sumaVentaNeta : null,
      },
    })
  } catch (e) {
    return json({ error: e.message }, 502)
  }
})
