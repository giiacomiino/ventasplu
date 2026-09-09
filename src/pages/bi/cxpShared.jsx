import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock3, X } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatMoney } from '../../utils/formatters'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { CRITICAL, WARNING, GOOD, llamar, refrescarBI } from './shared'

const CATEGORIA_ALMACEN = 'INSUMOS'

const CATEGORIAS = [
  'ASESORIAS', 'CREDITOS', 'GASTOS DE OFICINA', 'GASTOS OPERATIVOS', 'HONORARIOS',
  'IMPUESTOS', 'INSUMOS', 'MANTENIMIENTO', 'NOMINA', 'OTROS', 'RENTA', 'SEGUROS',
  'SERVICIOS', 'TARJETAS DE CREDITO',
]

export function fechaCorta(iso) {
  if (!iso) return '—'
  try { return format(new Date(iso), 'd MMM yy', { locale: es }) } catch { return '—' }
}

export function fechaLarga(iso) {
  if (!iso) return null
  try { return format(new Date(iso), "d 'de' MMMM yyyy, HH:mm", { locale: es }) } catch { return null }
}

export function esVencida(f) {
  const fecha = f.fechaPagoCalculada || f.fechaPagoVura
  return fecha ? new Date(fecha) < new Date() && !f.pagada : false
}

export function fechaEfectivaCliente(f) {
  return f.fechaPagoCalculada || f.fechaPagoVura
}

