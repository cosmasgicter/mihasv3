import { supabaseAdminClient } from './supabaseClient.js'

/**
 * Authenticate admin user from request
 */
export async function authenticateAdmin(request) {
  try {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader) {
      return {
        success: false,
        error: 'Unauthorized',
        status: 401
      }
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdminClient.auth.getUser(token)
    
    if (authError || !user) {
      return {
        success: false,
        error: 'Unauthorized',
        status: 401
      }
    }

    // Check user role
    const { data: profile } = await supabaseAdminClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!['admin', 'super_admin'].includes(profile?.role)) {
      return {
        success: false,
        error: 'Forbidden',
        status: 403
      }
    }

    return {
      success: true,
      user,
      profile
    }
  } catch (error) {
    console.error('Authentication error:', error)
    return {
      success: false,
      error: 'Internal server error',
      status: 500
    }
  }
}