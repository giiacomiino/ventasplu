import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Trash2, UserPlus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const ROLES = ['owner', 'admin', 'rh']

export default function Usuarios() {
  const { profile } = useAuth()
  const [usuarios, setUsuarios] = useState([])
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rol, setRol] = useState('rh')
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
      await llamar('create', { email, password, nombre, rol })
      setNombre(''); setEmail(''); setPassword(''); setRol('rh')
      cargar()
    } catch (e) {
      setError(e.message)
    }
    setCreando(false)
  }

  async function cambiarRol(u, nuevoRol) {
    try {
      await llamar('update', { id: u.id, nombre: u.nombre, rol: nuevoRol })
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
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-400">Rol</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-400">Último login</th>
                    <th className="px-4 py-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map(u => (
                    <tr key={u.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-2.5 text-gray-700">{u.nombre || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-700">{u.email}</td>
                      <td className="px-4 py-2.5 w-28">
                        <select
                          value={u.rol}
                          onChange={e => cambiarRol(u, e.target.value)}
                          className="text-xs border border-gray-200 rounded px-2 py-1"
                        >
                          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400">
                        {u.last_sign_in_at
                          ? format(new Date(u.last_sign_in_at), "d MMM yyyy, HH:mm", { locale: es })
                          : 'Nunca'}
                      </td>
                      <td className="px-4 py-2.5 w-10 text-right">
                        <button onClick={() => borrar(u)} className="text-gray-300 hover:text-red-500">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {usuarios.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-300 text-sm">Sin usuarios</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <form onSubmit={crear} className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
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
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Contraseña</label>
                  <input
                    type="text" required minLength={6} value={password} onChange={e => setPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Rol</label>
                  <select
                    value={rol} onChange={e => setRol(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  >
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
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
