/**
 * AI Chat endpoint
 * POST /api/ai/chat
 * Authenticated: requires Bearer token (Supabase session token).
 */

import { supabaseAdminClient } from '../../_lib/supabaseClient.js'
import { CloudflareAI } from '../../_lib/cloudflareAI.js'

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

    // Create AI client and run chat prompt
    const ai = new CloudflareAI(env)

    const systemPrompt = env.AI_SYSTEM_PROMPT || 'You are a helpful admissions assistant for MIHAS. Be concise and kind.'

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ]

    // Attach context as system message if provided
    if (Object.keys(contextObj).length > 0) {
      messages.splice(1, 0, { role: 'system', content: `Context: ${JSON.stringify(contextObj)}` })
    }

    const model = env.AI_CHAT_MODEL || '@cf/meta/llama-2-7b-chat-int8'
    const resp = await ai.ai.run(model, {
      messages,
      max_tokens: 512
    })

    // Attempt to extract text from response
    const text = resp?.response || resp?.output?.[0]?.content || (typeof resp === 'string' ? resp : JSON.stringify(resp))

    // Also generate lightweight suggestions using a short prompt (optional)
    let suggestions = []
    try {
      const sugResp = await ai.ai.run(model, {
        messages: [
          { role: 'system', content: 'Provide up to 3 short suggestion phrases based on the user message.' },
          { role: 'user', content: message }
        ],
        max_tokens: 60
      })
  const sugText = sugResp?.response || sugResp?.output?.[0]?.content || ''
  // split lines or commas/semicolons
  suggestions = String(sugText).split(/\n|[,;]/).map(s => s.trim()).filter(Boolean).slice(0, 3)
    } catch (e) {
      // ignore suggestion failures
    }

    return new Response(JSON.stringify({ response: String(text), suggestions }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('AI chat error:', error)
    return new Response(JSON.stringify({ error: 'AI chat failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
}
