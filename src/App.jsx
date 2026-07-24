import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import AppLayout from './components/AppLayout'
import VentasPlu from './pages/VentasPlu'
import BIOverview from './pages/bi/Overview'
import BIVentas from './pages/bi/Ventas'
import BIPresupuesto from './pages/bi/Presupuesto'
import BIProveedores from './pages/bi/Proveedores'
import BIPagos from './pages/bi/Pagos'
import BIVentasPlu from './pages/bi/VentasPlu'
import BIRH from './pages/bi/RH'
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

function SoloRoles({ roles }) {
  const { profile } = useAuth()
  if (profile && !roles.includes(profile.rol)) return <Navigate to="/" replace />
  return <Outlet />
}

function ConMesSeleccionado() {
  return (
    <MesProvider>
      <Outlet />
    </MesProvider>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protegida><AppLayout /></Protegida>}>
        <Route path="/" element={<VentasPlu />} />

        <Route element={<SoloRoles roles={['owner', 'admin']} />}>
          <Route element={<ConMesSeleccionado />}>
            <Route path="/business-intelligence" element={<BIOverview />} />
            <Route path="/business-intelligence/ventas" element={<BIVentas />} />
            <Route path="/business-intelligence/presupuesto" element={<BIPresupuesto />} />
            <Route path="/business-intelligence/proveedores" element={<BIProveedores />} />
            <Route path="/business-intelligence/pagos" element={<BIPagos />} />
            <Route path="/business-intelligence/ventas-plu" element={<BIVentasPlu />} />
            <Route path="/business-intelligence/rh" element={<BIRH />} />
            <Route path="/business-intelligence/financiero" element={<BIFinanciero />} />
            <Route path="/business-intelligence/tendencia-cierre" element={<BITendenciaCierre />} />
          </Route>
        </Route>

        <Route element={<SoloRoles roles={['owner']} />}>
          <Route path="/usuarios" element={<Usuarios />} />
        </Route>
      </Route>
    </Routes>
  )
}
