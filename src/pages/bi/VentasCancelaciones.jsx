import { CRITICAL } from './shared'
import { DetalleMetrica } from './VentasDetalleMetricaBase'

export default function BIVentasCancelaciones() {
  return (
    <DetalleMetrica
      campo="cancelaciones"
      titulo="Cancelaciones"
      sub="Análisis y desglose de cancelaciones — nada más"
      color={CRITICAL}
    />
  )
}
