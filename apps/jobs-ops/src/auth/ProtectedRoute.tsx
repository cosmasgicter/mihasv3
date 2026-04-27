import type { ReactNode } from 'react'
import { useAuth } from '@/auth/AuthContext'

const SIGN_IN_URL = import.meta.env.VITE_SIGN_IN_URL || '***REMOVED***/auth/signin'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth()

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading…</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    window.location.href = `${SIGN_IN_URL}?redirect=${encodeURIComponent(window.location.pathname)}`
    return null
  }

  return <>{children}</>
}
