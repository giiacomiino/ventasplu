import { DetalleMix } from './VentasDetalleMixBase'

const PALETA_PAGOS = ['#5b7fb8', '#8a5a3a', '#c49a2e', '#6b9080', '#9ca3af', '#d1d5db']

export default function BIVentasFormasPago() {
  return (
    <DetalleMix
      tipo="pagos"
      titulo="Formas de pago"
      sub="Análisis y desglose de formas de pago — nada más"
      palette={PALETA_PAGOS}
    />
  )
}
