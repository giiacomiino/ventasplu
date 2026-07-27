import { useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { BarChart2, Sparkles, Users, LogOut, Menu, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import vuraLogo from '../assets/vura-logo.png'

function NavLinks({ profile, linkClass, onNavigate }) {
  return (
    <nav className="flex-1 px-3 space-y-1">
      <NavLink to="/" end className={linkClass} onClick={onNavigate}>
        <BarChart2 size={16} /> Ventas por PLU
      </NavLink>
      {(profile?.rol === 'owner' || profile?.rol === 'admin') && (
        <NavLink to="/business-intelligence" className={linkClass} onClick={onNavigate}>
          <Sparkles size={16} /> Business Intelligence
        </NavLink>
      )}
      {profile?.rol === 'owner' && (
        <NavLink to="/usuarios" className={linkClass} onClick={onNavigate}>
          <Users size={16} /> Gestión de usuarios
        </NavLink>
      )}
    </nav>
  )
}

export default function AppLayout() {
  const { profile, signOut } = useAuth()
  const [menuAbierto, setMenuAbierto] = useState(false)

  const linkClass = ({ isActive }) =>
    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive ? 'bg-[#7a6020] text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
    }`

  return (
    <div className="h-screen flex flex-col md:flex-row bg-gray-50 overflow-hidden print:block print:h-auto print:bg-white">
      {/* Header móvil: logo + botón de menú, reemplaza al sidebar en pantallas chicas */}
      <header className="md:hidden flex-shrink-0 h-14 flex items-center justify-between px-4 bg-white border-b border-gray-100 print:hidden">
        <div className="flex items-center gap-2">
          <img src={vuraLogo} alt="VURA" className="w-6 h-6 object-contain" />
          <span className="text-sm font-bold text-gray-900">VURA BI</span>
        </div>
        <button onClick={() => setMenuAbierto(true)} className="p-2 text-gray-500 hover:text-gray-800" aria-label="Abrir menú">
          <Menu size={20} />
        </button>
      </header>

      {/* Drawer móvil */}
      {menuAbierto && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMenuAbierto(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-white flex flex-col shadow-xl">
            <div className="px-5 py-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <img src={vuraLogo} alt="VURA" className="w-8 h-8 object-contain" />
                <div>
                  <h1 className="text-lg font-bold text-gray-900 leading-tight">VURA BI</h1>
                  <p className="text-xs text-gray-400">La Trattoria</p>
                </div>
              </div>
              <button onClick={() => setMenuAbierto(false)} className="p-1 text-gray-400 hover:text-gray-600" aria-label="Cerrar menú">
                <X size={20} />
              </button>
            </div>
            <NavLinks profile={profile} linkClass={linkClass} onNavigate={() => setMenuAbierto(false)} />
            <div className="px-3 py-4 border-t border-gray-100">
              <p className="px-3 text-xs text-gray-400 truncate mb-2">{profile?.nombre || profile?.email}</p>
              <button
                onClick={signOut}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-red-500 hover:bg-red-50 w-full"
              >
                <LogOut size={16} /> Cerrar sesión
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Sidebar de escritorio */}
      <aside className="hidden md:flex w-56 flex-shrink-0 h-full bg-white border-r border-gray-100 flex-col print:hidden">
        <div className="px-5 py-5 flex items-center gap-2.5">
          <img src={vuraLogo} alt="VURA" className="w-8 h-8 object-contain" />
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-tight">VURA BI</h1>
            <p className="text-xs text-gray-400">La Trattoria</p>
          </div>
        </div>

        <NavLinks profile={profile} linkClass={linkClass} />

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

      <main className="flex-1 min-w-0 h-full overflow-y-auto overflow-x-hidden print:w-full print:h-auto print:overflow-visible">
        <Outlet />
      </main>
    </div>
  )
}