export function Campo({ label, value, resaltado, nota }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-sm ${resaltado ? 'font-bold' : 'text-gray-700 font-medium'} truncate`} style={resaltado ? { color: CRITICAL } : undefined}>
        {value || <span className="text-gray-300 font-normal">No disponible</span>}
      </p>
      {nota && <p className="text-[11px] text-gray-400 mt-0.5">{nota}</p>}
    </div>
  )
}

// Solo aplica a facturas nativas (fuente === 'supabase') — de verdad
// escribe en Supabase. Las de Bubble no se pueden marcar pagadas desde
// aquí todavía (no editamos Bubble hasta el corte completo).
export function ModalMarcarPagada({ factura, cuentas = [], onClose, onPagada }) {
  const [fechaPago, setFechaPago] = useState(new Date().toISOString().slice(0, 10))
  const [cuenta, setCuenta] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function guardar() {
    setError('')
    setGuardando(true)
    try {
      const { data, error } = await supabase.functions.invoke('marcar-pagada-nativa', {
        body: { id: factura.id, fechaPago, cuentaPago: cuenta },
      })
      if (error) {
        const detalle = await error.context?.json?.().catch(() => null)
        throw new Error(detalle?.error || error.message)
      }
      if (data?.error) throw new Error(data.error)
      refrescarBI()
      onPagada({ ...factura, pagada: true, fechaPagoVura: fechaPago, cuentaPago: cuenta })
    } catch (e) {
      setError(e.message)
    }
    setGuardando(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-xl" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-gray-900">¿Ya se pagó la factura #{factura.remision}?</h3>
        {error && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Fecha de pago</label>
          <input
            type="date" value={fechaPago} onChange={e => setFechaPago(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c49a2e]/40"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Cuenta de pago</label>
          <select value={cuenta} onChange={e => setCuenta(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
            <option value="">Escoge una cuenta</option>
            {cuentas.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold text-gray-500 hover:bg-gray-50">Cancelar</button>
          <button
            disabled={!cuenta || guardando}
            onClick={guardar}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-[#7a6020] text-white disabled:opacity-40"
          >
            {guardando ? 'Guardando...' : 'Guardar factura pagada'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function ModalDetalleFactura({ factura: f, onClose, onMarcarPagada }) {
  const vencida = esVencida(f)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 px-6 pt-6">
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Factura #{f.remision}</p>
            <h3 className="text-lg font-bold text-gray-900 truncate">{f.proveedor}</h3>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-600 flex-shrink-0 p-1"><X size={18} /></button>
        </div>

        <div className="px-6 pt-4 flex items-center gap-2">
          {f.pagada ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full" style={{ color: GOOD, background: '#0ca30c14' }}>
              <CheckCircle2 size={13} /> Pagada
            </span>
          ) : vencida ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full" style={{ color: CRITICAL, background: '#d03b3b14' }}>
              <AlertTriangle size={13} /> Vencida
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full" style={{ color: WARNING, background: '#fab21914' }}>
              <Clock3 size={13} /> Pendiente
            </span>
          )}
          {f.fuente === 'supabase' && (
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide px-2 py-1 rounded-full bg-gray-100">Nativa VURA BI</span>
          )}
        </div>

        <div className="px-6 pt-5 pb-6 space-y-5">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Descripción</p>
            <p className="text-sm text-gray-700">{f.descripcion || <span className="text-gray-300">Sin descripción</span>}</p>
          </div>

          <div className="grid grid-cols-2 gap-x-5 gap-y-4">
            <Campo label="Monto sin IVA" value={formatMoney(f.monto)} />
            <Campo label="Categoría" value={f.categoria} />
            <Campo label="Tipo de producto" value={f.tipoProducto} />
            <Campo label="Fecha de ingreso" value={fechaCorta(f.fechaIngreso)} />
          </div>

          <div className="pt-4 border-t border-gray-100 grid grid-cols-2 gap-x-5 gap-y-4">
            <Campo
              label="Fecha de pago"
              value={fechaCorta(f.fechaPagoCalculada || f.fechaPagoVura)}
              resaltado={vencida}
              nota={f.calculoDisponible ? 'Calculada: ingreso + días de crédito' : 'Sin días de crédito registrados'}
            />
            {f.calculoDisponible && f.fuente === 'bubble' && !f.coincide && (
              <Campo label="Fecha de pago según VURA" value={fechaCorta(f.fechaPagoVura)} nota="No coincide con la calculada" />
            )}
            {f.pagada && <Campo label="Cuenta de pago" value={f.cuentaPago} />}
            {f.pagada && <Campo label="Pagada por" value={f.pagadaPor} />}
          </div>

          <div className="pt-4 border-t border-gray-100 grid grid-cols-2 gap-x-5 gap-y-4">
            <Campo label="Fecha de registro" value={fechaLarga(f.fechaRegistro)} />
            <Campo label="Registrada por" value={f.registradaPor} />
          </div>

          {!f.pagada && (
            f.fuente === 'supabase' ? (
              <button
                onClick={() => onMarcarPagada(f)}
                className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold bg-[#7a6020] text-white hover:bg-[#5c4718] transition-colors"
              >
                Marcar pagada
              </button>
            ) : (
              <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2.5 text-center">
                Esta factura viene de VURA — márcala pagada ahí todavía, mientras no hacemos el corte completo.
              </p>
            )
          )}
        </div>
      </div>
    </div>
  )
}

// Searchbox de proveedor: solo deja elegir uno de los que ya existen en el
// catálogo (filtrado desde el backend — quien tenga "solo insumos" marcado
// en permisos solo ve proveedores de esa categoría).
// A propósito NO permite texto libre — es justo para evitar errores de
// dedo al registrar una factura. Si lo que se escribió no calza con un
// proveedor real, onSelect(null) y no se puede enviar el formulario.
export function BuscadorProveedor({ catalogo, value, onSelect, placeholder }) {
  const [texto, setTexto] = useState(value || '')
  const [abierto, setAbierto] = useState(false)

  useEffect(() => { setTexto(value || '') }, [value])

  const filtrados = (texto.trim()
    ? catalogo.filter(p => p.nombre.toLowerCase().includes(texto.trim().toLowerCase()))
    : catalogo
  ).slice(0, 8)

  const valido = catalogo.some(p => p.nombre.toLowerCase() === texto.trim().toLowerCase())

  function elegir(p) {
    setTexto(p.nombre)
    onSelect(p)
    setAbierto(false)
  }

  return (
    <div className="relative">
      <input
        required value={texto}
        onChange={e => { setTexto(e.target.value); setAbierto(true); onSelect(null) }}
        onFocus={() => setAbierto(true)}
        onBlur={() => {
          setTimeout(() => {
            setAbierto(false)
            if (!catalogo.some(p => p.nombre.toLowerCase() === texto.trim().toLowerCase())) {
              setTexto('')
              onSelect(null)
            }
          }, 120)
        }}
        placeholder={placeholder}
        autoComplete="off"
        className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c49a2e]/40 ${
          texto && !valido ? 'border-red-200' : 'border-gray-200'
        }`}
      />
      {texto && !valido && !abierto && (
        <p className="text-[11px] text-red-500 mt-1">Ese proveedor no existe en el catálogo — elige uno de la lista.</p>
      )}
      {abierto && filtrados.length > 0 && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-100 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {filtrados.map(p => (
            <button
              key={p.nombre} type="button"
              onMouseDown={() => elegir(p)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between gap-2"
            >
              <span className="truncate text-gray-700">{p.nombre}</span>
              {p.categoria && <span className="text-[10px] text-gray-400 flex-shrink-0">{p.categoria}</span>}
            </button>
          ))}
        </div>
      )}
      {abierto && texto.trim() && filtrados.length === 0 && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-100 rounded-lg shadow-lg px-3 py-2 text-xs text-gray-400">
          Sin resultados
        </div>
      )}
    </div>
  )
}

