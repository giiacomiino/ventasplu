import { useState } from 'react'
import { formatMoney } from '../../utils/formatters'
import { GOLD_RAMP } from './shared'

function formatK(n) {
  if (n == null) return '—'
  return `$${(n / 1000).toFixed(0)}k`
}

function Tooltip({ children }) {
  return (
    <div className="absolute -top-2 -translate-y-full z-20 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg pointer-events-none left-1/2 -translate-x-1/2">
      {children}
    </div>
  )
}

// Los 12 meses del año: sólido = venta real (días que ya pasaron), con
// borde punteado y relleno transparente = pronóstico (promedio histórico
// de venta por día de la semana, para los días/meses que todavía no
// llegan). El mes en curso queda partido: la parte de abajo ya pasó
// (sólida) y la de arriba es lo que falta proyectado (punteada) — se ve
// como una sola barra creciendo con las dos texturas.
export function PronosticoAnualChart({ meses }) {
  const [hover, setHover] = useState(null)
  const valores = meses.map(m => (m.real ?? 0) + (m.proyectado ?? 0))
  const max = Math.max(...valores, 1) * 1.15

  return (
    <div>
      <div className="overflow-x-auto -mx-1 px-1">
        <div style={{ minWidth: '760px' }}>
          <div className="relative h-72 flex items-end gap-2">
            {meses.map((m, i) => {
              const alturaReal = m.real != null ? Math.max((m.real / max) * 100, m.real ? 4 : 0) : 0
              const alturaProyectado = m.proyectado != null ? Math.max((m.proyectado / max) * 100, m.proyectado ? 4 : 0) : 0
              const total = (m.real ?? 0) + (m.proyectado ?? 0)
              return (
                <div
                  key={m.mes}
                  className="flex-1 h-full flex flex-col justify-end items-center relative cursor-pointer"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                >
                  {hover === i && (
                    <Tooltip>
                      <p className="font-semibold capitalize">{m.mes}</p>
                      {m.real != null && <p className="text-gray-300 tabular-nums">Real: {formatMoney(m.real)}</p>}
                      {m.proyectado != null && <p className="text-gray-300 tabular-nums">Pronóstico: {formatMoney(m.proyectado)}</p>}
                    </Tooltip>
                  )}
                  {alturaProyectado > 0 && (
                    <div
                      className="w-full rounded-t border-2 border-dashed relative transition-opacity"
                      style={{ height: `${alturaProyectado}%`, borderColor: GOLD_RAMP[1], background: `${GOLD_RAMP[1]}1f`, opacity: hover === i ? 0.7 : 1 }}
                    >
                      {alturaReal === 0 && (
                        <span className="absolute top-1/2 left-0 right-0 -translate-y-1/2 text-center text-[10px] font-bold whitespace-nowrap tabular-nums" style={{ color: GOLD_RAMP[1] }}>
                          {formatK(total)}
                        </span>
                      )}
                    </div>
                  )}
                  {alturaReal > 0 && (
                    <div
                      className={`w-full relative transition-opacity ${alturaProyectado > 0 ? '' : 'rounded-t'}`}
                      style={{ height: `${alturaReal}%`, background: GOLD_RAMP[1], opacity: hover === i ? 0.75 : 1 }}
                    >
                      <span className="absolute top-1/2 left-0 right-0 -translate-y-1/2 text-center text-[10px] font-bold text-white whitespace-nowrap tabular-nums">
                        {formatK(total)}
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div className="flex gap-2 mt-2">
            {meses.map(m => (
              <div key={m.mes} className="flex-1 text-center text-[10px] text-gray-400 font-medium capitalize">{m.mes}</div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: GOLD_RAMP[1] }} /> Venta real
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm border-2 border-dashed" style={{ borderColor: GOLD_RAMP[1], background: `${GOLD_RAMP[1]}1f` }} />
          Pronóstico (promedio histórico por día de la semana)
        </span>
      </div>
    </div>
  )
}
