/**
 * AI Trends Analysis Endpoint
 * GET /api/ai/trends
 */

import { createClient } from '@supabase/supabase-js'
import { supabaseAdminClient } from '../../_lib/supabaseClient.js'
import { CloudflareAI } from '../../_lib/cloudflareAI.js'

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

    // Fetch last 30 days of applications
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data: applications } = await supabaseAdminClient
      .from('applications')
      .select('id, status, program, created_at, updated_at')
      .gte('created_at', thirtyDaysAgo)

    // Use Cloudflare AI for analysis
    const ai = new CloudflareAI(env)
    const analysis = await ai.analyzeTrends(applications || [])

    return new Response(JSON.stringify(analysis), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('AI trends error:', error)
    return new Response(JSON.stringify({ error: 'Analysis failed' }), { status: 500 })
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
