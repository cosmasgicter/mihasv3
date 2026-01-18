import { getSupabaseClient } from '@/lib/supabase'

export interface TerminateSessionsResult {
  success: boolean
  terminatedCount: number
  error?: string
}

/**
 * Terminates all other sessions except the current one.
 * Uses Supabase's signOut({ scope: 'others' }) and updates device_sessions table.
 * 
 * @returns Promise with success status and count of terminated sessions
 */
export async function terminateAllOtherSessions(): Promise<TerminateSessionsResult> {
  const supabase = getSupabaseClient()
  
  try {
    // Get current session info
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session?.user?.id || !session?.access_token) {
      return {
        success: false,
        terminatedCount: 0,
        error: 'No active session found'
      }
    }
    
    const currentDeviceId = localStorage.getItem('device_id')
    
    // Get count of other active sessions before termination
    const { data: otherSessions, error: countError } = await supabase
      .from('device_sessions')
      .select('id, device_id')
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .neq('device_id', currentDeviceId || '')
    
    if (countError) {
      return {
        success: false,
        terminatedCount: 0,
        error: `Failed to count sessions: ${countError.message}`
      }
    }
    
    const sessionsToTerminate = otherSessions?.length || 0
    
    if (sessionsToTerminate === 0) {
      return {
        success: true,
        terminatedCount: 0
      }
    }
    
    // Terminate all other sessions via Supabase Auth
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'others' })
    
    if (signOutError) {
      return {
        success: false,
        terminatedCount: 0,
        error: `Failed to sign out other sessions: ${signOutError.message}`
      }
    }
    
    // Mark sessions as inactive in device_sessions table
    const { error: updateError } = await supabase
      .from('device_sessions')
      .update({ 
        is_active: false, 
        updated_at: new Date().toISOString() 
      })
      .eq('user_id', session.user.id)
      .neq('device_id', currentDeviceId || '')
    
    if (updateError) {
      // Auth sessions were terminated but DB update failed
      // Still consider this a partial success
      console.error('Failed to update device_sessions:', updateError)
      return {
        success: true,
        terminatedCount: sessionsToTerminate,
        error: 'Sessions terminated but database update failed'
      }
    }
    
    return {
      success: true,
      terminatedCount: sessionsToTerminate
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    console.error('Failed to terminate sessions:', error)
    return {
      success: false,
      terminatedCount: 0,
      error: errorMessage
    }
  }
}
