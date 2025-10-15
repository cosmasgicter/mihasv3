import { supabase } from '@/lib/supabase'
import { sanitizeForLog } from '@/lib/security'

export async function debugAuthState() {
  try {
    
    // Check current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (!user) {
      return
    }
    
    // Check user profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
    
    
    // Check user role
    const { data: role, error: roleError } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()
    
    
    
    return {
      user,
      profile,
      role,
      errors: {
        userError,
        profileError,
        roleError
      }
    }
  } catch (error) {
    console.error('Debug auth state error:', sanitizeForLog(error instanceof Error ? error.message : 'Unknown error'))
    return null
  }
}

// Add to window for easy debugging
if (typeof window !== 'undefined') {
  (window as any).debugAuth = debugAuthState
}