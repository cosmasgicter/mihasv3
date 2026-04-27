import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { env } from '@/lib/env'
import { configureAuthFailure } from '@/services/api/client'

type User = {
  id: string
  email: string
  first_name?: string
  last_name?: string
  role: string
}

type AuthState = {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthState>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const queryClient = useQueryClient()

  useEffect(() => {
    let mounted = true

    configureAuthFailure(() => {
      setUser(null)
      queryClient.clear()
    })

    async function bootstrap() {
      try {
        const res = await fetch(`${env.apiBaseUrl}/api/v1/auth/session/?refresh_csrf=1`, {
          credentials: 'include',
        })
        if (!res.ok) {
          if (mounted) setUser(null)
          return
        }
        const json = await res.json()
        // Supports envelope: {success: true, data: {id, ...}} or raw {id, ...}
        const userData = json?.success && 'data' in json ? json.data : json
        if (mounted) setUser(userData?.id ? userData : null)
      } catch {
        if (mounted) setUser(null)
      } finally {
        if (mounted) setIsLoading(false)
      }
    }

    bootstrap()
    return () => { mounted = false }
  }, [queryClient])

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: Boolean(user) }}>
      {children}
    </AuthContext.Provider>
  )
}
