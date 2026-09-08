import { WARNING } from './shared'
import { DetalleMetrica } from './VentasDetalleMetricaBase'

export default function BIVentasCortesias() {
  return (
    <DetalleMetrica
      campo="cortesias_monto"
      titulo="Cortesías"
      sub="Análisis y desglose de cortesías — nada más"
      color={WARNING}
    />
  )
}
