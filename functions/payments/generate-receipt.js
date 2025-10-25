import { supabaseAdminClient, getUserFromRequest } from '../_lib/supabaseClient.js';

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const applicationId = url.searchParams.get('applicationId');
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  try {
    const authContext = await getUserFromRequest(request);
    if (authContext.error || !authContext.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    if (!applicationId) {
      return new Response(JSON.stringify({ error: 'Application ID required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const supabase = supabaseAdminClient;
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select('*')
      .eq('id', applicationId)
      .single();
    
    if (appError || !application) {
      return new Response(JSON.stringify({ error: 'Application not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    if (!authContext.isAdmin && application.user_id !== authContext.user.id) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    if (application.payment_status !== 'verified') {
      return new Response(JSON.stringify({ error: 'Payment not verified' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    let receiptNumber = application.receipt_number;
    if (!receiptNumber) {
      const timestamp = Date.now().toString(36).toUpperCase();
      const random = Math.random().toString(36).substring(2, 6).toUpperCase();
      receiptNumber = `RCP-${timestamp}-${random}`;
      
      await supabase
        .from('applications')
        .update({ receipt_number: receiptNumber })
        .eq('id', applicationId);
    }
    
    let verifierName = 'System';
    if (application.payment_verified_by) {
      const { data: verifier } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', application.payment_verified_by)
        .single();
      
      if (verifier?.full_name) {
        verifierName = verifier.full_name;
      }
    }
    
    const receiptData = {
      receiptNumber,
      applicationNumber: application.application_number,
      studentName: application.full_name,
      email: application.email,
      phone: application.phone,
      program: application.program,
      institution: application.institution || 'MIHAS',
      amount: application.amount || 153,
      paymentMethod: application.payment_method,
      paymentReference: application.momo_ref,
      paymentDate: application.paid_at || application.created_at,
      verifiedDate: application.payment_verified_at,
      verifiedBy: verifierName
    };
    
    return new Response(JSON.stringify({ success: true, data: receiptData }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Receipt generation error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
