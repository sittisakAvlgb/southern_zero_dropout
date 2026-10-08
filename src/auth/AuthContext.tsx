import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { DEMO_USERS, isHiddenRole, type Role, type User } from './roles'

interface AuthContextValue {
  user: User | null
  login: (email: string, password: string) => { ok: boolean; error?: string }
  loginAs: (user: User) => void
  register: (data: RegisterInput) => { ok: boolean; error?: string }
  logout: () => void
}

export interface RegisterInput {
  name: string
  email: string
  password: string
  role: Role
  provinceKey?: string
  districtKey?: string
  schoolKey?: string
  ownerName?: string
}

const AuthContext = createContext<AuthContextValue | null>(null)
const STORAGE_KEY = 'sbp-auth'
const USERS_KEY = 'sbp-users'

function loadUsers(): (User & { password: string })[] {
  try {
    const raw = localStorage.getItem(USERS_KEY)
    const custom = raw ? (JSON.parse(raw) as (User & { password: string })[]) : []
    return [...DEMO_USERS, ...custom]
  } catch {
    return [...DEMO_USERS]
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? (JSON.parse(raw) as User) : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
    else localStorage.removeItem(STORAGE_KEY)
  }, [user])

  const login = useCallback((email: string, password: string) => {
    const found = loadUsers().find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase(),
    )
    // a withheld role is not in this build, however you arrive at it
    if (!found || isHiddenRole(found.role)) return { ok: false, error: 'notFound' }
    // Demo accounts accept any password; custom accounts check it.
    if (found.password && found.password !== password && password !== 'demo') {
      return { ok: false, error: 'badPassword' }
    }
    const { password: _pw, ...clean } = found
    setUser(clean)
    return { ok: true }
  }, [])

  const loginAs = useCallback((u: User) => setUser(u), [])

  const register = useCallback((data: RegisterInput) => {
    const users = loadUsers()
    if (users.some((u) => u.email.toLowerCase() === data.email.trim().toLowerCase())) {
      return { ok: false, error: 'exists' }
    }
    const newUser: User & { password: string } = {
      id: `u-${Date.now().toString(36)}`,
      name: data.name.trim(),
      email: data.email.trim(),
      password: data.password,
      role: data.role,
      provinceKey: data.provinceKey,
      districtKey: data.districtKey,
      schoolKey: data.schoolKey,
      ownerName: data.role === 'teacher' ? data.name.trim() : data.ownerName,
    }
    try {
      const raw = localStorage.getItem(USERS_KEY)
      const custom = raw ? JSON.parse(raw) : []
      custom.push(newUser)
      localStorage.setItem(USERS_KEY, JSON.stringify(custom))
    } catch {
      /* ignore persistence errors in demo */
    }
    const { password: _pw, ...clean } = newUser
    setUser(clean)
    return { ok: true }
  }, [])

  const logout = useCallback(() => setUser(null), [])

  const value = useMemo(
    () => ({ user, login, loginAs, register, logout }),
    [user, login, loginAs, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
