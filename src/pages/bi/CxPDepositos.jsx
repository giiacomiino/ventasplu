import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Landmark, Save } from 'lucide-react'
import { formatMoney } from '../../utils/formatters'
import { llamar, GOOD, WARNING } from './shared'
import { supabase } from '../../lib/supabase'
import { Card, PageHeader, LoadingState, ErrorState } from './ui'

function FilaConfig({ fp, cuentas, onGuardado }) {
  const [cuenta, setCuenta] = useState(fp.cuenta_banco ?? '')
  const [dias, setDias] = useState(fp.dias_dispersion ?? '')
  const [guardando, setGuardando] = useState(false)

  const cambiado = cuenta !== (fp.cuenta_banco ?? '') || String(dias) !== String(fp.dias_dispersion ?? '')

  async function guardar() {
    setGuardando(true)
    try {
      const { error } = await supabase.functions.invoke('config-formas-pago', {
        body: {
          action: 'save',
          codigo: fp.codigo,
          descripcion: fp.descripcion,
          cuenta_banco: cuenta || null,
          dias_dispersion: dias === '' ? null : Number(dias),
        },
      })
      if (error) throw new Error(error.message)
      onGuardado()
    } catch {
      // el error se ve reflejado en que no cambia el estado "guardado" — se
      // puede reintentar sin perder lo capturado
    }
    setGuardando(false)
  }

  return (
    <tr className="border-b border-gray-50 last:border-0">
      <td className="px-3 py-2 text-xs text-gray-400 tabular-nums">{fp.codigo}</td>
      <td className="px-3 py-2 text-sm text-gray-700">{fp.descripcion || <span className="text-gray-300">—</span>}</td>
      <td className="px-3 py-2">
        <select value={cuenta} onChange={e => setCuenta(e.target.value)} className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white">
          <option value="">Sin asignar</option>
          {cuentas.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </td>
      <td className="px-3 py-2">
        <input
          type="number" min="0" value={dias} onChange={e => setDias(e.target.value)}
          placeholder="días" className="w-20 px-2 py-1.5 border border-gray-200 rounded-lg text-xs tabular-nums"
        />
      </td>
      <td className="px-3 py-2 w-10">
        {cambiado && (
          <button onClick={guardar} disabled={guardando} className="text-gray-400 hover:text-[#7a6020] disabled:opacity-40">
            <Save size={15} />
          </button>
        )}
      </td>
    </tr>
  )
}

export default function BICxPDepositos() {
  const [formasPago, setFormasPago] = useState(null)
  const [cuentas, setCuentas] = useState([])
  const [depositos, setDepositos] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  function cargar() {
    setLoading(true)
    Promise.all([
      supabase.functions.invoke('config-formas-pago', { body: { action: 'list' } }),
      llamar('pagos-cxp'),
      supabase.functions.invoke('depositos-proyectados'),
    ]).then(([configRes, pagosCxp, depositosRes]) => {
      if (configRes.error) throw new Error(configRes.error.message)
      if (depositosRes.error) throw new Error(depositosRes.error.message)
      setFormasPago(configRes.data.formasPago)
      setCuentas(pagosCxp.cuentasBancarias ?? [])
      setDepositos(depositosRes.data)
    }).catch(e => setError(e.message)).finally(() => setLoading(false))
  }

  useEffect(cargar, [])

  return (
    <div className="w-full px-4 py-4 sm:px-8 sm:py-8 max-w-[1200px] mx-auto space-y-6">
      <div>
        <Link to="/pagos/bancos" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-700 mb-3 transition-colors">
          <ArrowLeft size={15} /> Salidas por cuenta
        </Link>
        <PageHeader
          title="Depósitos proyectados"
          sub="Qué forma de pago cae a qué cuenta, y cuánto ya debería estar depositado vs. en camino"
        />
      </div>

      {loading && <LoadingState>Cargando...</LoadingState>}
      {error && <ErrorState message={error} />}

      {depositos && (
        <Card>
          <h2 className="text-sm font-bold text-gray-900 mb-3">Por cuenta (últimos 60 reportes)</h2>
          {depositos.cuentas.length === 0 ? (
            <p className="text-xs text-gray-300">Todavía no hay formas de pago configuradas con cuenta — llena la tabla de abajo</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {depositos.cuentas.map(c => (
                <div key={c.cuenta} className="bg-gray-50 rounded-xl px-4 py-3.5">
                  <div className="flex items-center gap-2 mb-2">
                    <Landmark size={14} className="text-[#7a6020]" />
                    <p className="text-sm font-semibold text-gray-700">{c.cuenta}</p>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <div>
                      <p className="text-[11px] text-gray-400 uppercase tracking-wide">Ya depositado</p>
                      <p className="text-base font-bold tabular-nums" style={{ color: GOOD }}>{formatMoney(c.depositado)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-gray-400 uppercase tracking-wide">En camino</p>
                      <p className="text-base font-bold tabular-nums" style={{ color: WARNING }}>{formatMoney(c.pendiente)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {depositos.sinConfigurar > 0 && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-4">
              {formatMoney(depositos.sinConfigurar)} en formas de pago todavía sin cuenta asignada — configúralas abajo para que se sumen aquí.
            </p>
          )}
        </Card>
      )}

      {formasPago && (
        <Card>
          <h2 className="text-sm font-bold text-gray-900 mb-1">Configuración por forma de pago</h2>
          <p className="text-xs text-gray-400 mb-3">A qué cuenta cae y cuántos días tarda en reflejarse — dejar sin cuenta si no aplica (ej. descuentos, entradas/salidas de efectivo).</p>
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Código', 'Descripción', 'Cuenta', 'Días', ''].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {formasPago.map(fp => (
                  <FilaConfig key={fp.codigo} fp={fp} cuentas={cuentas} onGuardado={cargar} />
                ))}
                {formasPago.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-300 text-sm">Sube al menos un reporte de venta para ver sus formas de pago aquí</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
