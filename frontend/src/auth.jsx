import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, getToken, onAuthLost, setToken } from './api.js'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  const logout = useCallback(() => { setToken(null); setUser(null) }, [])

  useEffect(() => {
    onAuthLost(logout)
    if (!getToken()) { setReady(true); return }
    api.get('/me').then(setUser).catch(() => setToken(null)).finally(() => setReady(true))
  }, [logout])

  const login = async (email, password) => {
    const r = await api.post('/auth/login', { email, password })
    setToken(r.token); setUser(r.user)
  }
  const register = async (form) => {
    const r = await api.post('/auth/register', form)
    setToken(r.token); setUser(r.user)
  }

  return <AuthCtx.Provider value={{ user, ready, login, register, logout }}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)
