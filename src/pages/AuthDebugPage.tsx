import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getSupabaseClient } from '@/lib/supabase'
import { refreshAuthSession } from '@/lib/authRefresh'
import { useTokenRefresh } from '@/hooks/auth/useTokenRefresh'
import { useRoleVerification } from '@/hooks/auth/useRoleVerification'

export function AuthDebugPage() {
  const { user, loading } = useAuth()
  const { tokenExpiry, lastRefresh, refreshCount } = useTokenRefresh()
  const { roleStatus, profileRole, authRole, isAdmin } = useRoleVerification()
  const [sessionInfo, setSessionInfo] = useState<any>(null)
  const [refreshResult, setRefreshResult] = useState<any>(null)
  const [storageInfo, setStorageInfo] = useState<any>({})

  useEffect(() => {
    checkSession()
    checkStorage()
  }, [])

  const checkSession = async () => {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.auth.getSession()
    setSessionInfo({ data, error })
  }

  const checkStorage = () => {
    if (typeof window === 'undefined') return
    
    const keys = Object.keys(localStorage).filter(k => 
      k.includes('supabase') || k.includes('mihas') || k.includes('sb-')
    )
    
    const storage: any = {}
    keys.forEach(key => {
      try {
        storage[key] = localStorage.getItem(key)?.substring(0, 100) + '...'
      } catch {
        storage[key] = 'Error reading'
      }
    })
    
    setStorageInfo(storage)
  }

  const testRefresh = async () => {
    const result = await refreshAuthSession()
    setRefreshResult(result)
  }

  const clearAll = () => {
    if (typeof window === 'undefined') return
    
    Object.keys(localStorage).forEach(key => {
      if (key.includes('supabase') || key.includes('mihas') || key.includes('sb-')) {
        localStorage.removeItem(key)
      }
    })
    sessionStorage.clear()
    alert('Cleared all auth data. Please refresh the page.')
  }

  return (
    <div className="min-h-screen bg-muted p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">Auth Debug Page</h1>
        
        {/* Auth Context */}
        <div className="bg-card p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Auth Context</h2>
          <div className="space-y-2">
            <p><strong>Loading:</strong> {loading ? 'Yes' : 'No'}</p>
            <p><strong>User:</strong> {user ? user.email : 'None'}</p>
            <p><strong>User ID:</strong> {user?.id || 'N/A'}</p>
          </div>
        </div>

        {/* Token Info */}
        <div className="bg-card p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Token Status</h2>
          <div className="space-y-2">
            <p><strong>Token Expiry:</strong> {tokenExpiry?.toLocaleString() || 'N/A'}</p>
            <p><strong>Last Refresh:</strong> {lastRefresh?.toLocaleString() || 'Never'}</p>
            <p><strong>Refresh Count:</strong> {refreshCount}</p>
            <p><strong>Time Until Expiry:</strong> {tokenExpiry ? Math.round((tokenExpiry.getTime() - Date.now()) / (1000 * 60 * 60)) + ' hours' : 'N/A'}</p>
          </div>
        </div>

        {/* Role Info */}
        <div className="bg-card p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Role Verification</h2>
          <div className="space-y-2">
            <p><strong>Status:</strong> <span className={roleStatus === 'verified' ? 'text-green-600' : roleStatus === 'mismatch' ? 'text-red-600' : 'text-yellow-600'}>{roleStatus}</span></p>
            <p><strong>Profile Role:</strong> {profileRole || 'N/A'}</p>
            <p><strong>Auth Role:</strong> {authRole || 'N/A'}</p>
            <p><strong>Is Admin:</strong> {isAdmin ? 'Yes' : 'No'}</p>
          </div>
        </div>

        {/* Session Info */}
        <div className="bg-card p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Supabase Session</h2>
          <button 
            onClick={checkSession}
            className="mb-4 px-4 py-2 bg-primary/5/300 text-white rounded hover:bg-blue-600"
          >
            Refresh Session Info
          </button>
          <pre className="bg-accent p-4 rounded overflow-auto text-xs">
            {JSON.stringify(sessionInfo, null, 2)}
          </pre>
        </div>

        {/* Storage Info */}
        <div className="bg-card p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">LocalStorage Keys</h2>
          <button 
            onClick={checkStorage}
            className="mb-4 px-4 py-2 bg-accent/10/300 text-white rounded hover:bg-green-600"
          >
            Refresh Storage Info
          </button>
          <pre className="bg-accent p-4 rounded overflow-auto text-xs">
            {JSON.stringify(storageInfo, null, 2)}
          </pre>
        </div>

        {/* Refresh Test */}
        <div className="bg-card p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Test Auth Refresh</h2>
          <button 
            onClick={testRefresh}
            className="mb-4 px-4 py-2 bg-secondary/5/300 text-white rounded hover:bg-purple-600"
          >
            Test Refresh
          </button>
          {refreshResult && (
            <pre className="bg-accent p-4 rounded overflow-auto text-xs">
              {JSON.stringify(refreshResult, null, 2)}
            </pre>
          )}
        </div>

        {/* Actions */}
        <div className="bg-card p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Actions</h2>
          <div className="space-x-4">
            <button 
              onClick={clearAll}
              className="px-4 py-2 bg-destructive/5/300 text-white rounded hover:bg-red-600"
            >
              Clear All Auth Data
            </button>
            <a 
              href="/auth/signin"
              className="inline-block px-4 py-2 bg-primary/5/300 text-white rounded hover:bg-blue-600"
            >
              Go to Sign In
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
