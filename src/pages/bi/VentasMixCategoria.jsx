import { GOLD_RAMP } from './shared'
import { DetalleMix } from './VentasDetalleMixBase'

export default function BIVentasMixCategoria() {
  return (
    <DetalleMix
      tipo="categorias"
      titulo="Mix por categoría"
      sub="Análisis y desglose de venta por categoría — nada más"
      palette={GOLD_RAMP}
    />
  )
}
