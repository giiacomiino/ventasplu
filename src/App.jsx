import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import AppLayout from './components/AppLayout'
import VentasPlu from './pages/VentasPlu'
import BIOverview from './pages/bi/Overview'
import BusinessIntelligence from './pages/bi/BusinessIntelligence'
import BIVentasOverview from './pages/bi/VentasOverview'
import BIVentasTendencia from './pages/bi/VentasTendencia'
import BIVentasCancelaciones from './pages/bi/VentasCancelaciones'
import BIVentasCortesias from './pages/bi/VentasCortesias'
import BIVentasMixCategoria from './pages/bi/VentasMixCategoria'
import BIVentasZonas from './pages/bi/VentasZonas'
import BIVentasFormasPago from './pages/bi/VentasFormasPago'
import BIVentasPlu from './pages/bi/VentasPlu'
import BIPresupuesto from './pages/bi/Presupuesto'
import BIProveedores from './pages/bi/Proveedores'
import Compras from './pages/bi/Compras'
import BICxP from './pages/bi/CxP'
import BICxPFacturas from './pages/bi/CxPFacturas'
import BICxPProveedores from './pages/bi/CxPProveedores'
import BICxPBancos from './pages/bi/CxPBancos'
import BICxPDepositos from './pages/bi/CxPDepositos'
import BICxPRitmo from './pages/bi/CxPRitmo'
import BICxPPendientes from './pages/bi/CxPPendientes'
import BIRH from './pages/bi/RH'
import BIRHRotacion from './pages/bi/RHRotacion'
import BIRHAsistencia from './pages/bi/RHAsistencia'
import BIReporteSemanal from './pages/bi/ReporteSemanal'
import BIFinanciero from './pages/bi/Financiero'
import BITendenciaCierre from './pages/bi/TendenciaCierre'
import ReporteVentaDiaria from './pages/bi/ReporteVentaDiaria'
import Login from './pages/Login'
import Usuarios from './pages/Usuarios'
import { MesProvider } from './pages/bi/mesContext'
import './index.css'

function Protegida({ children }) {
  const { session, loading } = useAuth()
  if (loading) return null
  if (!session) return <Navigate to="/login" replace />
  return children
}

// Orden de preferencia para mandar a alguien a "algo que sí pueda ver"
// cuando cae en una ruta sin permiso — ya no podemos mandar todo a "/"
// a secas porque "/" (Ventas por PLU) también es un apartado con permiso.
const ORDEN_APARTADOS = [
  { seccion: 'ventas_plu', ruta: '/' },
  { seccion: 'dashboard', ruta: '/dashboard' },
  { seccion: 'ventas', ruta: '/ventas' },
  { seccion: 'pagos', ruta: '/pagos' },
  { seccion: 'compras', ruta: '/compras' },
  { seccion: 'proveedores', ruta: '/proveedores' },
  { seccion: 'presupuesto', ruta: '/presupuesto' },
  { seccion: 'rh', ruta: '/rh' },
  { seccion: 'pnl', ruta: '/pnl' },
  { seccion: 'business_intelligence', ruta: '/business-intelligence' },
]

function rutaDisponible(profile) {
  return ORDEN_APARTADOS.find(a => profile?.permisos?.[a.seccion] === true)?.ruta ?? null
}

function SinAcceso() {
  const { signOut } = useAuth()
  return (
    <div className="h-screen flex flex-col items-center justify-center gap-3 text-center px-6">
      <p className="text-gray-700 font-semibold">Todavía no tienes acceso a ningún apartado.</p>
      <p className="text-sm text-gray-400">Pídele al owner que te asigne permisos en Gestión de usuarios.</p>
      <button onClick={signOut} className="text-sm font-semibold text-red-500 hover:underline mt-2">Cerrar sesión</button>
    </div>
  )
}

// El owner siempre pasa, sin importar qué haya marcado en permisos —
// es el único que puede asignarlos, así que nunca se puede bloquear a
// sí mismo por accidente.
function SoloPermiso({ seccion }) {
  const { profile } = useAuth()
  const secciones = Array.isArray(seccion) ? seccion : [seccion]
  const tieneAcceso = profile?.rol === 'owner' || secciones.some(s => profile?.permisos?.[s] === true)
  if (profile && !tieneAcceso) {
    const destino = rutaDisponible(profile)
    return destino ? <Navigate to={destino} replace /> : <SinAcceso />
  }
  return <Outlet />
}

