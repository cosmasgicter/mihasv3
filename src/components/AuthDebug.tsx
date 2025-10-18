import React, { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getSupabaseClient } from '@/lib/supabase'

export function AuthDebug() {
  const { user, loading } = useAuth()
  const [sessionInfo, setSessionInfo] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const checkSession = async () => {
      try {
        const supabase = getSupabaseClient()
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error) {
          setError(error.message)
        } else {
          setSessionInfo({
            hasSession: !!session,
            hasUser: !!session?.user,
            hasToken: !!session?.access_token,
            tokenExpiry: session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
            userId: session?.user?.id,
            userEmail: session?.user?.email
          })
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    }

    checkSession()
  }, [user])

  if (loading) {
    return <div className="p-4 bg-yellow-100 border border-yellow-400 rounded">Loading auth state...</div>
  }

  return (
    <div className="p-4 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded mb-4">
      <h3 className="font-bold mb-2">Authentication Debug Info</h3>
      
      <div className="space-y-2 text-sm">
        <div>
          <strong>Auth Context User:</strong> {user ? `${user.email} (${user.id})` : 'None'}
        </div>
        
        <div>
          <strong>Loading:</strong> {loading ? 'Yes' : 'No'}
        </div>
        
        {error && (
          <div className="text-red-600 dark:text-red-400">
            <strong>Error:</strong> {error}
          </div>
        )}
        
        {sessionInfo && (
          <div>
            <strong>Session Info:</strong>
            <pre className="mt-1 p-2 bg-white dark:bg-gray-800 border rounded text-xs">
              {JSON.stringify(sessionInfo, null, 2)}
            </pre>
          </div>
        )}
        
        <div>
          <strong>Local Storage Token:</strong> {
            typeof window !== 'undefined' 
              ? localStorage.getItem('mihas-auth-token') ? 'Present' : 'None'
              : 'N/A (SSR)'
          }
        </div>
      </div>
    </div>
  )
}