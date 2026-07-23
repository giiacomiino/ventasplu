import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, AlertTriangle } from 'lucide-react'
import { formatMoney } from '../../utils/formatters'
import { llamar, GOLD_RAMP, WARNING } from './shared'
import { Card, SectionHeader, PageHeader, KpiTile, LoadingState, ErrorState, EmptyState } from './ui'

function ProveedorBar({ p, i, max }) {
  const width = (p.totalGastado / max) * 100
  return (
    <div className="py-3 border-b border-gray-50 last:border-0">
      <div className="flex justify-between items-baseline text-sm mb-1.5">
        <span className="font-semibold text-gray-800">{i + 1}. {p.nombre}</span>
        <span className="text-xs text-gray-400">{p.facturas} factura{p.facturas === 1 ? '' : 's'}</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2.5 bg-gray-50 rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${width}%`, background: GOLD_RAMP[i % GOLD_RAMP.length] }} />
        </div>
        <span className="text-sm font-bold text-gray-800 tabular-nums w-28 text-right">{formatMoney(p.totalGastado)}</span>
      </div>
    </div>
  )
}

export default function BIProveedores() {
  const [negocio, setNegocio] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    llamar('resumen-negocio').then(setNegocio).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [])

  const prov = negocio?.proveedores

  return (
    <div className="w-full px-8 py-8 max-w-[1600px] mx-auto space-y-8">
      <div>
        <Link to="/business-intelligence" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-700 mb-3 transition-colors">
          <ArrowLeft size={15} /> Business Intelligence
        </Link>
        <PageHeader title="Proveedores" sub="Gasto y concentración por proveedor, últimos 30 días" />
      </div>

      {loading && <LoadingState>Cargando...</LoadingState>}
      {error && <ErrorState message={error} />}

      {prov && (
        <>
          <div className="grid grid-cols-2 gap-5">
            <KpiTile label="Gasto total (30 días)" value={formatMoney(prov.totalGastado)} sub={`${prov.totalFacturas} facturas`} />
            <KpiTile
              label="Concentración top 3"
              value={prov.concentracionTop3 != null ? `${(prov.concentracionTop3 * 100).toFixed(0)}%` : '—'}
              sub={
                prov.concentracionTop3 >= 0.5 ? (
                  <span className="inline-flex items-center gap-1 font-semibold" style={{ color: WARNING }}>
                    <AlertTriangle size={12} /> Dependencia alta de pocos proveedores
                  </span>
                ) : null
              }
            />
          </div>

          <Card>
            <SectionHeader title="Top proveedores" sub="Últimos 30 días, por fecha de ingreso de factura, sin borradas" />
            {prov.top.length === 0 ? (
              <EmptyState>Sin facturas en el periodo</EmptyState>
            ) : (
              <div>
                {prov.top.map((p, i) => (
                  <ProveedorBar key={p.nombre} p={p} i={i} max={prov.top[0].totalGastado} />
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
