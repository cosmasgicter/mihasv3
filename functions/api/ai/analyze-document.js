/**
 * AI Document analysis endpoint
 * POST /api/ai/analyze-document
 * Expects { text, documentType }
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

    const supabase = supabaseAdminClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const body = await request.json().catch(() => ({}))
    const text = typeof body.text === 'string' ? body.text : ''
    const documentType = body.documentType || 'unknown'

    if (!text) {
      return new Response(JSON.stringify({ error: 'text is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const ai = new CloudflareAI(env)
    const model = env.AI_DOC_MODEL || '@cf/meta/llama-2-7b-chat-int8'

    const prompt = `You are a document analysis assistant. Given the following ${documentType} content, extract a JSON object with sensible fields. If unable, return {\n  \"type\": \"${documentType}\",\n  \"summary\": \"...\"\n}`
    const messages = [
      { role: 'system', content: 'Extract structured information and a short summary in JSON format.' },
      { role: 'user', content: `${prompt}\n\n${text}` }
    ]

    const resp = await ai.ai.run(model, { messages, max_tokens: 512 })
    const raw = resp?.response || resp?.output?.[0]?.content || ''

    // Try to extract first JSON object from response
    let parsed = null
    try {
      const m = String(raw).match(/\{[\s\S]*\}/)
      if (m) parsed = JSON.parse(m[0])
    } catch (e) {
      parsed = null
    }

    const result = parsed || { type: documentType, summary: String(raw).slice(0, 1000) }

    return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('AI analyze-document error:', error)
    return new Response(JSON.stringify({ error: 'Document analysis failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
}
