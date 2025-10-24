import { supabaseAdminClient, getUserFromRequest } from '../../_lib/supabaseClient.js'

export async function onRequest(context) {
  const { request } = context
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  }
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    const authContext = await getUserFromRequest(request)
    if (authContext.error || !authContext.isAdmin) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403, headers: corsHeaders
      })
    }

    if (request.method === 'GET') {
      const { data, error } = await supabaseAdminClient
        .from('workflow_rules')
        .select('*')
        .order('priority', { ascending: false })

      if (error) throw error
      return new Response(JSON.stringify({ success: true, data }), {
        status: 200, headers: corsHeaders
      })
    }

    if (request.method === 'POST') {
      const body = await request.json()
      
      const { data, error } = await supabaseAdminClient
        .from('workflow_rules')
        .insert({
          ...body,
          created_by: authContext.user.id
        })
        .select()
        .single()

      if (error) throw error
      return new Response(JSON.stringify({ success: true, data }), {
        status: 201, headers: corsHeaders
      })
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: corsHeaders
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: corsHeaders
    })
  }
}
