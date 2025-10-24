import { supabaseAdminClient, getUserFromRequest } from '../../../_lib/supabaseClient.js'

export async function onRequest(context) {
  const { request } = context
  const url = new URL(request.url)
  const userId = url.pathname.split('/').filter(Boolean).pop()
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  }
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    const authContext = await getUserFromRequest(request)
    if (authContext.error || !authContext.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: corsHeaders
      })
    }

    if (authContext.user.id !== userId && !authContext.isAdmin) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403, headers: corsHeaders
      })
    }

    if (request.method === 'GET') {
      const { data, error } = await supabaseAdminClient
        .from('user_notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()

      if (error) throw error
      
      return new Response(JSON.stringify({ success: true, data }), {
        status: 200, headers: corsHeaders
      })
    }

    if (request.method === 'PUT') {
      const body = await request.json()
      
      const { data, error } = await supabaseAdminClient
        .from('user_notification_preferences')
        .upsert({
          user_id: userId,
          ...body,
          updated_at: new Date().toISOString()
        })
        .select()
        .single()

      if (error) throw error

      return new Response(JSON.stringify({ success: true, data }), {
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
