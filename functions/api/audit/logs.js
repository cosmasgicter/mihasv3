/**
 * Audit Logs API
 * GET /api/audit/logs - List audit logs with filters
 */

import { createClient } from '@supabase/supabase-js'
import { supabaseAdminClient } from '../../_lib/supabaseClient.js'

export async function onRequestGet(context) {
  const { request, env } = context

  try {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdminClient.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

    // Admin only
    const { data: profile } = await supabaseAdminClient
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403 })
    }

    const url = new URL(request.url)
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = parseInt(url.searchParams.get('limit') || '50')
    const action = url.searchParams.get('action')
    const entityType = url.searchParams.get('entity_type')
    const actorId = url.searchParams.get('actor_id')

    const offset = (page - 1) * limit

    let query = supabaseAdminClient
      .from('audit_logs')
      .select('*, actor:user_profiles!actor_id(email, full_name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (action) query = query.eq('action', action)
    if (entityType) query = query.eq('entity_type', entityType)
    if (actorId) query = query.eq('actor_id', actorId)

    const { data, error, count } = await query

    if (error) throw error

    return new Response(JSON.stringify({
      data,
      pagination: {
        page,
        limit,
        total: count,
        pages: Math.ceil(count / limit)
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Audit logs error:', error)
    return new Response(JSON.stringify({ error: 'Failed to fetch audit logs' }), { status: 500 })
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  })
}
