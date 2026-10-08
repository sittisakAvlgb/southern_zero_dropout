import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '@/auth/AuthContext'
import { canAccess } from '@/auth/roles'

/** Gate for the whole app shell: redirects to /login when signed out, and
 *  bounces to the dashboard if a role opens a route it may not access. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const location = useLocation()

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }
  if (!canAccess(user, location.pathname)) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}
