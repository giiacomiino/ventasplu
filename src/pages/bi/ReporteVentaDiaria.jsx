import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, UploadCloud, FileText, CheckCircle2, AlertTriangle, X, Pencil, Layers, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatMoney } from '../../utils/formatters'
import { parsearReporteVenta } from '../../utils/parseReporteVenta'
import { refrescarBI } from './shared'
import { Card, PageHeader, ErrorState } from './ui'

const CAMPOS_TOTALES = [
  { key: 'venta_neta', label: 'Venta neta (calculada)' },
  { key: 'iva', label: 'IVA (calculado)' },
  { key: 'venta_neta_civa', label: 'Venta neta c/IVA (calculada)' },
  { key: 'iva_pct', label: '% IVA' },
  { key: 'total_ingresos', label: 'Total ingresos (venta bruta)' },
  { key: 'comprobado', label: 'Comprobado' },
  { key: 'cobrado', label: 'Cobrado' },
  { key: 'cambio', label: 'Cambio' },
  { key: 'propina_tc', label: 'Propina TC' },
  { key: 'cobrado_neto', label: 'Cobrado neto' },
  { key: 'clientes_total', label: 'Clientes' },
  { key: 'prom_cliente', label: 'Prom. por cliente' },
  { key: 'cuentas_total', label: 'Cuentas' },
  { key: 'prom_cuenta', label: 'Prom. por cuenta' },
  { key: 'cancelaciones', label: 'Cancelaciones' },
  { key: 'cortesias_monto', label: 'Cortesías' },
  { key: 'entrada_efectivo', label: 'Entrada de efectivo' },
  { key: 'salida_efectivo', label: 'Salida de efectivo' },
]

function CampoNumerico({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-gray-400 mb-1">{label}</label>
      <input
        type="number" step="0.01" value={value ?? ''}
        onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#c49a2e]/40"
      />
    </div>
  )
}

function Dropzone({ onArchivo, procesando }) {
  const [arrastrando, setArrastrando] = useState(false)

  function manejarDrop(e) {
    e.preventDefault()
    setArrastrando(false)
    const archivo = e.dataTransfer.files?.[0]
    if (archivo) onArchivo(archivo)
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setArrastrando(true) }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={manejarDrop}
      className={`rounded-2xl border-2 border-dashed p-12 text-center transition-colors ${
        arrastrando ? 'border-[#c49a2e] bg-[#c49a2e]/5' : 'border-gray-200'
      }`}
    >
      <UploadCloud size={28} className="mx-auto text-gray-300 mb-3" />
      <p className="text-sm font-semibold text-gray-600 mb-1">
        {procesando ? 'Leyendo el PDF...' : 'Arrastra aquí el reporte "Ventas por Empresa"'}
      </p>
      <p className="text-xs text-gray-400 mb-4">o selecciónalo desde tu computadora</p>
      <label className="inline-block px-4 py-2 bg-[#7a6020] text-white rounded-lg text-sm font-semibold hover:bg-[#5c4718] cursor-pointer transition-colors">
        Elegir archivo
        <input
          type="file" accept="application/pdf" className="hidden"
          onChange={e => e.target.files?.[0] && onArchivo(e.target.files[0])}
        />
      </label>
    </div>
  )
}

const VACIO_MANUAL = { fecha: new Date().toISOString().slice(0, 10), ventaBruta: '', cortesias: '', numeroPersonas: '' }

