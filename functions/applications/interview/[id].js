import { supabaseAdminClient, getUserFromRequest } from '../../_lib/supabaseClient.js'

export async function onRequest(context) {
  const { request } = context
  const url = new URL(request.url)
  const applicationId = url.pathname.split('/').filter(Boolean)[1]
  
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
    if (authContext.error || !authContext.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: corsHeaders
      })
    }

    if (request.method === 'GET') {
      const { data, error } = await supabaseAdminClient
        .from('application_interviews')
        .select('*')
        .eq('application_id', applicationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) throw error
      return new Response(JSON.stringify({ success: true, data }), {
        status: 200, headers: corsHeaders
      })
    }

    if (!authContext.isAdmin) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403, headers: corsHeaders
      })
    }

    if (request.method === 'POST') {
      const body = await request.json()
      const { scheduled_at, mode, location, notes } = body

      const { data: interview, error } = await supabaseAdminClient
        .from('application_interviews')
        .insert({
          application_id: applicationId,
          scheduled_at,
          mode,
          location,
          notes,
          status: 'scheduled',
          created_by: authContext.user.id,
          updated_by: authContext.user.id
        })
        .select()
        .single()

      if (error) throw error

      const { data: app } = await supabaseAdminClient
        .from('applications')
        .select('user_id, application_number, full_name, email')
        .eq('id', applicationId)
        .single()

      if (app) {
        await supabaseAdminClient.from('in_app_notifications').insert({
          user_id: app.user_id,
          title: '📅 Interview Scheduled',
          content: `Your interview for application #${app.application_number} has been scheduled for ${new Date(scheduled_at).toLocaleString()}.`,
          type: 'info',
          action_url: `/student/application/${applicationId}`,
          read: false
        })
      }

      return new Response(JSON.stringify({ success: true, data: interview }), {
        status: 201, headers: corsHeaders
      })
    }

    if (request.method === 'PUT') {
      const body = await request.json()
      const { scheduled_at, mode, location, notes, status } = body

      const { data: interview, error } = await supabaseAdminClient
        .from('application_interviews')
        .update({
          scheduled_at,
          mode,
          location,
          notes,
          status,
          updated_by: authContext.user.id,
          updated_at: new Date().toISOString()
        })
        .eq('application_id', applicationId)
        .select()
        .single()

      if (error) throw error

      const { data: app } = await supabaseAdminClient
        .from('applications')
        .select('user_id, application_number')
        .eq('id', applicationId)
        .single()

      if (app) {
        await supabaseAdminClient.from('in_app_notifications').insert({
          user_id: app.user_id,
          title: status === 'cancelled' ? '❌ Interview Cancelled' : '🔄 Interview Rescheduled',
          content: status === 'cancelled' 
            ? `Your interview for application #${app.application_number} has been cancelled.`
            : `Your interview for application #${app.application_number} has been rescheduled to ${new Date(scheduled_at).toLocaleString()}.`,
          type: status === 'cancelled' ? 'warning' : 'info',
          action_url: `/student/application/${applicationId}`,
          read: false
        })
      }

      return new Response(JSON.stringify({ success: true, data: interview }), {
        status: 200, headers: corsHeaders
      })
    }

    if (request.method === 'DELETE') {
      const { error } = await supabaseAdminClient
        .from('application_interviews')
        .update({ 
          status: 'cancelled',
          updated_by: authContext.user.id,
          updated_at: new Date().toISOString()
        })
        .eq('application_id', applicationId)

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
