import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const supabase = createClient(
  'https://pypzdqhminbgnhxcgjev.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5cHpkcWhtaW5iZ25oeGNnamV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMTEzNzMsImV4cCI6MjA5MzU4NzM3M30.xMrJfzh05Fkl8zGXW0YjD429KmfQ2hZKUEbOWz0Kzok'
)

// Parsear fecha DD/MM/YY → YYYY-MM-DD
function parseDate(str) {
  const [d, m, y] = str.trim().split('/')
  return `20${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
}

// Parsear CSV respetando comillas
function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim())
  const headers = lines[0].replace(/"/g, '').split(',')
  return lines.slice(1).map(line => {
    const vals = line.match(/"([^"]*)"/g)?.map(v => v.replace(/"/g, '')) || []
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']))
  })
}

async function main() {
  // 1. Cargar productos de Supabase
  const { data: productos, error: pErr } = await supabase
    .from('productos')
    .select('id, nombre')
  if (pErr) { console.error('Error cargando productos:', pErr.message); process.exit(1) }

  // Mapa nombre (normalizado) → id
  const normalize = s => s.trim().toLowerCase().replace(/\s+/g, ' ').replace('raviol fiorentina', 'ravioli fiorentina')
  const productoMap = new Map(productos.map(p => [normalize(p.nombre), p.id]))

  // 2. Leer CSV
  const csv = readFileSync('/Users/giacomoprimucci/Desktop/ventas_plu (15).csv', 'utf-8')
  const rows = parseCSV(csv)
  console.log(`Filas CSV: ${rows.length}`)

  // 3. Construir registros
  const registros = []
  const sinMatch = new Set()

  for (const row of rows) {
    const nombre = normalize(row['Producto text'] || '')
    const productoId = productoMap.get(nombre)
    if (!productoId) { sinMatch.add(row['Producto text']?.trim()); continue }

    const unidades = parseInt(row['UnidadesVendidas']) || 0
    const monto = parseFloat(row['MontoTotal']) || 0
    const costo = row['CostoUnitario'] ? parseFloat(row['CostoUnitario']) : null
    const fecha = parseDate(row['Fecha'])

    registros.push({ producto_id: productoId, fecha, unidades, monto, costo_unitario: costo })
  }

  if (sinMatch.size > 0) {
    console.warn('⚠ Productos sin match:', [...sinMatch].join(', '))
  }
  console.log(`Registros a insertar: ${registros.length}`)

  // 4. Insertar en lotes de 200
  let ok = 0, errors = 0
  const BATCH = 200
  for (let i = 0; i < registros.length; i += BATCH) {
    const batch = registros.slice(i, i + BATCH)
    const { error } = await supabase
      .from('ventas_plu')
      .upsert(batch, { onConflict: 'producto_id,fecha' })
    if (error) { console.error(`Lote ${i}-${i+BATCH}:`, error.message); errors += batch.length }
    else { ok += batch.length }
    process.stdout.write(`\r${ok} insertados...`)
  }

  console.log(`\n✓ ${ok} registros subidos, ${errors} errores`)
}

main()