function SoloOwner() {
  const { profile } = useAuth()
  if (profile && profile.rol !== 'owner') {
    const destino = rutaDisponible(profile)
    return destino ? <Navigate to={destino} replace /> : <SinAcceso />
  }
  return <Outlet />
}

function ConMesSeleccionado() {
  return (
    <MesProvider>
      <Outlet />
    </MesProvider>
  )
}

// Cada módulo (Ventas, Pagos, Compras, Proveedores, Presupuesto, RH, P&L) es
// una sección hermana con su propia URL — igual que en VURA. El acceso a
// cada una se controla por permiso individual (profiles.permisos), no por
// un rol fijo — el owner asigna por checkbox quién ve qué.
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protegida><AppLayout /></Protegida>}>
        <Route element={<SoloPermiso seccion="ventas_plu" />}>
          <Route path="/" element={<VentasPlu />} />
        </Route>

        <Route element={<SoloPermiso seccion={['dashboard', 'ventas', 'pagos', 'rh', 'proveedores', 'presupuesto', 'pnl']} />}>
          <Route path="/dashboard" element={<BIOverview />} />
        </Route>

        <Route element={<SoloPermiso seccion="business_intelligence" />}>
          <Route path="/business-intelligence" element={<BusinessIntelligence />} />
        </Route>

        <Route element={<ConMesSeleccionado />}>
          <Route element={<SoloPermiso seccion="ventas" />}>
            <Route path="/ventas" element={<BIVentasOverview />} />
            <Route path="/ventas/tendencia" element={<BIVentasTendencia />} />
            <Route path="/ventas/cancelaciones" element={<BIVentasCancelaciones />} />
            <Route path="/ventas/cortesias" element={<BIVentasCortesias />} />
            <Route path="/ventas/mix-categoria" element={<BIVentasMixCategoria />} />
            <Route path="/ventas/zonas" element={<BIVentasZonas />} />
            <Route path="/ventas/formas-pago" element={<BIVentasFormasPago />} />
            <Route path="/ventas/plu" element={<BIVentasPlu />} />
            <Route path="/ventas/reporte-diario" element={<ReporteVentaDiaria />} />
          </Route>

          <Route element={<SoloPermiso seccion="presupuesto" />}>
            <Route path="/presupuesto" element={<BIPresupuesto />} />
          </Route>

          <Route element={<SoloPermiso seccion="proveedores" />}>
            <Route path="/proveedores" element={<BIProveedores />} />
          </Route>

          <Route element={<SoloPermiso seccion="pnl" />}>
            <Route path="/pnl" element={<BIFinanciero />} />
            <Route path="/pnl/tendencia-cierre" element={<BITendenciaCierre />} />
          </Route>

          <Route element={<SoloPermiso seccion="pagos" />}>
            <Route path="/pagos/ritmo" element={<BICxPRitmo />} />
          </Route>

          <Route element={<SoloPermiso seccion="rh" />}>
            <Route path="/rh" element={<BIRH />} />
          </Route>
        </Route>

        <Route element={<SoloPermiso seccion="pagos" />}>
          <Route path="/pagos" element={<BICxP />} />
          <Route path="/pagos/facturas" element={<BICxPFacturas />} />
          <Route path="/pagos/proveedores" element={<BICxPProveedores />} />
          <Route path="/pagos/bancos" element={<BICxPBancos />} />
          <Route path="/pagos/depositos" element={<BICxPDepositos />} />
          <Route path="/pagos/pendientes" element={<BICxPPendientes />} />
        </Route>

        <Route element={<SoloPermiso seccion="rh" />}>
          <Route path="/rh/rotacion" element={<BIRHRotacion />} />
          <Route path="/rh/asistencia" element={<BIRHAsistencia />} />
        </Route>

        <Route element={<SoloPermiso seccion="compras" />}>
          <Route path="/compras" element={<Compras />} />
        </Route>

        <Route element={<SoloOwner />}>
          <Route path="/usuarios" element={<Usuarios />} />
          <Route path="/rh/reporte-semanal" element={<BIReporteSemanal />} />
        </Route>
      </Route>
    </Routes>
  )
}
