import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

// El reporte "Ventas por Empresa" (Sierra POS) no trae las etiquetas y sus
// valores en el mismo orden en el que aparecen en el flujo de texto del
// PDF — el layout de abajo son varias cajas lado a lado, y cada caja se
// dibuja como un bloque separado (todas las etiquetas, luego todos los
// valores). Por eso NO se puede leer el texto tal cual viene: hay que
// reconstruir las líneas visuales usando la posición real (x, y) de cada
// fragmento de texto, agrupando por altura (misma fila) y ordenando por
// x dentro de cada fila — así "Cobrado" y "345,754.65" quedan en la misma
// línea aunque el PDF los haya dibujado en momentos distintos del stream.
async function extraerLineas(archivo) {
  const buffer = await archivo.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  const page = await pdf.getPage(1)
  const contenido = await page.getTextContent()

  const items = contenido.items
    .map(it => ({ texto: it.str, x: it.transform[4], y: it.transform[5] }))
    .filter(it => it.texto.trim() !== '')

  const TOLERANCIA_Y = 3
  const filas = []
  for (const it of items) {
    let fila = filas.find(f => Math.abs(f.y - it.y) < TOLERANCIA_Y)
    if (!fila) { fila = { y: it.y, items: [] }; filas.push(fila) }
    fila.items.push(it)
  }
  filas.sort((a, b) => b.y - a.y) // de arriba hacia abajo
  for (const f of filas) f.items.sort((a, b) => a.x - b.x)

  return filas.map(f => f.items.map(i => i.texto).join(' ').replace(/\s+/g, ' ').trim())
}

function numero(str) {
  if (str == null) return null
  const limpio = String(str).replace(/,/g, '').trim()
  if (limpio === '' || limpio === '-') return null
  const n = Number(limpio)
  return Number.isNaN(n) ? null : n
}

// Busca el valor asociado a `etiqueta`. Requiere que el número quede
// pegado a la etiqueta (nada de tomar "el último número de la línea") para
// no confundir "Venta Neta" con "Venta Neta c/Iva", ni "Cobrado" con
// "Cobrado Neto". No se puede asumir que la etiqueta esté al inicio de la
// línea reconstruida — varias cajas del reporte quedan
// pegadas a la de al lado en la misma fila (ej. "...310,598.00 Cobrado
// 345,754.65"), así que se busca la etiqueta en cualquier parte de la
// línea. Casi siempre el valor va inmediatamente después de la etiqueta,
// pero un par de cajas del reporte lo traen volteado (ej. "760 Clientes"),
// así que si no se encuentra "etiqueta valor" se prueba "valor etiqueta".
const NUM_DECIMAL = '-?[\\d,]+\\.\\d{2}'
const NUM_ENTERO_O_DECIMAL = '-?[\\d,]+(?:\\.\\d{2})?'

function valorPorEtiqueta(lineas, etiqueta, { entero = false } = {}) {
  const escapada = etiqueta.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const numPatron = entero ? NUM_ENTERO_O_DECIMAL : NUM_DECIMAL

  const reDespues = new RegExp(`(?:^|\\s)${escapada}\\s+(${numPatron})(?!\\S)`, 'i')
  for (const linea of lineas) {
    const m = linea.match(reDespues)
    if (m) return numero(m[1])
  }

  const reAntes = new RegExp(`(${numPatron})\\s+${escapada}(?:\\s|$)`, 'i')
  for (const linea of lineas) {
    const m = linea.match(reAntes)
    if (m) return numero(m[1])
  }

  return null
}

function enteroPorEtiqueta(lineas, etiqueta) {
  const v = valorPorEtiqueta(lineas, etiqueta, { entero: true })
  return v == null ? null : Math.round(v)
}

const RE_ZONA = /^\d+\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]*?)\s+([\d,]+)\s+([\d,]+\.\d{2})\s+([\d.]+)\s+([\d,]+\.\d{2})\s+([\d,]+)\s+([\d.]+)\s+([\d,]+\.\d{2})\s+([\d,]+)\s+([\d.]+)\s+([\d,]+\.\d{2})\s*$/

function extraerZonas(lineas) {
  const zonas = []
  for (const linea of lineas) {
    const m = linea.match(RE_ZONA)
    if (!m) continue
    zonas.push({
      zona: m[1].trim(),
      cantidad: numero(m[2]),
      venta: numero(m[3]),
      pct: numero(m[4]),
      cortesias: numero(m[5]),
      clientes: numero(m[6]),
      pct_clientes: numero(m[7]),
      prom_cliente: numero(m[8]),
      cuentas: numero(m[9]),
      pct_cuentas: numero(m[10]),
      prom_cuenta: numero(m[11]),
    })
  }
  return zonas
}

// Tabla de arriba del reporte, venta por categoría de PLU (Copeo, Vinos,
// Cervezas y Refrescos, Alimentos...). Las columnas de cortesías solo
// aparecen cuando esa categoría tuvo alguna ese día, así que el bloque
// completo es opcional al final de la línea.
// "Ventas s/cort" siempre viene al final (repite "Ventas" cuando la
// categoría no tuvo cortesías ese día); cortesías/cort% solo aparecen
// como par cuando sí hubo alguna — por eso van opcionales juntas mientras
// que el último número es obligatorio.
const RE_CATEGORIA = /^(\d+)\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]*?)\s+([\d.]+)\s+([\d,]+\.\d{2})\s+([\d,]+)(?:\s+([\d,]+\.\d{2})\s+([\d.]+))?\s+([\d,]+\.\d{2})\s*$/

