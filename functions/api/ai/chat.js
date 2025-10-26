/**
 * AI Chat endpoint
 * POST /api/ai/chat
 * Authenticated: requires Bearer token (Supabase session token).
 */

import { supabaseAdminClient } from '../../_lib/supabaseClient.js'
import { CloudflareAI } from '../../_lib/cloudflareAI.js'
import { z } from 'zod'

const ChatResponseSchema = z.object({ response: z.string(), suggestions: z.array(z.string()).optional() })

export async function onRequest(context) {
  const { request, env } = context

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  try {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Validate token with Supabase
    const supabase = supabaseAdminClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const body = await request.json().catch(() => ({}))
    const message = typeof body.message === 'string' ? body.message : ''
    const contextObj = body.context || {}

    if (!message) {
      return new Response(JSON.stringify({ error: 'Message is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Create AI client and run chat via wrapper which returns structured JSON
    const ai = new CloudflareAI(env)
    const chatResult = await ai.chat(message, contextObj)

    const parsed = ChatResponseSchema.safeParse(chatResult)
    if (!parsed.success) {
      console.warn('Invalid chat result shape from model:', parsed.error)
      return new Response(JSON.stringify({ error: 'invalid_model_response' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify(parsed.data), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('AI chat error:', error)
    return new Response(JSON.stringify({ error: 'AI chat failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
}
