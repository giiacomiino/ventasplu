import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, AlertTriangle, Clock } from 'lucide-react'
import { formatMoney } from '../../utils/formatters'
import { llamar, CRITICAL, WARNING } from './shared'
import { Card, SectionHeader, PageHeader, KpiTile, LoadingState, ErrorState, EmptyState } from './ui'

export default function BIPagos() {
  const [pagos, setPagos] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    llamar('resumen-pagos').then(setPagos).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [])

  return (
    <div className="w-full px-8 py-8 max-w-[1600px] mx-auto space-y-8">
      <div>
        <Link to="/business-intelligence" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-700 mb-3 transition-colors">
          <ArrowLeft size={15} /> Business Intelligence
        </Link>
        <PageHeader title="Cuentas por pagar" sub="Facturas de proveedores pendientes de pago" />
      </div>

      {loading && <LoadingState>Cargando...</LoadingState>}
      {error && <ErrorState message={error} />}

      {pagos && (
        <>
          <div className="grid grid-cols-3 gap-5">
            <KpiTile label="Total pendiente" value={formatMoney(pagos.totalPendiente)} sub={`${pagos.totalFacturas} facturas`} />
            <KpiTile
              label="Vencido"
              value={<span style={{ color: pagos.totalVencido > 0 ? CRITICAL : undefined }}>{formatMoney(pagos.totalVencido)}</span>}
              sub={
                pagos.facturasVencidas > 0 ? (
                  <span className="inline-flex items-center gap-1 font-semibold" style={{ color: CRITICAL }}>
                    <AlertTriangle size={12} /> {pagos.facturasVencidas} facturas vencidas
                  </span>
                ) : (
                  <span className="text-gray-400">Sin facturas vencidas</span>
                )
              }
            />
            <KpiTile
              label="Próximos 7 días"
              value={<span style={{ color: pagos.totalProximos7 > 0 ? WARNING : undefined }}>{formatMoney(pagos.totalProximos7)}</span>}
              sub={
                pagos.facturasProximos7 > 0 && (
                  <span className="inline-flex items-center gap-1 text-gray-400">
                    <Clock size={12} /> {pagos.facturasProximos7} facturas
                  </span>
                )
              }
            />
          </div>

          <Card padded={false}>
            <div className="p-6 pb-4">
              <SectionHeader title="Pendiente por proveedor" />
            </div>
            {pagos.porProveedor.length === 0 ? (
              <div className="px-6 pb-6"><EmptyState>Sin pendientes</EmptyState></div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Proveedor</th>
                    <th className="text-right px-6 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Facturas</th>
                    <th className="text-right px-6 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {pagos.porProveedor.map(p => (
                    <tr key={p.nombre} className="border-b border-gray-50 last:border-0">
                      <td className="px-6 py-3 text-gray-700 font-medium">{p.nombre}</td>
                      <td className="px-6 py-3 text-xs text-gray-400 text-right">{p.facturas}</td>
                      <td className="px-6 py-3 font-bold text-gray-800 text-right tabular-nums">{formatMoney(p.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