function extraerCategorias(lineas) {
  const categorias = []
  for (const linea of lineas) {
    const m = linea.match(RE_CATEGORIA)
    if (!m) continue
    categorias.push({
      plu: numero(m[1]),
      descripcion: m[2].trim(),
      vta_pct: numero(m[3]),
      ventas: numero(m[4]),
      cantidad: numero(m[5]),
      cortesias: numero(m[6]),
      cort_pct: numero(m[7]),
      ventas_sin_cortesias: numero(m[8]),
    })
  }
  return categorias
}

// Formas de pago: código de 4-6 dígitos + descripción + monto + cantidad
// (ej. "91101 EFEC MN 204,209.75 143" o "97301 SalEfe 84,000.00 -28").
const RE_PAGO = /^(\d{4,6})\s+(.+?)\s+(-?[\d,]+\.\d{2})\s+(-?\d+)\s*$/

function extraerPagos(lineas) {
  const pagos = []
  for (const linea of lineas) {
    const m = linea.match(RE_PAGO)
    if (!m) continue
    pagos.push({
      codigo: m[1],
      descripcion: m[2].trim(),
      monto: numero(m[3]),
      cantidad: numero(m[4]),
    })
  }
  return pagos
}

function extraerFecha(lineas) {
  for (const linea of lineas) {
    const m = linea.match(/Ventas del d[ií]a\s+(\d{2})\/(\d{2})\/(\d{4})/i)
    if (m) return `${m[3]}-${m[2]}-${m[1]}`
  }
  return null
}

function extraerIvaPct(lineas) {
  for (const linea of lineas) {
    const m = linea.match(/(?:^|\s)Iva\s+([\d.]+)\s*%/i)
    if (m) return numero(m[1])
  }
  return null
}

function redondear(n) {
  return n == null ? null : Math.round(n * 100) / 100
}

// Venta neta = (venta bruta - cortesías) / (1 + IVA%). Se calcula así en
// vez de confiar en las etiquetas "Venta Neta"/"Venta Neta c/Iva" del PDF
// (que además se prestan a que el layout las mezcle con las de al lado) —
// es la misma fórmula con la que se hacía el cuadre a mano.
function calcularVentaNeta(totalIngresos, cortesias, ivaPct) {
  if (totalIngresos == null) return { venta_neta: null, venta_neta_civa: null, iva: null }
  const netaConIva = totalIngresos - (cortesias ?? 0)
  const divisor = 1 + (ivaPct ?? 16) / 100
  const neta = netaConIva / divisor
  return {
    venta_neta_civa: redondear(netaConIva),
    venta_neta: redondear(neta),
    iva: redondear(netaConIva - neta),
  }
}

// Punto de entrada: recibe el File del drag-and-drop, regresa los datos
// listos para la pantalla de revisión (nada se guarda todavía aquí).
export async function parsearReporteVenta(archivo) {
  const lineas = await extraerLineas(archivo)

  const totalIngresos = valorPorEtiqueta(lineas, 'Total ingresos')
  const cortesias = valorPorEtiqueta(lineas, 'Cortesías')
  const ivaPct = extraerIvaPct(lineas) ?? 16
  const { venta_neta, venta_neta_civa, iva } = calcularVentaNeta(totalIngresos, cortesias, ivaPct)

  const totales = {
    fecha: extraerFecha(lineas),
    venta_neta,
    iva_pct: ivaPct,
    iva,
    venta_neta_civa,
    cobrado: valorPorEtiqueta(lineas, 'Cobrado'),
    cambio: valorPorEtiqueta(lineas, 'Cambio'),
    propina_tc: valorPorEtiqueta(lineas, 'Propina Tc'),
    cobrado_neto: valorPorEtiqueta(lineas, 'Cobrado Neto'),
    comprobado: valorPorEtiqueta(lineas, 'Comprobado'),
    total_ingresos: totalIngresos,
    clientes_total: enteroPorEtiqueta(lineas, 'Clientes'),
    prom_cliente: valorPorEtiqueta(lineas, 'Prm/Cliente'),
    cuentas_total: enteroPorEtiqueta(lineas, 'Cuentas'),
    prom_cuenta: valorPorEtiqueta(lineas, 'Prm/Cuenta'),
    cancelaciones: valorPorEtiqueta(lineas, 'Cancelaciones'),
    cortesias_monto: cortesias,
    entrada_efectivo: valorPorEtiqueta(lineas, 'Entrada de Efectivo'),
    salida_efectivo: (() => {
      const v = valorPorEtiqueta(lineas, 'Salida de Efectivo')
      return v == null ? null : Math.abs(v)
    })(),
  }

  return {
    totales,
    categorias: extraerCategorias(lineas),
    zonas: extraerZonas(lineas),
    pagos: extraerPagos(lineas),
    lineasCrudas: lineas,
  }
}
