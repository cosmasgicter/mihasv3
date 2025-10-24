import { supabaseAdminClient } from '../_lib/supabaseClient.js'

export async function onRequestGet(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  }

  try {
    const authHeader = context.request.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = supabaseAdminClient
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Return basic schema information
    const schema = {
      tables: [
        { name: 'applications', description: 'Student applications' },
        { name: 'profiles', description: 'User profiles' },
        { name: 'programs', description: 'Academic programs' },
        { name: 'intakes', description: 'Intake periods' },
        { name: 'subjects', description: 'Academic subjects' }
      ],
      version: '1.0.0',
      generated_at: new Date().toISOString()
    }

    return new Response(JSON.stringify({ success: true, schema }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
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