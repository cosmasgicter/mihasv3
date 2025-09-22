import { supabase } from '@/lib/supabase'
import { sanitizeForLog } from '@/lib/security'

export async function debugAuthState() {
  try {
    console.log('=== AUTH DEBUG START ===')
    
    // Check current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    console.log('Current user:', sanitizeForLog(user?.email || ''), sanitizeForLog(user?.id || ''))
    console.log('User error:', sanitizeForLog(userError?.message || 'No error'))
    
    if (!user) {
      console.log('No authenticated user')
      return
    }
    
    // Check user profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
    
    console.log('User profile:', sanitizeForLog(JSON.stringify(profile)))
    console.log('Profile error:', sanitizeForLog(profileError?.message || 'No error'))
    
    // Check user role
    const { data: role, error: roleError } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()
    
    console.log('User role:', sanitizeForLog(JSON.stringify(role)))
    console.log('Role error:', sanitizeForLog(roleError?.message || 'No error'))
    
    console.log('=== AUTH DEBUG END ===')
    
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