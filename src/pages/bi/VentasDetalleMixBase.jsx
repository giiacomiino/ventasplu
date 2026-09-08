import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatMoney } from '../../utils/formatters'
import { llamar } from './shared'
import { Card, SectionHeader, PageHeader, LoadingState, ErrorState } from './ui'

function Tooltip({ children }) {
  return (
    <div className="absolute -top-2 -translate-y-full z-20 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg pointer-events-none left-1/2 -translate-x-1/2">
      {children}
    </div>
  )
}

function formatK(n) {
  if (n == null) return '—'
  return `$${(n / 1000).toFixed(0)}k`
}

function SelectorAnio({ anio, setAnio }) {
  const anioActual = new Date().getFullYear()
  return (
    <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
      <button onClick={() => setAnio(a => a - 1)} className="text-gray-400 hover:text-gold-700 p-1"><ChevronLeft size={15} /></button>
      <span className="text-sm font-semibold text-gray-700 min-w-[50px] text-center">{anio}</span>
      <button onClick={() => setAnio(a => a + 1)} disabled={anio >= anioActual} className="text-gray-400 hover:text-gold-700 p-1 disabled:opacity-30">
        <ChevronRight size={15} />
      </button>
    </div>
  )
}

function MixDonutGrande({ mix, palette }) {
  const total = mix.reduce((s, i) => s + i.monto, 0)
  const [hover, setHover] = useState(null)
  if (mix.length === 0 || !total) return <p className="text-xs text-gray-300 py-8 text-center">Sin datos todavía</p>

  const R = 68, ri = 44, cx = 80, cy = 80
  let angle = -Math.PI / 2
  const slices = mix.map((item, i) => {
    const pct = item.monto / total
    const s = angle, e = angle + pct * 2 * Math.PI
    angle = e
    const large = pct > 0.5 ? 1 : 0
    const d = [
      `M ${cx + R * Math.cos(s)} ${cy + R * Math.sin(s)}`,
      `A ${R} ${R} 0 ${large} 1 ${cx + R * Math.cos(e)} ${cy + R * Math.sin(e)}`,
      `L ${cx + ri * Math.cos(e)} ${cy + ri * Math.sin(e)}`,
      `A ${ri} ${ri} 0 ${large} 0 ${cx + ri * Math.cos(s)} ${cy + ri * Math.sin(s)}`,
      'Z',
    ].join(' ')
    return { ...item, d, pct, color: palette[i % palette.length], idx: i }
  })

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <svg viewBox="0 0 160 160" width={160} height={160} className="flex-shrink-0">
        {slices.map(s => (
          <path
            key={s.nombre} d={s.d} fill={s.color} stroke="white" strokeWidth={2}
            opacity={hover === null || hover === s.idx ? 1 : 0.4}
            className="cursor-pointer transition-opacity"
            onMouseEnter={() => setHover(s.idx)} onMouseLeave={() => setHover(null)}
          />
        ))}
        <text x={cx} y={cy - 5} textAnchor="middle" fill="#111827" fontSize={16} fontWeight="700" className="tabular-nums">{formatK(total)}</text>
        <text x={cx} y={cy + 13} textAnchor="middle" fill="#9ca3af" fontSize={9}>total del año</text>
      </svg>
      <div className="flex-1 w-full space-y-1.5 min-w-0">
        {slices.map(s => (
          <div
            key={s.nombre}
            className={`flex items-center gap-2 text-sm rounded px-1.5 py-1 transition-colors ${hover === s.idx ? 'bg-gray-50' : ''}`}
            onMouseEnter={() => setHover(s.idx)} onMouseLeave={() => setHover(null)}
          >
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: s.color }} />
            <span className="text-gray-600 truncate flex-1">{s.nombre}</span>
            <span className="text-gray-700 font-semibold tabular-nums flex-shrink-0">{formatMoney(s.monto)}</span>
            <span className="text-gray-400 tabular-nums w-12 text-right flex-shrink-0">{(s.pct * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MixMensualChart({ serieMensual, nombres, palette }) {
  const [hover, setHover] = useState(null)
  const totales = serieMensual.map(m => nombres.reduce((s, n) => s + (m[n] || 0), 0))
  const max = Math.max(...totales, 1) * 1.15

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div style={{ minWidth: '760px' }}>
        <div className="relative h-64 flex items-end gap-2">
          {serieMensual.map((m, i) => {
            const total = totales[i]
            const h = Math.max((total / max) * 100, total ? 4 : 0)
            return (
              <div
                key={m.mes} className="flex-1 h-full flex flex-col justify-end items-center relative cursor-pointer"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              >
                {hover === i && (
                  <Tooltip>
                    <p className="font-semibold capitalize">{m.mes}</p>
                    {nombres.filter(n => m[n] > 0).map(n => (
                      <p key={n} className="text-gray-300 tabular-nums">{n}: {formatMoney(m[n])}</p>
                    ))}
                  </Tooltip>
                )}
                <div className="w-full flex flex-col-reverse rounded-t overflow-hidden transition-opacity" style={{ height: `${h}%`, opacity: hover === i ? 0.75 : 1 }}>
                  {nombres.map((n, ni) => {
                    const val = m[n] || 0
                    if (!val) return null
                    return <div key={n} style={{ height: `${(val / total) * 100}%`, background: palette[ni % palette.length] }} />
                  })}
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex gap-2 mt-2">
          {serieMensual.map(m => <div key={m.mes} className="flex-1 text-center text-[10px] text-gray-400 font-medium capitalize">{m.mes}</div>)}
        </div>
      </div>
    </div>
  )
}

export function DetalleMix({ tipo, titulo, sub, palette }) {
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    llamar('detalle-mix-venta', { tipo, anio }).then(setDatos).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [tipo, anio])

  return (
    <div className="w-full px-4 py-4 sm:px-8 sm:py-8 max-w-[1400px] mx-auto space-y-6">
      <div>
        <Link to="/ventas" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-700 mb-3 transition-colors">
          <ArrowLeft size={15} /> Ventas
        </Link>
        <PageHeader title={titulo} sub={sub} right={<SelectorAnio anio={anio} setAnio={setAnio} />} />
      </div>

      {loading && <LoadingState>Cargando...</LoadingState>}
      {error && <ErrorState message={error} />}

      {datos && (
        <>
          <Card>
            <SectionHeader title={`${titulo} — año completo`} sub={`${datos.anio} · ${formatMoney(datos.total)} en total`} />
            <MixDonutGrande mix={datos.mix} palette={palette} />
          </Card>

          <Card>
            <SectionHeader title="Cómo se mueve mes a mes" sub="Cada barra es el total del mes, repartido entre las opciones" />
            <MixMensualChart serieMensual={datos.serieMensual} nombres={datos.nombres} palette={palette} />
          </Card>
        </>
      )}
    </div>
  )
}
