/**
 * AI Document analysis endpoint
 * POST /api/ai/analyze-document
 * Expects { text, documentType }
 */

import { supabaseAdminClient } from '../../_lib/supabaseClient.js'
import { CloudflareAI } from '../../_lib/cloudflareAI.js'
import { z } from 'zod'

const AnalyzeSchema = z.object({
  grades: z.array(z.object({ subject: z.string(), grade: z.number() })).optional(),
  name: z.string().optional(),
  nrc: z.string().optional(),
  dateOfBirth: z.string().optional()
}).passthrough()

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
    const result = await ai.analyzeDocument(text, documentType)

    const parsed = AnalyzeSchema.safeParse(result)
    if (!parsed.success) {
      console.warn('Invalid analyze-document result from model:', parsed.error)
      return new Response(JSON.stringify({ error: 'invalid_model_response' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify(parsed.data), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('AI analyze-document error:', error)
    return new Response(JSON.stringify({ error: 'Document analysis failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
}
