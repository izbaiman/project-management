import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, getToken, setToken, onUnauthorized } from '../api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!getToken()) {
      setLoading(false)
      return
    }
    api.me()
      .then(({ user }) => setUser(user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => onUnauthorized(() => setUser(null)), [])

  const login = useCallback(async (email, password) => {
    const { token, user } = await api.login(email, password)
    setToken(token)
    setUser(user)
    return user
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  const canManage = user?.role === 'admin' || user?.role === 'manager'

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, canManage }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
