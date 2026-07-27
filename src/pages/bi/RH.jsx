import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { formatMoney } from '../../utils/formatters'
import { llamar, GOLD_RAMP } from './shared'
import { Card, SectionHeader, PageHeader, KpiTile, LoadingState, ErrorState } from './ui'

function BarraHorizontal({ nombre, valor, max }) {
  const width = (valor / max) * 100
  return (
    <div className="py-2.5 border-b border-gray-50 last:border-0">
      <div className="flex justify-between text-sm mb-1.5">
        <span className="font-medium text-gray-700">{nombre}</span>
        <span className="font-bold text-gray-600 tabular-nums">{valor}</span>
      </div>
      <div className="h-2 bg-gray-50 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${width}%`, background: GOLD_RAMP[1] }} />
      </div>
    </div>
  )
}

export default function BIRH() {
  const [rh, setRh] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    llamar('resumen-rh').then(setRh).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [])

  return (
    <div className="w-full px-4 py-4 sm:px-8 sm:py-8 max-w-[1600px] mx-auto space-y-8">
      <div>
        <Link to="/business-intelligence" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-700 mb-3 transition-colors">
          <ArrowLeft size={15} /> Business Intelligence
        </Link>
        <PageHeader title="Recursos Humanos" sub="Headcount, rotación y nómina estimada" />
      </div>

      {loading && <LoadingState>Cargando...</LoadingState>}
      {error && <ErrorState message={error} />}

      {rh && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
            <KpiTile label="Headcount activo" value={rh.headcountActivo} />
            <KpiTile
              label="Rotación del año"
              value={rh.rotacionAnual != null ? `${(rh.rotacionAnual * 100).toFixed(0)}%` : '—'}
              sub={`${rh.bajasDelAnio} bajas este año*`}
            />
            <KpiTile
              label="Antigüedad promedio"
              value={rh.antiguedadPromedio != null ? `${rh.antiguedadPromedio.toFixed(1)} años` : '—'}
            />
            <KpiTile
              label="Nómina estimada / mes"
              value={formatMoney(rh.nominaEstimadaMensual)}
              sub="Headcount activo × sueldo diario × 30"
            />
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            *Rotación aproximada: bajas cuyo último cambio de estatus fue este año — Bubble no expone una fecha de baja explícita.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <Card>
              <SectionHeader title="Headcount por área" sub="Solo empleados activos" />
              <div>
                {rh.hcPorArea.map(a => (
                  <BarraHorizontal key={a.nombre} nombre={a.nombre} valor={a.headcount} max={rh.hcPorArea[0]?.headcount || 1} />
                ))}
              </div>
            </Card>

            <Card padded={false}>
              <div className="p-6 pb-4">
                <SectionHeader title="Headcount por puesto" sub="Nómina estimada mensual por puesto" />
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Puesto</th>
                    <th className="text-right px-6 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Headcount</th>
                    <th className="text-right px-6 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Nómina est.</th>
                  </tr>
                </thead>
                <tbody>
                  {rh.hcPorPuesto.map(p => (
                    <tr key={p.nombre} className="border-b border-gray-50 last:border-0">
                      <td className="px-6 py-3 text-gray-700 font-medium">{p.nombre}</td>
                      <td className="px-6 py-3 text-right text-gray-500 tabular-nums">{p.headcount}</td>
                      <td className="px-6 py-3 text-right font-bold text-gray-800 tabular-nums">{formatMoney(p.nominaEstimadaMensual)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
