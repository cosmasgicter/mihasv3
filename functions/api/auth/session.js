/**
 * Auth Session Logging
 * POST /api/auth/session - Log login/logout events
 */

import { createClient } from '@supabase/supabase-js'
import { AuditLogger } from '../../_lib/auditLogger.js'

export async function onRequestPost(context) {
  const { request, env } = context

  try {
    const { action } = await request.json()
    
    const authHeader = request.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

    const auditLogger = new AuditLogger(supabase)
    
    if (action === 'login') {
      await auditLogger.log({
        actorId: user.id,
        action: 'user_login',
        entityType: 'user',
        entityId: user.id,
        changes: { email: user.email },
        ipAddress: request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent')
      })
    } else if (action === 'logout') {
      await auditLogger.log({
        actorId: user.id,
        action: 'user_logout',
        entityType: 'user',
        entityId: user.id,
        changes: { email: user.email },
        ipAddress: request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent')
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Session logging error:', error)
    return new Response(JSON.stringify({ error: 'Logging failed' }), { status: 500 })
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  })
}
