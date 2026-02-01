import React, { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

export function AuthDebug() {
  const { user, loading } = useAuth()
  const [sessionInfo, setSessionInfo] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await fetch('/api/auth?action=session', {
          credentials: 'include'
        })
        const data = await response.json()
        
        if (!data.success) {
          setError(data.error || 'Session check failed')
        } else {
          setSessionInfo({
            hasSession: !!data.user,
            hasUser: !!data.user,
            hasToken: true, // Cookie-based, so we don't expose token
            tokenExpiry: data.expiresAt ? new Date(data.expiresAt).toISOString() : null,
            userId: data.user?.id,
            userEmail: data.user?.email
          })
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    }

    checkSession()
  }, [user])

  if (loading) {
    return <div className="p-4 bg-accent/10 border border-yellow-400 rounded">Loading auth state...</div>
  }

  return (
    <div className="p-4 bg-accent border border-input rounded mb-4">
      <h3 className="font-bold mb-2">Authentication Debug Info</h3>
      
      <div className="space-y-2 text-sm">
        <div>
          <strong>Auth Context User:</strong> {user ? `${user.email} (${user.id})` : 'None'}
        </div>
        
        <div>
          <strong>Loading:</strong> {loading ? 'Yes' : 'No'}
        </div>
        
        {error && (
          <div className="text-destructive">
            <strong>Error:</strong> {error}
          </div>
        )}
        
        {sessionInfo && (
          <div>
            <strong>Session Info:</strong>
            <pre className="mt-1 p-2 bg-card border rounded text-xs">
              {JSON.stringify(sessionInfo, null, 2)}
            </pre>
          </div>
        )}
        
        <div>
          <strong>Auth Method:</strong> HTTP-only cookies (secure)
        </div>
      </div>
    </div>
  )
}