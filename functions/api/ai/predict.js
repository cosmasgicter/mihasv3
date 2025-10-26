/**
 * AI Prediction Endpoint
 * POST /api/ai/predict
 */

import { createClient } from '@supabase/supabase-js'
import { supabaseAdminClient } from '../../_lib/supabaseClient.js'
import { CloudflareAI } from '../../_lib/cloudflareAI.js'

export async function onRequestPost(context) {
  const { request, env } = context
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  }

  try {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const token = authHeader.replace('Bearer ', '')
    const supabase = supabaseAdminClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

    const { application_id } = await request.json()

    // Fetch application data
    const { data: application, error } = await supabase
      .from('applications')
      .select('*, grades:application_grades(*)')
      .eq('id', application_id)
      .eq('user_id', user.id)
      .single()

    if (error || !application) {
      return new Response(JSON.stringify({ error: 'Application not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Use Cloudflare AI
    const ai = new CloudflareAI(env)
    const prediction = await ai.predictAdmission(application)
    const recommendations = await ai.generateRecommendations(application)

    const result = {
      admission_probability: prediction.probability / 100,
      confidence: prediction.confidence / 100,
      key_factor: prediction.key_factor,
      recommendations,
      processing_time_estimate: calculateProcessingTime(application),
      model_version: 'cloudflare-ai-v1'
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('AI prediction error:', error)
    return new Response(JSON.stringify({ error: 'Prediction failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
}

function calculateProcessingTime(app) {
  let days = 2
  if (!app.result_slip_url) days += 3
  if (!app.pop_url) days += 2
  if (app.grades?.length < 6) days += 2
  return Math.max(days, 1)
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
