import { supabaseAdminClient, getUserFromRequest } from '../../_lib/supabaseClient.js'

export async function onRequest(context) {
  const { request } = context
  const url = new URL(request.url)
  const id = url.pathname.split('/').filter(Boolean).pop()
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
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

    if (request.method === 'PUT') {
      const body = await request.json()
      
      const { data, error } = await supabaseAdminClient
        .from('workflow_rules')
        .update({ ...body, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return new Response(JSON.stringify({ success: true, data }), {
        status: 200, headers: corsHeaders
      })
    }

    if (request.method === 'DELETE') {
      const { error } = await supabaseAdminClient
        .from('workflow_rules')
        .delete()
        .eq('id', id)

      if (error) throw error
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: corsHeaders
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