// Mismos campos que el popup de Bubble "Agrega la venta del día", pero
// guardando en la tabla nativa de VURA BI en vez de Bubble. Arma el mismo
// objeto `datos` que produce el parser del PDF (con categorías/zonas/pagos
// vacíos) para reusar la misma pantalla de revisión y el mismo guardado.
function FormularioManual({ onListo }) {
  const [form, setForm] = useState(VACIO_MANUAL)

  const ventaBruta = Number(form.ventaBruta) || 0
  const cortesias = Number(form.cortesias) || 0
  const numeroPersonas = Number(form.numeroPersonas) || 0
  const ventaNetaCIva = ventaBruta - cortesias
  const ventaNeta = ventaNetaCIva / 1.16
  const iva = ventaNetaCIva - ventaNeta
  const ticketPromedio = numeroPersonas > 0 ? ventaNeta / numeroPersonas : null

  function actualizar(campo, valor) {
    setForm(f => ({ ...f, [campo]: valor }))
  }

  function continuar(e) {
    e.preventDefault()
    onListo({
      totales: {
        fecha: form.fecha,
        total_ingresos: ventaBruta,
        cortesias_monto: cortesias,
        clientes_total: numeroPersonas || null,
        venta_neta_civa: Math.round(ventaNetaCIva * 100) / 100,
        venta_neta: Math.round(ventaNeta * 100) / 100,
        iva: Math.round(iva * 100) / 100,
        iva_pct: 16,
        prom_cliente: ticketPromedio == null ? null : Math.round(ticketPromedio * 100) / 100,
      },
      categorias: [],
      zonas: [],
      pagos: [],
    })
  }

  return (
    <Card>
      <form onSubmit={continuar} className="space-y-4 max-w-md mx-auto">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Fecha de venta</label>
          <input
            required type="date" value={form.fecha} onChange={e => actualizar('fecha', e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c49a2e]/40"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Venta bruta (con IVA)</label>
            <input
              required type="number" step="0.01" min="0" value={form.ventaBruta}
              onChange={e => actualizar('ventaBruta', e.target.value)}
              placeholder="$"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c49a2e]/40"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Cortesías</label>
            <input
              type="number" step="0.01" min="0" value={form.cortesias}
              onChange={e => actualizar('cortesias', e.target.value)}
              placeholder="$"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c49a2e]/40"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Número de personas</label>
          <input
            type="number" min="0" value={form.numeroPersonas}
            onChange={e => actualizar('numeroPersonas', e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c49a2e]/40"
          />
        </div>

        <div className="grid grid-cols-3 gap-3 pt-2 pb-1 text-center">
          <div>
            <p className="text-[11px] text-gray-400 uppercase tracking-wide">Venta neta</p>
            <p className="text-sm font-bold text-gray-800 tabular-nums">{formatMoney(ventaNeta)}</p>
          </div>
          <div>
            <p className="text-[11px] text-gray-400 uppercase tracking-wide">IVA</p>
            <p className="text-sm font-bold text-gray-800 tabular-nums">{formatMoney(iva)}</p>
          </div>
          <div>
            <p className="text-[11px] text-gray-400 uppercase tracking-wide">Ticket promedio</p>
            <p className="text-sm font-bold text-gray-800 tabular-nums">{ticketPromedio == null ? '—' : formatMoney(ticketPromedio)}</p>
          </div>
        </div>

        <button
          type="submit"
          className="w-full px-4 py-2.5 bg-[#7a6020] text-white rounded-lg text-sm font-semibold hover:bg-[#5c4718] transition-colors"
        >
          Continuar
        </button>
      </form>
    </Card>
  )
}

function checarCuadre(zonas, totales) {
  const sumaZonas = zonas.reduce((s, z) => s + (Number(z.venta) || 0), 0)
  const objetivo = totales.total_ingresos ?? totales.venta_neta_civa
  if (objetivo == null) return { objetivo: null, sumaZonas, cuadra: null }
  return { objetivo, sumaZonas, cuadra: Math.abs(sumaZonas - objetivo) < 1 }
}

function Validacion({ zonas, totales }) {
  const { objetivo, sumaZonas, cuadra } = checarCuadre(zonas, totales)
  if (objetivo == null) return null
  return (
    <div className={`flex items-center gap-2 text-xs font-semibold px-3 py-2.5 rounded-lg border ${
      cuadra ? 'bg-green-50 border-green-100 text-green-700' : 'bg-amber-50 border-amber-100 text-amber-700'
    }`}>
      {cuadra ? <CheckCircle2 size={14} className="flex-shrink-0" /> : <AlertTriangle size={14} className="flex-shrink-0" />}
      Suma de zonas ({formatMoney(sumaZonas)}) {cuadra ? 'cuadra con' : 'no cuadra con'} el total del reporte ({formatMoney(objetivo)})
    </div>
  )
}

