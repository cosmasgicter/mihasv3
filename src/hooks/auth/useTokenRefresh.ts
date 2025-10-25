import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'

export function useTokenRefresh() {
  const { user } = useAuth()
  const [tokenExpiry, setTokenExpiry] = useState<Date | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [refreshCount, setRefreshCount] = useState(0)

  useEffect(() => {
    if (!user || !isSupabaseConfigured) return

    const supabase = getSupabaseClient()
    let mounted = true

    async function checkToken() {
      const { data: { session } } = await supabase.auth.getSession()
      if (mounted && session?.expires_at) {
        setTokenExpiry(new Date(session.expires_at * 1000))
      }
    }

    checkToken()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return

      if (event === 'TOKEN_REFRESHED' && session?.expires_at) {
        setLastRefresh(new Date())
        setTokenExpiry(new Date(session.expires_at * 1000))
        setRefreshCount(prev => prev + 1)
      }
      
      if (event === 'SIGNED_OUT') {
        setTokenExpiry(null)
        setLastRefresh(null)
        setRefreshCount(0)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [user])

  return { tokenExpiry, lastRefresh, refreshCount }
}
