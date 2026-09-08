import { Sparkles } from 'lucide-react'
import { Card, PageHeader } from './ui'

export default function BusinessIntelligence() {
  return (
    <div className="w-full px-4 py-4 sm:px-8 sm:py-8 max-w-[1600px] mx-auto space-y-6">
      <PageHeader title="Business Intelligence" sub="Análisis cruzado entre módulos — todavía por definir" />
      <Card className="flex flex-col items-center text-center py-16 gap-3">
        <Sparkles size={28} className="text-gray-300" />
        <p className="text-sm text-gray-500 max-w-md">
          Este va a ser el apartado de análisis de verdad (cruces entre ventas, gasto, nómina, etc.),
          separado de cada módulo operativo. Mientras lo definimos, cada módulo (Ventas, Pagos, RH...)
          ya tiene su propio análisis en su sección.
        </p>
      </Card>
    </div>
  )
}
