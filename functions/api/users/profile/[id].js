/**
 * User Profile Updates with Audit Logging
 * PUT /api/users/profile/[id]
 */

import { createClient } from '@supabase/supabase-js'
import { AuditLogger } from '../../../_lib/auditLogger.js'

export async function onRequestPut(context) {
  const { request, env, params } = context
  const userId = params.id

  try {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

    const supabase = supabaseAdminClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

    // Check authorization
    if (user.id !== userId) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      
      if (profile?.role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
      }
    }

    const updates = await request.json()

    // Get old profile data
    const { data: oldProfile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single()

    // Update profile
    const { data, error } = await supabase
      .from('user_profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single()

    if (error) throw error

    // Audit log
    const auditLogger = new AuditLogger(supabase)
    await auditLogger.logUserAction(
      user.id,
      'user_profile_update',
      userId,
      { old: oldProfile, new: data },
      request
    )

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Profile update error:', error)
    return new Response(JSON.stringify({ error: 'Update failed' }), { status: 500 })
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  })
}
