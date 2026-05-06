import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const supabase = createClient(
  'https://pypzdqhminbgnhxcgjev.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5cHpkcWhtaW5iZ25oeGNnamV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMTEzNzMsImV4cCI6MjA5MzU4NzM3M30.xMrJfzh05Fkl8zGXW0YjD429KmfQ2hZKUEbOWz0Kzok'
)

// "Jan 1, 2025 12:00 pm" → "2025-01-01"
function parseFecha(str) {
  if (!str || !str.trim()) return null
  const d = new Date(str.trim())
  if (isNaN(d)) return null
  return d.toISOString().slice(0, 10)
}

function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim())
  const headers = lines[0].match(/"([^"]*)"/g).map(v => v.replace(/"/g, ''))
  return lines.slice(1).map(line => {
    const vals = line.match(/"([^"]*)"/g)?.map(v => v.replace(/"/g, '')) || []
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']))
  })
}

const normalize = s => s.trim().toLowerCase()
  .replace(/\s+/g, ' ')
  .replace('raviol fiorentina', 'ravioli fiorentina')
  .replace('camarón al gusto', 'camarón al gusto')

async function main() {
  // Cargar todos los productos
  const { data: productos, error: pErr } = await supabase
    .from('productos').select('id, nombre')
  if (pErr) { console.error(pErr.message); process.exit(1) }

  const productoMap = new Map(productos.map(p => [normalize(p.nombre), p.id]))

  // Leer CSV
  const csv = readFileSync('/Users/giacomoprimucci/Desktop/export_All-ProductosSKU-s-modified--_2026-05-06_05-22-30.csv', 'utf-8')
  const rows = parseCSV(csv)
  console.log(`Filas CSV: ${rows.length}`)

  const sinMatch  = new Set()
  const registros = []

  for (const row of rows) {
    const nombre     = normalize(row['NombreProdcuto'] || row['Producto text'] || '')
    const productoId = productoMap.get(nombre)
    if (!productoId) { sinMatch.add(row['NombreProdcuto']?.trim()); continue }

    const precio       = parseFloat(row['Precio Unitario'])
    const vigenteDesde = parseFecha(row['Fecha_inicio'])
    if (!precio || !vigenteDesde) continue

    registros.push({ producto_id: productoId, precio, vigente_desde: vigenteDesde })
  }

  if (sinMatch.size > 0) console.warn('⚠ Sin match:', [...sinMatch].join(', '))
  console.log(`Registros de precio a insertar: ${registros.length}`)

  // Obtener precios ya existentes para deduplicar en JS
  const { data: existentes } = await supabase.from('precios').select('producto_id, vigente_desde')
  const existe = new Set((existentes || []).map(e => `${e.producto_id}|${e.vigente_desde}`))

  const nuevos = registros.filter(r => !existe.has(`${r.producto_id}|${r.vigente_desde}`))
  console.log(`Ya existentes: ${registros.length - nuevos.length} | Nuevos a insertar: ${nuevos.length}`)

  if (!nuevos.length) { console.log('Nada nuevo que insertar.'); return }

  const { error } = await supabase.from('precios').insert(nuevos)
  if (error) console.error('Error:', error.message)
  else console.log(`✓ ${nuevos.length} precios importados`)
}

main()
