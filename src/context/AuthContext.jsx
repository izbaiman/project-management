import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, getToken, setToken, onUnauthorized } from '../api.js'

const AuthContext = createContext(null)

/** Mirrors server/roles.js: each role can do everything the ones below it can. */
export const ROLES = ['member', 'manager', 'admin', 'super_admin']
export const ROLE_RANK = Object.fromEntries(ROLES.map((r, i) => [r, i]))
export const ROLE_LABEL = { member: 'Member', manager: 'Manager', admin: 'Admin', super_admin: 'Super admin' }

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

  const rank = ROLE_RANK[user?.role] ?? 0
  const canManage = rank >= ROLE_RANK.manager
  const isAdmin = rank >= ROLE_RANK.admin

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, canManage, isAdmin, rank }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
