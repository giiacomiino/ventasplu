import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { formatMoney } from '../../utils/formatters'
import { llamar } from './shared'
import { Card, SectionHeader, PageHeader, KpiTile, MiniBar, LoadingState, ErrorState, EmptyState } from './ui'
import { fechaCorta, ModalDetalleFactura, ModalMarcarPagada } from './cxpShared'

export default function BICxPBancos() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [cuentaAbierta, setCuentaAbierta] = useState(null)
  const [facturaAbierta, setFacturaAbierta] = useState(null)
  const [modalPago, setModalPago] = useState(null)

  useEffect(() => {
    llamar('pagos-cxp').then(setDatos).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [])

  const salidasPorCuenta = useMemo(() => {
    if (!datos) return []
    const porCuenta = new Map()
    for (const f of datos.pagadas) {
      const cuenta = f.cuentaPago || 'Sin cuenta registrada'
      const acc = porCuenta.get(cuenta) ?? { monto: 0, facturas: [] }
      acc.monto += f.monto
      acc.facturas.push(f)
      porCuenta.set(cuenta, acc)
    }
    return [...porCuenta.entries()]
      .map(([cuenta, v]) => ({ cuenta, ...v, sinDato: cuenta === 'Sin cuenta registrada' }))
      .sort((a, b) => b.monto - a.monto)
  }, [datos])

  const maxSalidaCuenta = Math.max(...salidasPorCuenta.map(c => c.monto), 1)
  const totalSalidas = salidasPorCuenta.reduce((s, c) => s + c.monto, 0)
  const cuentaSeleccionada = salidasPorCuenta.find(c => c.cuenta === cuentaAbierta)

  function abrirFactura(f) {
    setFacturaAbierta(f)
  }

  function recargar() {
    llamar('pagos-cxp').then(setDatos).catch(e => setError(e.message))
  }

  return (
    <div className="w-full px-4 py-4 sm:px-8 sm:py-8 max-w-[1600px] mx-auto space-y-8">
      <div>
        <Link to="/pagos" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-700 mb-3 transition-colors">
          <ArrowLeft size={15} /> Cuentas por pagar
        </Link>
        <PageHeader title="Salidas por cuenta" sub="De dónde salió el dinero de lo pagado — no es un saldo bancario real todavía" />
      </div>

      {loading && <LoadingState>Cargando...</LoadingState>}
      {error && <ErrorState message={error} />}

      {datos && (
        <>
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
            Esto suma las facturas ya pagadas por cuenta de egreso, con base en los últimos 30 días. No es un saldo bancario de verdad todavía —
            no tenemos saldo inicial ni los depósitos (ventas) por cuenta, así que no se puede calcular cuánto queda disponible, solo lo que ha salido.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <KpiTile label="Total pagado (30 días)" value={formatMoney(totalSalidas)} sub={`${datos.pagadas.length} facturas`} />
            <KpiTile label="Cuentas distintas" value={String(salidasPorCuenta.length)} sub="incluye 'sin cuenta registrada'" />
          </div>

          <Card>
            <SectionHeader title="Por cuenta de pago" sub="Clic para ver el desglose de facturas" />
            {salidasPorCuenta.length === 0 ? (
              <EmptyState>Sin pagos en los últimos 30 días</EmptyState>
            ) : (
              <div className="space-y-1">
                {salidasPorCuenta.map(c => {
                  const abierto = cuentaAbierta === c.cuenta
                  return (
                    <div key={c.cuenta}>
                      <button
                        onClick={() => setCuentaAbierta(abierto ? null : c.cuenta)}
                        className="w-full flex items-center gap-4 py-2.5 rounded-lg hover:bg-gray-50 transition-colors -mx-2 px-2"
                      >
                        <span className={`text-sm font-medium w-40 sm:w-56 flex-shrink-0 truncate text-left ${c.sinDato ? 'text-gray-400 italic' : 'text-gray-700'}`}>{c.cuenta}</span>
                        <MiniBar pct={c.monto / maxSalidaCuenta} color={c.sinDato ? '#d1d5db' : '#7a6020'} />
                        <span className="text-xs text-gray-400 w-16 flex-shrink-0 text-right">{c.facturas.length} fact.</span>
                        <span className="text-sm font-bold text-gray-800 tabular-nums w-24 flex-shrink-0 text-right">{formatMoney(c.monto)}</span>
                      </button>
                      {abierto && (
                        <div className="ml-1 mb-2 pl-3 border-l-2 border-gray-100 space-y-1.5 py-1.5">
                          {c.facturas.map(f => (
                            <button
                              key={f.id}
                              onClick={() => abrirFactura(f)}
                              className="w-full flex items-center justify-between gap-3 text-xs text-left hover:text-gray-900 text-gray-500 transition-colors"
                            >
                              <span className="truncate">#{f.remision} · {f.proveedor} · {fechaCorta(f.fechaPagoVura)}</span>
                              <span className="font-semibold tabular-nums flex-shrink-0">{formatMoney(f.monto)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </>
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