// Carga masiva: para el backfill histórico (ej. bajando meses de correos
// de Sierra POS de golpe). Cada PDF se parsea igual que en el flujo de
// uno-por-uno, pero en vez de la revisión campo por campo se muestra una
// tabla compacta — ⚠️ si la suma de zonas no cuadra con el total, para
// revisar solo esos antes de guardar el lote completo.
function CargaMasiva() {
  const [lote, setLote] = useState([]) // { id, nombre, estado, totales, categorias, zonas, pagos, error, incluir }
  const [procesandoLote, setProcesandoLote] = useState(false)
  const [guardandoLote, setGuardandoLote] = useState(false)
  const [progreso, setProgreso] = useState({ actual: 0, total: 0 })
  const [resumenGuardado, setResumenGuardado] = useState(null)

  async function agregarArchivos(archivos) {
    setResumenGuardado(null)
    const nuevos = archivos.map((archivo, i) => ({
      id: `${Date.now()}-${i}-${archivo.name}`,
      archivo,
      nombre: archivo.name,
      estado: 'pendiente',
      incluir: true,
    }))
    setLote(prev => [...prev, ...nuevos])
    setProcesandoLote(true)

    for (const fila of nuevos) {
      setLote(prev => prev.map(f => f.id === fila.id ? { ...f, estado: 'procesando' } : f))
      try {
        const resultado = await parsearReporteVenta(fila.archivo)
        if (!resultado.totales.fecha) throw new Error('Sin fecha detectada')
        setLote(prev => prev.map(f => f.id === fila.id ? { ...f, estado: 'listo', ...resultado } : f))
      } catch (e) {
        setLote(prev => prev.map(f => f.id === fila.id ? { ...f, estado: 'error', error: e.message, incluir: false } : f))
      }
    }
    setProcesandoLote(false)
  }

  function alternarIncluir(id) {
    setLote(prev => prev.map(f => f.id === id ? { ...f, incluir: !f.incluir } : f))
  }

  function quitar(id) {
    setLote(prev => prev.filter(f => f.id !== id))
  }

  function limpiarTodo() {
    setLote([])
    setResumenGuardado(null)
  }

  async function guardarLote() {
    const seleccionados = lote.filter(f => f.estado === 'listo' && f.incluir)
    setGuardandoLote(true)
    setProgreso({ actual: 0, total: seleccionados.length })
    let ok = 0
    let fallidos = 0

    for (const [i, fila] of seleccionados.entries()) {
      try {
        const { fecha, ...totales } = fila.totales
        const { data, error } = await supabase.functions.invoke('guardar-reporte-venta', {
          body: { fecha, totales, categorias: fila.categorias, zonas: fila.zonas, pagos: fila.pagos, archivoNombre: fila.nombre },
        })
        if (error) {
          const detalle = await error.context?.json?.().catch(() => null)
          throw new Error(detalle?.error || error.message)
        }
        if (data?.error) throw new Error(data.error)
        ok++
        setLote(prev => prev.map(f => f.id === fila.id ? { ...f, estado: 'guardado' } : f))
      } catch (e) {
        fallidos++
        setLote(prev => prev.map(f => f.id === fila.id ? { ...f, estado: 'error', error: e.message } : f))
      }
      setProgreso({ actual: i + 1, total: seleccionados.length })
    }

    refrescarBI()
    setResumenGuardado({ ok, fallidos })
    setGuardandoLote(false)
  }

  const listos = lote.filter(f => f.estado === 'listo')
  const seleccionados = listos.filter(f => f.incluir)
  const conAdvertencia = listos.filter(f => f.incluir && checarCuadre(f.zonas, f.totales).cuadra === false)

  return (
    <div className="space-y-5">
      {lote.length === 0 ? (
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); agregarArchivos([...e.dataTransfer.files].filter(f => f.type === 'application/pdf')) }}
          className="rounded-2xl border-2 border-dashed border-gray-200 p-12 text-center"
        >
          <Layers size={28} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm font-semibold text-gray-600 mb-1">Arrastra aquí todos los PDFs juntos</p>
          <p className="text-xs text-gray-400 mb-4">Para backfill histórico — cada uno se parsea solo</p>
          <label className="inline-block px-4 py-2 bg-[#7a6020] text-white rounded-lg text-sm font-semibold hover:bg-[#5c4718] cursor-pointer transition-colors">
            Elegir archivos
            <input
              type="file" accept="application/pdf" multiple className="hidden"
              onChange={e => e.target.files?.length && agregarArchivos([...e.target.files])}
            />
          </label>
        </div>
      ) : (
        <>
          <Card className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-gray-600">
              <span className="font-bold text-gray-900">{lote.length}</span> archivo{lote.length === 1 ? '' : 's'} ·{' '}
              <span className="font-bold text-gray-900 tabular-nums">{seleccionados.length}</span> seleccionados para guardar
              {conAdvertencia.length > 0 && (
                <span className="ml-2 text-amber-600 font-semibold">· {conAdvertencia.length} con advertencia ⚠️</span>
              )}
            </div>
            {!guardandoLote && (
              <button onClick={limpiarTodo} className="text-xs font-semibold text-gray-400 hover:text-gray-700">
                Empezar de nuevo
              </button>
            )}
          </Card>

          {guardandoLote && (
            <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded-lg px-4 py-3">
              <Loader2 size={16} className="animate-spin flex-shrink-0" />
              Guardando {progreso.actual} de {progreso.total}...
            </div>
          )}

          {resumenGuardado && (
            <div className={`flex items-center gap-2 text-sm font-semibold px-4 py-3 rounded-lg border ${
              resumenGuardado.fallidos === 0 ? 'bg-green-50 border-green-100 text-green-700' : 'bg-amber-50 border-amber-100 text-amber-700'
            }`}>
              {resumenGuardado.fallidos === 0 ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              {resumenGuardado.ok} guardados{resumenGuardado.fallidos > 0 && `, ${resumenGuardado.fallidos} con error (revisa las filas marcadas)`}
            </div>
          )}

          <Card>
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full text-xs min-w-[720px]">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['', 'Archivo', 'Fecha', 'Venta neta', 'Cuadre', 'Estado'].map(h => (
                      <th key={h} className="px-2 py-2 text-left font-bold text-gray-400 uppercase tracking-wider text-[10px]">{h}</th>
                    ))}
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {lote.map(f => {
                    const cuadre = f.estado === 'listo' || f.estado === 'guardado' ? checarCuadre(f.zonas, f.totales) : null
                    return (
                      <tr key={f.id} className="border-b border-gray-50 last:border-0">
                        <td className="px-2 py-1.5">
                          <input
                            type="checkbox" checked={f.incluir} disabled={f.estado !== 'listo'}
                            onChange={() => alternarIncluir(f.id)}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-gray-600 truncate max-w-[220px]">{f.nombre}</td>
                        <td className="px-2 py-1.5 text-gray-700 tabular-nums">{f.totales?.fecha ?? '—'}</td>
                        <td className="px-2 py-1.5 text-gray-800 font-semibold tabular-nums">
                          {f.totales?.venta_neta != null ? formatMoney(f.totales.venta_neta) : '—'}
                        </td>
                        <td className="px-2 py-1.5">
                          {cuadre?.cuadra === true && <span className="text-green-600">✓</span>}
                          {cuadre?.cuadra === false && <span className="text-amber-600 font-semibold">⚠️</span>}
                          {cuadre?.cuadra == null && f.estado === 'listo' && <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-2 py-1.5">
                          {f.estado === 'pendiente' && <span className="text-gray-300">en cola</span>}
                          {f.estado === 'procesando' && <span className="text-gray-400 flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> leyendo</span>}
                          {f.estado === 'listo' && <span className="text-gray-400">listo</span>}
                          {f.estado === 'guardado' && <span className="text-green-600 font-semibold flex items-center gap-1"><CheckCircle2 size={11} /> guardado</span>}
                          {f.estado === 'error' && <span className="text-red-500 font-semibold" title={f.error}>error</span>}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {!guardandoLote && (
                            <button onClick={() => quitar(f.id)} className="text-gray-300 hover:text-red-500"><X size={13} /></button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {!guardandoLote && (
            <div className="flex justify-end gap-3">
              <label className="px-4 py-2.5 rounded-lg text-sm font-semibold text-gray-500 hover:bg-gray-50 cursor-pointer">
                Agregar más
                <input
                  type="file" accept="application/pdf" multiple className="hidden"
                  onChange={e => e.target.files?.length && agregarArchivos([...e.target.files])}
                />
              </label>
              <button
                onClick={guardarLote}
                disabled={seleccionados.length === 0 || procesandoLote}
                className="px-6 py-2.5 bg-[#7a6020] text-white rounded-lg text-sm font-semibold hover:bg-[#5c4718] disabled:opacity-50 transition-colors"
              >
                Guardar {seleccionados.length || ''} reporte{seleccionados.length === 1 ? '' : 's'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function ReporteVentaDiaria() {
  const [modo, setModo] = useState('pdf') // 'pdf' | 'manual' | 'masivo'
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState('')
  const [datos, setDatos] = useState(null) // { totales, categorias, zonas, pagos }
  const [archivoNombre, setArchivoNombre] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)

  async function procesarArchivo(archivo) {
    setError('')
    setGuardado(false)
    setProcesando(true)
    try {
      const resultado = await parsearReporteVenta(archivo)
      if (!resultado.totales.fecha) {
        throw new Error('No se pudo detectar la fecha del reporte — revisa que sea el PDF correcto')
      }
      setDatos(resultado)
      setArchivoNombre(archivo.name)
    } catch (e) {
      setError(e.message)
    }
    setProcesando(false)
  }

  function empezarManual(inicial) {
    setError('')
    setGuardado(false)
    setArchivoNombre('')
    setDatos(inicial)
  }

  // Venta neta / IVA / Venta neta c/IVA son campos calculados a partir de
  // Total ingresos, Cortesías y % IVA — si corriges cualquiera de esos
  // tres a mano, se recalculan solos para no quedar desfasados.
  function actualizarTotal(campo, valor) {
    setDatos(d => {
      const totales = { ...d.totales, [campo]: valor }
      if (['total_ingresos', 'cortesias_monto', 'iva_pct'].includes(campo)) {
        const netaConIva = totales.total_ingresos != null ? totales.total_ingresos - (totales.cortesias_monto ?? 0) : null
        const divisor = 1 + (totales.iva_pct ?? 16) / 100
        totales.venta_neta_civa = netaConIva == null ? null : Math.round(netaConIva * 100) / 100
        totales.venta_neta = netaConIva == null ? null : Math.round((netaConIva / divisor) * 100) / 100
        totales.iva = netaConIva == null ? null : Math.round((totales.venta_neta_civa - totales.venta_neta) * 100) / 100
      }
      return { ...d, totales }
    })
  }

  function actualizarCategoria(i, campo, valor) {
    setDatos(d => ({ ...d, categorias: d.categorias.map((c, idx) => idx === i ? { ...c, [campo]: valor } : c) }))
  }

  function actualizarZona(i, campo, valor) {
    setDatos(d => ({ ...d, zonas: d.zonas.map((z, idx) => idx === i ? { ...z, [campo]: valor } : z) }))
  }

  function actualizarPago(i, campo, valor) {
    setDatos(d => ({ ...d, pagos: d.pagos.map((p, idx) => idx === i ? { ...p, [campo]: valor } : p) }))
  }

  async function guardar() {
    setError('')
    setGuardando(true)
    try {
      const { fecha, ...totales } = datos.totales
      const { data, error } = await supabase.functions.invoke('guardar-reporte-venta', {
        body: { fecha, totales, categorias: datos.categorias, zonas: datos.zonas, pagos: datos.pagos, archivoNombre },
      })
      if (error) {
        const detalle = await error.context?.json?.().catch(() => null)
        throw new Error(detalle?.error || error.message)
      }
      if (data?.error) throw new Error(data.error)
      refrescarBI()
      setGuardado(true)
    } catch (e) {
      setError(e.message)
    }
    setGuardando(false)
  }

  function empezarDeNuevo() {
    setDatos(null)
    setArchivoNombre('')
    setGuardado(false)
  }

  return (
    <div className="w-full px-4 py-4 sm:px-8 sm:py-8 max-w-[1200px] mx-auto space-y-6">
      <div>
        <Link to="/ventas" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-700 mb-3 transition-colors">
          <ArrowLeft size={15} /> Ventas
        </Link>
        <PageHeader
          title="Reporte de venta diaria"
          sub="Sube el PDF de Sierra POS o regístralo a mano — revisa los datos y guarda"
        />
      </div>

      {(!datos || modo === 'masivo') && (
        <>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setModo('pdf')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors ${
                modo === 'pdf' ? 'bg-[#7a6020] text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              <UploadCloud size={15} /> Subir PDF
            </button>
            <button
              onClick={() => setModo('manual')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors ${
                modo === 'manual' ? 'bg-[#7a6020] text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              <Pencil size={15} /> Registrar a mano
            </button>
            <button
              onClick={() => setModo('masivo')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors ${
                modo === 'masivo' ? 'bg-[#7a6020] text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              <Layers size={15} /> Carga masiva
            </button>
          </div>

          {modo === 'pdf' && !datos && <Dropzone onArchivo={procesarArchivo} procesando={procesando} />}
          {modo === 'manual' && !datos && <FormularioManual onListo={empezarManual} />}
          {modo === 'masivo' && <CargaMasiva />}
        </>
      )}
      {error && <ErrorState message={error} />}

      {datos && !guardado && (
        <>
          <Card className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {archivoNombre ? <FileText size={18} className="text-gray-400 flex-shrink-0" /> : <Pencil size={18} className="text-gray-400 flex-shrink-0" />}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{archivoNombre || 'Captura manual'}</p>
                <p className="text-xs text-gray-400">Fecha: {datos.totales.fecha ?? 'sin detectar'}</p>
              </div>
            </div>
            <button onClick={empezarDeNuevo} className="text-gray-300 hover:text-gray-600 p-1 flex-shrink-0"><X size={16} /></button>
          </Card>

          <Validacion zonas={datos.zonas} totales={datos.totales} />

          <Card>
            <h2 className="text-sm font-bold text-gray-900 mb-3">Totales del día</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {CAMPOS_TOTALES.map(c => (
                <CampoNumerico key={c.key} label={c.label} value={datos.totales[c.key]} onChange={v => actualizarTotal(c.key, v)} />
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="text-sm font-bold text-gray-900 mb-3">Venta por categoría ({datos.categorias.length})</h2>
            {datos.categorias.length === 0 ? (
              <p className="text-xs text-gray-300">No se detectaron categorías — revisa el PDF</p>
            ) : (
              <div className="overflow-x-auto -mx-1 px-1">
                <table className="w-full text-xs min-w-[560px]">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['Plu', 'Descripción', 'Vta%', 'Ventas', 'Cant', 'Cortesías', 'Cort%', 'Ventas s/cort'].map(h => (
                        <th key={h} className="px-2 py-2 text-left font-bold text-gray-400 uppercase tracking-wider text-[10px]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {datos.categorias.map((c, i) => (
                      <tr key={i} className="border-b border-gray-50 last:border-0">
                        <td className="px-2 py-1.5 text-gray-400 tabular-nums">{c.plu}</td>
                        <td className="px-2 py-1.5">
                          <input value={c.descripcion} onChange={e => actualizarCategoria(i, 'descripcion', e.target.value)} className="w-32 px-1.5 py-1 border border-gray-100 rounded text-xs" />
                        </td>
                        {['vta_pct', 'ventas', 'cantidad', 'cortesias', 'cort_pct', 'ventas_sin_cortesias'].map(campo => (
                          <td key={campo} className="px-2 py-1.5">
                            <input
                              type="number" step="0.01" value={c[campo] ?? ''}
                              onChange={e => actualizarCategoria(i, campo, e.target.value === '' ? null : Number(e.target.value))}
                              className="w-20 px-1.5 py-1 border border-gray-100 rounded text-xs tabular-nums"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>


          <Card>
            <h2 className="text-sm font-bold text-gray-900 mb-3">Por zona ({datos.zonas.length})</h2>
            {datos.zonas.length === 0 ? (
              <p className="text-xs text-gray-300">No se detectaron zonas — revisa el PDF</p>
            ) : (
              <div className="overflow-x-auto -mx-1 px-1">
                <table className="w-full text-xs min-w-[640px]">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['Zona', 'Cant.', 'Venta', '%', 'Cortesías', 'Clientes', 'Prom/Cli', 'Cuentas', 'Prom/Cta'].map(h => (
                        <th key={h} className="px-2 py-2 text-left font-bold text-gray-400 uppercase tracking-wider text-[10px]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {datos.zonas.map((z, i) => (
                      <tr key={i} className="border-b border-gray-50 last:border-0">
                        <td className="px-2 py-1.5">
                          <input value={z.zona} onChange={e => actualizarZona(i, 'zona', e.target.value)} className="w-28 px-1.5 py-1 border border-gray-100 rounded text-xs" />
                        </td>
                        {['cantidad', 'venta', 'pct', 'cortesias', 'clientes', 'prom_cliente', 'cuentas', 'prom_cuenta'].map(campo => (
                          <td key={campo} className="px-2 py-1.5">
                            <input
                              type="number" step="0.01" value={z[campo] ?? ''}
                              onChange={e => actualizarZona(i, campo, e.target.value === '' ? null : Number(e.target.value))}
                              className="w-20 px-1.5 py-1 border border-gray-100 rounded text-xs tabular-nums"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <h2 className="text-sm font-bold text-gray-900 mb-3">Formas de pago ({datos.pagos.length})</h2>
            {datos.pagos.length === 0 ? (
              <p className="text-xs text-gray-300">No se detectaron formas de pago — revisa el PDF</p>
            ) : (
              <div className="overflow-x-auto -mx-1 px-1">
                <table className="w-full text-xs min-w-[480px]">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['Código', 'Descripción', 'Monto', 'Cantidad'].map(h => (
                        <th key={h} className="px-2 py-2 text-left font-bold text-gray-400 uppercase tracking-wider text-[10px]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {datos.pagos.map((p, i) => (
                      <tr key={i} className="border-b border-gray-50 last:border-0">
                        <td className="px-2 py-1.5 text-gray-400 tabular-nums">{p.codigo}</td>
                        <td className="px-2 py-1.5">
                          <input value={p.descripcion} onChange={e => actualizarPago(i, 'descripcion', e.target.value)} className="w-32 px-1.5 py-1 border border-gray-100 rounded text-xs" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number" step="0.01" value={p.monto ?? ''}
                            onChange={e => actualizarPago(i, 'monto', e.target.value === '' ? null : Number(e.target.value))}
                            className="w-24 px-1.5 py-1 border border-gray-100 rounded text-xs tabular-nums"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number" value={p.cantidad ?? ''}
                            onChange={e => actualizarPago(i, 'cantidad', e.target.value === '' ? null : Number(e.target.value))}
                            className="w-16 px-1.5 py-1 border border-gray-100 rounded text-xs tabular-nums"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {error && <ErrorState message={error} />}

          <div className="flex justify-end gap-3">
            <button onClick={empezarDeNuevo} className="px-4 py-2.5 rounded-lg text-sm font-semibold text-gray-500 hover:bg-gray-50">
              Cancelar
            </button>
            <button
              onClick={guardar} disabled={guardando}
              className="px-6 py-2.5 bg-[#7a6020] text-white rounded-lg text-sm font-semibold hover:bg-[#5c4718] disabled:opacity-50 transition-colors"
            >
              {guardando ? 'Guardando...' : 'Guardar reporte'}
            </button>
          </div>
        </>
      )}

      {guardado && (
        <Card className="flex flex-col items-center text-center py-12 gap-3">
          <CheckCircle2 size={28} className="text-green-600" />
          <p className="text-sm font-semibold text-gray-800">Reporte del {datos.totales.fecha} guardado</p>
          <button onClick={empezarDeNuevo} className="text-sm font-semibold text-[#7a6020] hover:underline mt-2">
            Subir otro reporte
          </button>
        </Card>
      )}
    </div>
  )
}
