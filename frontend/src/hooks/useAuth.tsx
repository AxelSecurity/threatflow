import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { api } from '../lib/api'

interface AuthUser {
  id: string
  email: string
  display_name: string
  role: string
  active: boolean
}

interface AuthCtx {
  user: AuthUser | null
  token: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  isLoading: boolean
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,  setUser]  = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setLoading] = useState(true)

  useEffect(() => {
    const t = localStorage.getItem('tf_token')
    if (t) {
      setToken(t)
      // validate token by fetching /me
      fetch('/api/v1/auth/me', { headers: { Authorization: `Bearer ${t}` } })
        .then(r => r.ok ? r.json() : null)
        .then(u => { if (u) setUser(u); else localStorage.removeItem('tf_token') })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (email: string, password: string) => {
    const form = new URLSearchParams({ username: email, password })
    const r = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    })
    if (!r.ok) {
      const err = await r.json()
      throw new Error(err.detail ?? 'Login fallito')
    }
    const data = await r.json()
    localStorage.setItem('tf_token', data.access_token)
    setToken(data.access_token)
    setUser(data.user)
  }

  const logout = () => {
    localStorage.removeItem('tf_token')
    setToken(null)
    setUser(null)
  }

  return <Ctx.Provider value={{ user, token, login, logout, isLoading }}>{children}</Ctx.Provider>
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
