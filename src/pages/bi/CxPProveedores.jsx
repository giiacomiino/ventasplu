import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, X, Search } from 'lucide-react'
import { formatMoney } from '../../utils/formatters'
import { llamar } from './shared'
import { Card, PageHeader, LoadingState, ErrorState, EmptyState } from './ui'
import { fechaCorta, ModalDetalleFactura, ModalMarcarPagada } from './cxpShared'

function TarjetaProveedor({ proveedor, monto, facturas, onClick }) {
  return (
    <button
      onClick={onClick}
      className="bg-white border border-gray-100 rounded-xl px-4 py-3.5 text-left hover:border-[#c49a2e]/50 hover:shadow-sm transition-all"
    >
      <p className="text-sm font-semibold text-gray-700 truncate">{proveedor}</p>
      <p className="text-lg font-bold text-[#7a6020] tabular-nums mt-0.5">{formatMoney(monto)}</p>
      <p className="text-[11px] text-gray-400 mt-0.5">{facturas} factura{facturas === 1 ? '' : 's'}</p>
    </button>
  )
}

function ModalProveedor({ proveedor, facturas, onClose, onAbrirFactura }) {
  const total = facturas.reduce((s, f) => s + f.monto, 0)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 px-6 pt-6">
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Facturas por pagar</p>
            <h3 className="text-xl font-bold text-gray-900 truncate">{proveedor}</h3>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-600 flex-shrink-0 p-1"><X size={18} /></button>
        </div>

        <div className="grid grid-cols-2 gap-4 px-6 pt-5">
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Cantidad a pagar</p>
            <p className="text-2xl font-bold text-gray-900 tabular-nums">{formatMoney(total)}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Facturas a pagar</p>
            <p className="text-2xl font-bold text-gray-900 tabular-nums">{facturas.length}</p>
          </div>
        </div>

        <div className="px-6 pt-5 pb-6">
          <div className="overflow-x-auto -mx-6 px-6">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Folio', 'Ingreso', 'Fecha de pago', 'Categoría', ''].map((c, i) => (
                    <th key={i} className={`px-3 py-2 text-[11px] font-bold text-gray-400 uppercase tracking-wider ${i === 4 ? 'text-right' : 'text-left'}`}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {facturas.map(f => (
                  <tr key={f.id} onClick={() => onAbrirFactura(f)} className="cursor-pointer border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors">
                    <td className="px-3 py-2.5 text-xs text-gray-400 tabular-nums">{f.remision}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-500 tabular-nums">{fechaCorta(f.fechaIngreso)}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-700 font-medium tabular-nums">{fechaCorta(f.fechaPagoCalculada || f.fechaPagoVura)}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-400">{f.categoria}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-gray-800 tabular-nums">{formatMoney(f.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function BICxPProveedores() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [proveedorAbierto, setProveedorAbierto] = useState(null)
  const [facturaAbierta, setFacturaAbierta] = useState(null)
  const [modalPago, setModalPago] = useState(null)

  useEffect(() => {
    llamar('pagos-cxp').then(setDatos).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [])

  function abrirFactura(f) {
    setFacturaAbierta(f)
  }

  function recargar() {
    llamar('pagos-cxp').then(setDatos).catch(e => setError(e.message))
  }

  const lista = datos?.saldoPorProveedor.filter(p => p.proveedor.toLowerCase().includes(busqueda.trim().toLowerCase())) ?? []
  const facturasDelAbierto = datos && proveedorAbierto ? datos.pendientes.filter(f => f.proveedor === proveedorAbierto) : []

  return (
    <div className="w-full px-4 py-4 sm:px-8 sm:py-8 max-w-[1600px] mx-auto space-y-6">
      <div>
        <Link to="/pagos" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-700 mb-3 transition-colors">
          <ArrowLeft size={15} /> Cuentas por pagar
        </Link>
        <PageHeader
          title="Saldos por proveedor"
          sub={`${lista.length} proveedores con saldo pendiente · clic en uno para ver sus facturas`}
          right={
            <div className="relative w-full sm:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
              <input
                value={busqueda} onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar proveedor..."
                className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c49a2e]/40"
              />
            </div>
          }
        />
      </div>

      {loading && <LoadingState>Cargando...</LoadingState>}
      {error && <ErrorState message={error} />}

      {datos && (
        lista.length === 0 ? (
          <Card><EmptyState>Sin proveedores que coincidan</EmptyState></Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {lista.map(p => (
              <TarjetaProveedor key={p.proveedor} proveedor={p.proveedor} monto={p.monto} facturas={p.facturas} onClick={() => setProveedorAbierto(p.proveedor)} />
            ))}
          </div>
        )
      )}

      {proveedorAbierto && (
        <ModalProveedor
          proveedor={proveedorAbierto}
          facturas={facturasDelAbierto}
          onClose={() => setProveedorAbierto(null)}
          onAbrirFactura={abrirFactura}
        />
      )}

      {facturaAbierta && (
        <ModalDetalleFactura
          factura={facturaAbierta}
          onClose={() => setFacturaAbierta(null)}
          onMarcarPagada={f => { setFacturaAbierta(null); setModalPago(f) }}
        />
      )}

      {modalPago && (
        <ModalMarcarPagada
          factura={modalPago}
          cuentas={datos?.cuentasBancarias ?? []}
          onClose={() => setModalPago(null)}
          onPagada={() => {
            setModalPago(null)
            recargar()
          }}
        />
      )}
    </div>
  )
}