// Popup de "Registrar factura" — se usa igual desde Pagos y desde Compras.
// El comportamiento depende de permisos.compras_solo_insumos: quien lo
// tenga marcado solo ve proveedores de insumos (categoría fija); el resto
// ve el catálogo completo y elige categoría libremente. El proveedor solo se
// puede elegir del catálogo (no texto libre) para evitar errores de dedo.
export function ModalRegistrarFactura({ onClose, onRegistrada }) {
  const { profile } = useAuth()
  const soloInsumos = profile?.rol !== 'owner' && profile?.permisos?.compras_solo_insumos === true

  const [catalogo, setCatalogo] = useState([])
  const [form, setForm] = useState({
    proveedor: '',
    categoria: soloInsumos ? CATEGORIA_ALMACEN : '',
    tipoProducto: '',
    montoSinIva: '',
    descripcion: '',
    fechaIngreso: new Date().toISOString().slice(0, 10),
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    llamar('proveedores-catalogo').then(d => setCatalogo(d.proveedores ?? [])).catch(() => {})
  }, [])

  function actualizar(campo, valor) {
    setForm(f => ({ ...f, [campo]: valor }))
  }

  function elegirProveedor(p) {
    if (!p) {
      setForm(f => ({ ...f, proveedor: '' }))
      return
    }
    setForm(f => ({
      ...f,
      proveedor: p.nombre,
      categoria: soloInsumos ? CATEGORIA_ALMACEN : (p.categoria || f.categoria),
      tipoProducto: p.tipoProducto ?? f.tipoProducto,
    }))
  }

  async function guardar(e) {
    e.preventDefault()
    setError('')
    setGuardando(true)
    try {
      const { data, error } = await supabase.functions.invoke('crear-factura', {
        body: {
          proveedor: form.proveedor,
          categoria: soloInsumos ? CATEGORIA_ALMACEN : form.categoria,
          tipoProducto: form.tipoProducto || null,
          montoSinIva: Number(form.montoSinIva),
          descripcion: form.descripcion || null,
          fechaIngreso: form.fechaIngreso,
        },
      })
      if (error) {
        const detalle = await error.context?.json?.().catch(() => null)
        throw new Error(detalle?.error || error.message)
      }
      if (data?.error) throw new Error(data.error)
      refrescarBI()
      onRegistrada(data.factura)
    } catch (e) {
      setError(e.message)
    }
    setGuardando(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <h3 className="text-lg font-bold text-gray-900">Registrar factura</h3>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-600 p-1"><X size={18} /></button>
        </div>

        <form onSubmit={guardar} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Proveedor</label>
            <BuscadorProveedor
              catalogo={catalogo} value={form.proveedor} onSelect={elegirProveedor}
              placeholder={soloInsumos ? 'Buscar proveedor de insumos...' : 'Buscar proveedor...'}
            />
            {soloInsumos && (
              <p className="text-[11px] text-gray-400 mt-1">Solo proveedores de insumos — si es nuevo, se registra como insumos.</p>
            )}
          </div>

          {soloInsumos ? (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Categoría</label>
              <input disabled value="INSUMOS" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500" />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Categoría</label>
              <select
                required value={form.categoria} onChange={e => actualizar('categoria', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
              >
                <option value="" disabled>Escoge una categoría</option>
                {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Tipo de producto</label>
              <input
                value={form.tipoProducto} onChange={e => actualizar('tipoProducto', e.target.value)}
                placeholder="Ej. Verdura, Vinos..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c49a2e]/40"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Monto sin IVA</label>
              <input
                required type="number" step="0.01" min="0" value={form.montoSinIva}
                onChange={e => actualizar('montoSinIva', e.target.value)}
                placeholder="$"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c49a2e]/40"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Fecha de ingreso</label>
            <input
              required type="date" value={form.fechaIngreso} onChange={e => actualizar('fechaIngreso', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c49a2e]/40"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Descripción</label>
            <input
              value={form.descripcion} onChange={e => actualizar('descripcion', e.target.value)}
              placeholder="Ej. 100 baguette, 25 croton..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c49a2e]/40"
            />
          </div>

          {error && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold text-gray-500 hover:bg-gray-50">
              Cancelar
            </button>
            <button
              type="submit" disabled={guardando || !form.proveedor}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-[#7a6020] text-white disabled:opacity-40"
            >
              {guardando ? 'Guardando...' : 'Registrar factura'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
