import { Outlet, NavLink } from 'react-router-dom'
import { BarChart2, Sparkles, Users, LogOut } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import vuraLogo from '../assets/vura-logo.png'

export default function AppLayout() {
  const { profile, signOut } = useAuth()

  const linkClass = ({ isActive }) =>
    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive ? 'bg-[#7a6020] text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
    }`

  return (
    <div className="h-screen flex bg-gray-50 overflow-hidden">
      <aside className="w-56 flex-shrink-0 h-full bg-white border-r border-gray-100 flex flex-col">
        <div className="px-5 py-5 flex items-center gap-2.5">
          <img src={vuraLogo} alt="VURA" className="w-8 h-8 object-contain" />
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-tight">VURA BI</h1>
            <p className="text-xs text-gray-400">La Trattoria</p>
          </div>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          <NavLink to="/" end className={linkClass}>
            <BarChart2 size={16} /> Ventas por PLU
          </NavLink>
          <NavLink to="/business-intelligence" className={linkClass}>
            <Sparkles size={16} /> Business Intelligence
          </NavLink>
          {profile?.rol === 'owner' && (
            <NavLink to="/usuarios" className={linkClass}>
              <Users size={16} /> Gestión de usuarios
            </NavLink>
          )}
        </nav>

        <div className="px-3 py-4 border-t border-gray-100">
          <p className="px-3 text-xs text-gray-400 truncate mb-2">
            {profile?.nombre || profile?.email}
          </p>
          <button
            onClick={signOut}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-red-500 hover:bg-red-50 w-full"
          >
            <LogOut size={16} /> Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 h-full overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
