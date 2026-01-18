import { supabaseAdminClient, getUserFromRequest } from '../_lib/supabaseClient.js';

export async function onRequest(context) {
  const { request } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  try {
    const authContext = await getUserFromRequest(request);
    if (authContext.error || !authContext.isAdmin) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    if (request.method === 'POST') {
      const body = await request.json();
      const { application_id, scheduled_at, mode, location, notes } = body;
      
      if (!application_id || !scheduled_at || !mode) {
        return new Response(JSON.stringify({ success: false, error: 'Missing required fields' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      const supabase = supabaseAdminClient;
      
      // Verify payment status before allowing interview scheduling
      // Requirements 1.8, 7.1: Interview scheduling blocked without verified payment
      const { data: application, error: appError } = await supabase
        .from('applications')
        .select('id, payment_status, status')
        .eq('id', application_id)
        .single();
      
      if (appError || !application) {
        return new Response(JSON.stringify({ success: false, error: 'Application not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      if (application.payment_status !== 'verified') {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Payment must be verified before scheduling an interview' 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Requirements 7.4: Prevent double-booking - check for existing active interview
      const { data: existingInterview, error: existingError } = await supabase
        .from('application_interviews')
        .select('id, status, scheduled_at')
        .eq('application_id', application_id)
        .in('status', ['scheduled', 'rescheduled'])
        .maybeSingle();
      
      if (existingError) {
        return new Response(JSON.stringify({ success: false, error: 'Failed to check existing interviews' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      if (existingInterview) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'An active interview is already scheduled for this application. Please cancel or complete the existing interview first.' 
        }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      const { data, error } = await supabase
        .from('application_interviews')
        .insert({
          application_id,
          scheduled_at,
          mode,
          location,
          notes,
          status: 'scheduled',
          created_by: authContext.user.id
        })
        .select()
        .single();
      
      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify({ success: true, data }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    if (request.method === 'GET') {
      const url = new URL(request.url);
      const applicationId = url.searchParams.get('application_id');
      
      try {
        let query = supabaseAdminClient
          .from('application_interviews')
          .select('*')
          .order('scheduled_at', { ascending: false });
        
        if (applicationId) {
          query = query.eq('application_id', applicationId);
        }
        
        const { data, error } = await query;
        
        if (error) {
          // If table doesn't exist, return empty array
          if (error.message?.includes('does not exist') || error.code === 'PGRST116') {
            return new Response(JSON.stringify({ success: true, data: [] }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          throw error;
        }
        
        return new Response(JSON.stringify({ success: true, data: data || [] }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        // Return empty array if table doesn't exist
        return new Response(JSON.stringify({ success: true, data: [] }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }
    
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
