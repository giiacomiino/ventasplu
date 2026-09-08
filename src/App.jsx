import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import AppLayout from './components/AppLayout'
import VentasPlu from './pages/VentasPlu'
import BIOverview from './pages/bi/Overview'
import BusinessIntelligence from './pages/bi/BusinessIntelligence'
import BIVentas from './pages/bi/Ventas'
import BIVentasPlu from './pages/bi/VentasPlu'
import BIPresupuesto from './pages/bi/Presupuesto'
import BIProveedores from './pages/bi/Proveedores'
import Compras from './pages/bi/Compras'
import BICxP from './pages/bi/CxP'
import BICxPFacturas from './pages/bi/CxPFacturas'
import BICxPProveedores from './pages/bi/CxPProveedores'
import BICxPBancos from './pages/bi/CxPBancos'
import BICxPRitmo from './pages/bi/CxPRitmo'
import BICxPPendientes from './pages/bi/CxPPendientes'
import BIRH from './pages/bi/RH'
import BIReporteSemanal from './pages/bi/ReporteSemanal'
import BIFinanciero from './pages/bi/Financiero'
import BITendenciaCierre from './pages/bi/TendenciaCierre'
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

// El owner siempre pasa, sin importar qué haya marcado en permisos —
// es el único que puede asignarlos, así que nunca se puede bloquear a
// sí mismo por accidente.
function SoloPermiso({ seccion }) {
  const { profile } = useAuth()
  const tieneAcceso = profile?.rol === 'owner' || profile?.permisos?.[seccion] === true
  if (profile && !tieneAcceso) return <Navigate to="/" replace />
  return <Outlet />
}

function SoloOwner() {
  const { profile } = useAuth()
  if (profile && profile.rol !== 'owner') return <Navigate to="/" replace />
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
        <Route path="/" element={<VentasPlu />} />

        <Route element={<SoloPermiso seccion="dashboard" />}>
          <Route path="/dashboard" element={<BIOverview />} />
        </Route>

        <Route element={<SoloPermiso seccion="business_intelligence" />}>
          <Route path="/business-intelligence" element={<BusinessIntelligence />} />
        </Route>

        <Route element={<ConMesSeleccionado />}>
          <Route element={<SoloPermiso seccion="ventas" />}>
            <Route path="/ventas" element={<BIVentas />} />
            <Route path="/ventas/plu" element={<BIVentasPlu />} />
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
        </Route>

        <Route element={<SoloPermiso seccion="pagos" />}>
          <Route path="/pagos" element={<BICxP />} />
          <Route path="/pagos/facturas" element={<BICxPFacturas />} />
          <Route path="/pagos/proveedores" element={<BICxPProveedores />} />
          <Route path="/pagos/bancos" element={<BICxPBancos />} />
          <Route path="/pagos/pendientes" element={<BICxPPendientes />} />
        </Route>

        <Route element={<SoloPermiso seccion="rh" />}>
          <Route path="/rh" element={<BIRH />} />
          <Route path="/rh/reporte-semanal" element={<BIReporteSemanal />} />
        </Route>

        <Route element={<SoloPermiso seccion="compras" />}>
          <Route path="/compras" element={<Compras />} />
        </Route>

        <Route element={<SoloOwner />}>
          <Route path="/usuarios" element={<Usuarios />} />
        </Route>
      </Route>
    </Routes>
  )
}
