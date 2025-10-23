import { supabaseAdminClient, getUserFromRequest } from '../../_lib/supabaseClient.js';


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export async function onRequest(context) {
  const { request } = context;
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const authResult = await getUserFromRequest(request);
    if (authResult.error) {
      return new Response(JSON.stringify({ error: authResult.error }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const { user } = authResult;

    const { applicationId, applicationNumber } = await request.json();
    
    if (!applicationId && !applicationNumber) {
      return new Response(JSON.stringify({ error: 'Application ID or number required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch application with all required data
    let query = supabaseAdminClient
      .from('applications')
      .select('*')
      .eq('user_id', user.id);
    
    if (applicationId) {
      query = query.eq('id', applicationId);
    } else {
      query = query.eq('application_number', applicationNumber);
    }

    const { data: application, error: fetchError } = await query.single();

    if (fetchError || !application) {
      return new Response(JSON.stringify({ 
        error: 'Application not found or access denied' 
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Transform data for slip generation
    const slipData = {
      application_number: application.application_number,
      public_tracking_code: application.public_tracking_code,
      status: application.status,
      payment_status: application.payment_status,
      submitted_at: application.submitted_at,
      updated_at: application.updated_at,
      program_name: application.program,
      intake_name: application.intake,
      institution: application.institution,
      institution_name: application.institution,
      full_name: application.full_name,
      email: application.email,
      phone: application.phone,
      nationality: application.nationality,
      admin_feedback: application.admin_feedback,
      admin_feedback_date: application.admin_feedback_date
    };

    // Return slip data for frontend generation
    return new Response(JSON.stringify({ 
      success: true,
      data: slipData
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Slip generation error:', error);
    console.error('Error stack:', error.stack);
    return new Response(JSON.stringify({ 
      error: 'Failed to generate slip',
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join('\n')
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
