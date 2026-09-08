import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Trash2, UserPlus, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const APARTADOS = [
  { key: 'ventas_plu', label: 'Ventas por PLU' },
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'ventas', label: 'Ventas' },
  { key: 'pagos', label: 'Pagos' },
  { key: 'compras', label: 'Compras', sub: { key: 'compras_solo_insumos', label: 'Solo proveedores de insumos' } },
  { key: 'proveedores', label: 'Proveedores' },
  { key: 'presupuesto', label: 'Presupuesto' },
  { key: 'rh', label: 'RH' },
  { key: 'pnl', label: 'P&L' },
  { key: 'business_intelligence', label: 'Business Intelligence' },
]

const PERMISOS_VACIOS = Object.fromEntries(APARTADOS.map(a => [a.key, false]))

function CheckboxesPermisos({ permisos, onChange }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
      {APARTADOS.map(a => (
        <div key={a.key}>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={!!permisos[a.key]}
              onChange={e => onChange({ ...permisos, [a.key]: e.target.checked })}
              className="rounded border-gray-300 text-gold-600 focus:ring-gold-400"
            />
            {a.label}
          </label>
          {a.sub && permisos[a.key] && (
            <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer mt-1 ml-6">
              <input
                type="checkbox"
                checked={!!permisos[a.sub.key]}
                onChange={e => onChange({ ...permisos, [a.sub.key]: e.target.checked })}
                className="rounded border-gray-300 text-gold-600 focus:ring-gold-400"
              />
              {a.sub.label}
            </label>
          )}
        </div>
      ))}
    </div>
  )
}

function FilaUsuario({ u, onGuardar, onBorrar }) {
  const [abierto, setAbierto] = useState(false)
  const [permisos, setPermisos] = useState({ ...PERMISOS_VACIOS, ...(u.permisos ?? {}) })
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    setGuardando(true)
    await onGuardar(u, permisos)
    setGuardando(false)
  }

  if (u.rol === 'owner') {
    return (
      <tr className="border-b border-gray-50 last:border-0">
        <td className="px-4 py-2.5 text-gray-700">{u.nombre || '—'}</td>
        <td className="px-4 py-2.5 text-gray-700">{u.email}</td>
        <td className="px-4 py-2.5 text-xs font-bold text-gold-700">owner · acceso total</td>
        <td className="px-4 py-2.5 text-xs text-gray-400">
          {u.last_seen ? format(new Date(u.last_seen), "d MMM yyyy, HH:mm", { locale: es }) : 'Nunca'}
        </td>
        <td className="px-4 py-2.5 w-10" />
      </tr>
    )
  }

  return (
    <>
      <tr className="border-b border-gray-50 last:border-0">
        <td className="px-4 py-2.5 text-gray-700">{u.nombre || '—'}</td>
        <td className="px-4 py-2.5 text-gray-700">{u.email}</td>
        <td className="px-4 py-2.5">
          <button
            onClick={() => setAbierto(a => !a)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-800"
          >
            {Object.values(permisos).filter(Boolean).length} apartado{Object.values(permisos).filter(Boolean).length === 1 ? '' : 's'}
            {abierto ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </td>
        <td className="px-4 py-2.5 text-xs text-gray-400">
          {u.last_seen ? format(new Date(u.last_seen), "d MMM yyyy, HH:mm", { locale: es }) : 'Nunca'}
        </td>
        <td className="px-4 py-2.5 w-10 text-right">
          <button onClick={() => onBorrar(u)} className="text-gray-300 hover:text-red-500">
            <Trash2 size={15} />
          </button>
        </td>
      </tr>
      {abierto && (
        <tr className="border-b border-gray-50 last:border-0">
          <td colSpan={5} className="px-4 pb-4 pt-1 bg-gray-50/60">
            <CheckboxesPermisos permisos={permisos} onChange={setPermisos} />
            <button
              onClick={guardar}
              disabled={guardando}
              className="mt-3 px-3 py-1.5 bg-[#7a6020] text-white rounded-lg text-xs font-semibold hover:bg-[#5c4718] disabled:opacity-50"
            >
              {guardando ? 'Guardando...' : 'Guardar permisos'}
            </button>
          </td>
        </tr>
      )}
    </>
  )
}

export default function Usuarios() {
  const { profile } = useAuth()
  const [usuarios, setUsuarios] = useState([])
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [permisosNuevo, setPermisosNuevo] = useState(PERMISOS_VACIOS)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [creando, setCreando] = useState(false)

  async function llamar(action, extra = {}) {
    const { data, error } = await supabase.functions.invoke('admin-users', {
      body: { action, ...extra },
    })
    if (error) {
      const detalle = await error.context?.json?.().catch(() => null)
      throw new Error(detalle?.error || error.message)
    }
    if (data?.error) throw new Error(data.error)
    return data
  }

  async function cargar() {
    setLoading(true)
    try {
      const data = await llamar('list')
      setUsuarios(data.usuarios ?? [])
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  useEffect(() => { if (profile?.rol === 'owner') cargar() }, [profile])

  if (profile && profile.rol !== 'owner') return <Navigate to="/" replace />

  async function crear(e) {
    e.preventDefault()
    setError('')
    setCreando(true)
    try {
      await llamar('create', { email, password, nombre, permisos: permisosNuevo })
      setNombre(''); setEmail(''); setPassword(''); setPermisosNuevo(PERMISOS_VACIOS)
      cargar()
    } catch (e) {
      setError(e.message)
    }
    setCreando(false)
  }

  async function guardarPermisos(u, permisos) {
    try {
      await llamar('update', { id: u.id, nombre: u.nombre, permisos })
      cargar()
    } catch (e) { setError(e.message) }
  }

  async function borrar(u) {
    if (!confirm(`¿Borrar el acceso de ${u.email}?`)) return
    try {
      await llamar('delete', { id: u.id })
      cargar()
    } catch (e) { setError(e.message) }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Gestión de usuarios</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-400">Cargando...</p>
        ) : (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-5 py-3 border-b bg-gray-50">
                <h2 className="font-bold text-gray-800 text-sm">Con acceso</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-400">Nombre</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-400">Correo</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-400">Permisos</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-400">Última vez en la página</th>
                    <th className="px-4 py-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map(u => (
                    <FilaUsuario key={u.id} u={u} onGuardar={guardarPermisos} onBorrar={borrar} />
                  ))}
                  {usuarios.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-300 text-sm">Sin usuarios</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <form onSubmit={crear} className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
              <h2 className="font-bold text-gray-800 text-sm mb-1">Crear usuario</h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Nombre</label>
                  <input
                    required value={nombre} onChange={e => setNombre(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Correo</label>
                  <input
                    type="email" required value={email} onChange={e => setEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Contraseña</label>
                  <input
                    type="text" required minLength={6} value={password} onChange={e => setPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-2">Apartados a los que tiene acceso</label>
                <CheckboxesPermisos permisos={permisosNuevo} onChange={setPermisosNuevo} />
              </div>
              <button
                type="submit" disabled={creando}
                className="flex items-center gap-2 px-4 py-2 bg-[#7a6020] text-white rounded-lg text-sm font-semibold hover:bg-[#5c4718] transition-colors disabled:opacity-50"
              >
                <UserPlus size={15} /> {creando ? 'Creando...' : 'Crear usuario'}
              </button>
            </form>
          </div>
        )}
      </div>
  )
}
