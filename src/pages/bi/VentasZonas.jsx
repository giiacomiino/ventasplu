import { WARNING } from './shared'
import { DetalleMix } from './VentasDetalleMixBase'

const PALETA_ZONAS = [WARNING, '#9ca3af', '#c49a2e', '#d1d5db']

export default function BIVentasZonas() {
  return (
    <DetalleMix
      tipo="zonas"
      titulo="Comedor vs. para llevar"
      sub="Análisis y desglose de venta por zona — nada más"
      palette={PALETA_ZONAS}
    />
  )
}
