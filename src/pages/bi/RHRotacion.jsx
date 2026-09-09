import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { llamar, CRITICAL, GOOD, GOLD_RAMP } from './shared'
import { Card, PageHeader, KpiTile, SectionHeader, LoadingState, ErrorState, EmptyState } from './ui'

function colorRotacion(pct) {
  if (pct == null) return '#9ca3af'
  if (pct >= 0.5) return CRITICAL
  if (pct >= 0.25) return '#ec835a'
  return GOOD
}

export default function BIRHRotacion() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [areaSel, setAreaSel] = useState(null)

  useEffect(() => {
    llamar('rh-rotacion').then(d => {
      setDatos(d)
      if (d.areas?.length) setAreaSel(d.areas[0].area)
    }).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [])

  const area = datos?.areas?.find(a => a.area === areaSel)

  return (
    <div className="w-full px-4 py-4 sm:px-8 sm:py-8 max-w-[1600px] mx-auto space-y-8">
      <div>
        <Link to="/rh" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-700 mb-3 transition-colors">
          <ArrowLeft size={15} /> RH
        </Link>
        <PageHeader
          title="Rotación por área"
          sub="Desglose de rotación y colaboradores por área y puesto"
          right={datos?.areas?.length ? (
            <select
              value={areaSel ?? ''}
              onChange={e => setAreaSel(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 bg-white"
            >
              {datos.areas.map(a => <option key={a.area} value={a.area}>{a.area}</option>)}
            </select>
          ) : null}
        />
      </div>

      {loading && <LoadingState>Cargando...</LoadingState>}
      {error && <ErrorState message={error} />}

      {area && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <KpiTile label="Activos" value={area.activos} />
            <KpiTile label="Bajas del año" value={area.bajasDelAnio} />
            <KpiTile
              label="Rotación"
              value={area.rotacion != null ? `${(area.rotacion * 100).toFixed(1)}%` : '—'}
              sub="del año en curso"
            />
          </div>

          <Card>
            <SectionHeader title="Por puesto" sub={`Dentro de ${area.area}`} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {area.porPuesto.map(p => (
                <div key={p.puesto} className="rounded-xl bg-gray-50 px-4 py-3">
                  <p className="text-xs font-bold text-gray-700 truncate">{p.puesto}</p>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-lg font-bold text-gray-900 tabular-nums">{p.activos}</span>
                    <span className="text-xs font-semibold tabular-nums" style={{ color: colorRotacion(p.rotacion) }}>
                      {p.rotacion != null ? `${(p.rotacion * 100).toFixed(0)}%` : '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card padded={false}>
            <div className="p-6 pb-4">
              <SectionHeader title="Lista de colaboradores" sub={`${area.colaboradores.length} en ${area.area}`} />
            </div>
            {area.colaboradores.length === 0 ? (
              <EmptyState>Sin colaboradores registrados en esta área.</EmptyState>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Nombre</th>
                    <th className="text-left px-6 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Puesto</th>
                    <th className="text-right px-6 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Antigüedad</th>
                    <th className="text-right px-6 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Vacaciones</th>
                    <th className="text-right px-6 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Disponibles</th>
                    <th className="text-right px-6 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Estatus</th>
                  </tr>
                </thead>
                <tbody>
                  {area.colaboradores.map((c, i) => (
                    <tr key={`${c.nombre}-${i}`} className="border-b border-gray-50 last:border-0">
                      <td className="px-6 py-3 text-gray-700 font-medium">{c.nombre}</td>
                      <td className="px-6 py-3 text-gray-500">{c.puesto}</td>
                      <td className="px-6 py-3 text-right text-gray-500 tabular-nums">{c.antiguedadMeses} meses</td>
                      <td className="px-6 py-3 text-right text-gray-500 tabular-nums">
                        {c.vacaciones ? `${c.vacaciones.correspondientes} días` : '—'}
                      </td>
                      <td className="px-6 py-3 text-right font-bold tabular-nums" style={{ color: c.vacaciones ? GOLD_RAMP[1] : '#9ca3af' }}>
                        {c.vacaciones ? `${c.vacaciones.disponibles} días` : '—'}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span
                          className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold"
                          style={{
                            background: c.estatus === 'Activo' ? `${GOOD}1a` : '#f3f4f6',
                            color: c.estatus === 'Activo' ? GOOD : '#6b7280',
                          }}
                        >
                          {c.estatus}
                        </span>
                      </td>
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
