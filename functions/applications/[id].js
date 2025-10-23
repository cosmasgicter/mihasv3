import { supabaseAdminClient, getUserFromRequest } from '../_lib/supabaseClient.js';

async function fetchApplicationDetails(id, includeParam) {
  const { data: application, error } = await supabaseAdminClient
    .from('applications')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!application) return null;

  const result = { ...application };
  const includes = includeParam ? String(includeParam).split(',') : ['grades', 'documents', 'statusHistory'];

  if (includes.includes('grades')) {
    const { data: grades } = await supabaseAdminClient
      .from('application_grades')
      .select('id, grade, subject_id')
      .eq('application_id', id);
    
    let subjectNames = {};
    if (grades?.length > 0) {
      const { data: subjects } = await supabaseAdminClient
        .from('subjects')
        .select('id, name')
        .in('id', [...new Set(grades.map(g => g.subject_id))]);
      subjectNames = subjects?.reduce((acc, s) => ({ ...acc, [s.id]: s.name }), {}) || {};
    }
    
    result.grades = (grades || []).map(g => ({ ...g, subject_name: subjectNames[g.subject_id] || 'Unknown' }));
  }

  if (includes.includes('documents')) {
    const { data: documents } = await supabaseAdminClient
      .from('application_documents')
      .select('*')
      .eq('application_id', id);
    result.documents = documents || [];
  }

  if (includes.includes('statusHistory')) {
    const { data: statusHistory } = await supabaseAdminClient
      .from('application_status_history')
      .select('*')
      .eq('application_id', id)
      .order('created_at', { ascending: false });
    result.statusHistory = statusHistory || [];
  }

  return result;
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const id = url.pathname.split('/').pop();
  const include = url.searchParams.get('include');
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  if (request.method === 'GET') {
    try {
      const authContext = await getUserFromRequest(request);
      if (authContext.error) {
        return new Response(JSON.stringify({ error: authContext.error }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Check access
      if (!authContext.isAdmin) {
        const { data: app } = await supabaseAdminClient
          .from('applications')
          .select('user_id')
          .eq('id', id)
          .single();
        
        if (!app || app.user_id !== authContext.user.id) {
          return new Response(JSON.stringify({ error: 'Access denied' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }
      
      const data = await fetchApplicationDetails(id, include);
      if (!data) {
        return new Response(JSON.stringify({ error: 'Application not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify({
        success: true,
        data,
        application: data,
        grades: data.grades || [],
        documents: data.documents || [],
        statusHistory: data.statusHistory || []
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
  
  if (request.method === 'DELETE') {
    try {
      const authContext = await getUserFromRequest(request);
      if (authContext.error || !authContext.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { data: app } = await supabaseAdminClient
        .from('applications')
        .select('user_id')
        .eq('id', id)
        .single();
      
      if (!app || (app.user_id !== authContext.user.id && !authContext.isAdmin)) {
        return new Response(JSON.stringify({ error: 'Access denied' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { error } = await supabaseAdminClient
        .from('applications')
        .delete()
        .eq('id', id);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
  
  if (request.method === 'PUT' || request.method === 'PATCH') {
    try {
      const authContext = await getUserFromRequest(request);
      if (authContext.error || !authContext.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const body = await request.json();
      
      // Check ownership
      const { data: app } = await supabaseAdminClient
        .from('applications')
        .select('user_id')
        .eq('id', id)
        .single();
      
      if (!app || (app.user_id !== authContext.user.id && !authContext.isAdmin)) {
        return new Response(JSON.stringify({ error: 'Access denied' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Handle PATCH actions
      if (request.method === 'PATCH' && body.action) {
        const { action, ...payload } = body;
        
        if (action === 'update_status') {
          const { status, notes } = payload;
          const { data, error } = await supabaseAdminClient
            .from('applications')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();
          
          if (!error && notes) {
            await supabaseAdminClient.from('application_status_history').insert({
              application_id: id,
              status,
              changed_by: authContext.user.id,
              notes,
              created_at: new Date().toISOString()
            });
          }
          
          if (error) throw new Error(error.message);
          return new Response(JSON.stringify({ success: true, data }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        if (action === 'update_payment_status') {
          const { paymentStatus, verificationNotes } = payload;
          const updateData = { 
            payment_status: paymentStatus, 
            updated_at: new Date().toISOString() 
          };
          if (paymentStatus === 'verified') {
            updateData.payment_verified_at = new Date().toISOString();
          }
          
          const { data, error } = await supabaseAdminClient
            .from('applications')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();
          
          if (error) throw new Error(error.message);
          return new Response(JSON.stringify({ success: true, data }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // Regular update
      const { data, error } = await supabaseAdminClient
        .from('applications')
        .update(body)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ success: true, data }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
  
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
