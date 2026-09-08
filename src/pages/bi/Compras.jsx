import { useState } from 'react'
import { ShoppingCart, Plus, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { refrescarBI } from './shared'
import { Card, PageHeader } from './ui'
import { ModalRegistrarFactura } from './cxpShared'

export default function Compras() {
  const { profile } = useAuth()
  const [modalRegistro, setModalRegistro] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)
  const [mensajeSync, setMensajeSync] = useState('')

  async function sincronizarDesdeBubble() {
    setSincronizando(true)
    setMensajeSync('')
    try {
      const { data, error } = await supabase.functions.invoke('sync-proveedores-bubble')
      if (error) {
        const detalle = await error.context?.json?.().catch(() => null)
        throw new Error(detalle?.error || error.message)
      }
      if (data?.error) throw new Error(data.error)
      setMensajeSync(`${data.sincronizados} proveedores sincronizados desde Bubble`)
      refrescarBI()
    } catch (e) {
      setMensajeSync(e.message)
    }
    setSincronizando(false)
  }

  return (
    <div className="w-full px-4 py-4 sm:px-8 sm:py-8 max-w-[1600px] mx-auto space-y-6">
      <PageHeader
        title="Compras"
        sub="Este apartado todavía está por definir"
        right={
          <button
            onClick={() => setModalRegistro(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#7a6020] text-white rounded-lg text-sm font-semibold hover:bg-[#5c4718] transition-colors"
          >
            <Plus size={15} /> Registrar factura
          </button>
        }
      />

      <Card className="flex flex-col items-center text-center py-16 gap-3">
        <ShoppingCart size={28} className="text-gray-300" />
        <p className="text-sm text-gray-500 max-w-md">
          Este va a ser el apartado real de Compras (inventario, órdenes, etc.), todavía por definir.
          Mientras tanto, usa el botón de arriba para registrar una factura nueva.
        </p>
        {profile?.rol === 'owner' && (
          <div className="mt-2">
            <button
              onClick={sincronizarDesdeBubble} disabled={sincronizando}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-800 disabled:opacity-50"
            >
              <RefreshCw size={13} className={sincronizando ? 'animate-spin' : ''} />
              {sincronizando ? 'Sincronizando...' : 'Sincronizar catálogo de proveedores desde Bubble'}
            </button>
            {mensajeSync && <p className="text-[11px] text-gray-400 mt-1">{mensajeSync}</p>}
          </div>
        )}
      </Card>

      {modalRegistro && (
        <ModalRegistrarFactura
          onClose={() => setModalRegistro(false)}
          onRegistrada={() => setModalRegistro(false)}
        />
      )}
    </div>
  )
}
