import React, { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { useRoleQuery } from '@/hooks/auth/useRoleQuery'

export function AuthDebug() {
  const { user, loading } = useAuth()
  const { profile } = useProfileQuery()
  const { userRole } = useRoleQuery()
  const [debugInfo, setDebugInfo] = useState<any>({})

  useEffect(() => {
    // Only run debug info collection once on mount to prevent refresh loops
    if (Object.keys(debugInfo).length > 0) return
    
    async function getDebugInfo() {
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser()
        const { data: session } = await supabase.auth.getSession()
        
        setDebugInfo({
          currentUser: currentUser ? {
            id: currentUser.id,
            email: currentUser.email
          } : null,
          session: session?.session ? {
            access_token: session.session.access_token ? 'present' : 'missing',
            expires_at: session.session.expires_at
          } : null,
          contextUser: user ? {
            id: user.id,
            email: user.email
          } : null,
          contextProfile: profile ? { role: profile.role } : null,
          contextUserRole: userRole ? { role: userRole.role } : null,
          contextLoading: loading
        })
      } catch (error) {
        setDebugInfo({ error: error.message })
      }
    }

    const timer = setTimeout(getDebugInfo, 1000)
    return () => clearTimeout(timer)
  }, [])

  if (process.env.NODE_ENV === 'production') {
    return null
  }

  return (
    <div className="fixed bottom-4 right-4 bg-black text-white p-4 rounded-lg text-xs max-w-md max-h-96 overflow-auto z-50">
      <h3 className="font-bold mb-2">Auth Debug Info</h3>
      <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
    </div>
  )
}