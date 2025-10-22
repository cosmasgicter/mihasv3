import { supabaseAdminClient, getUserFromRequest } from '../../_lib/supabaseClient.js';
import { generateApplicationSlip } from '../../_lib/applicationSlip.js';

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
    const user = await getUserFromRequest(request);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { applicationId } = await request.json();
    if (!applicationId) {
      return new Response(JSON.stringify({ error: 'Application ID required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch application with all required data
    const { data: application, error: fetchError } = await supabaseAdminClient
      .from('applications')
      .select(`
        *,
        programs:program_id(name),
        intakes:intake_id(name),
        user_profiles:user_id(full_name, email, phone)
      `)
      .eq('id', applicationId)
      .eq('user_id', user.id)
      .single();

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
      program_name: application.programs?.name,
      intake_name: application.intakes?.name,
      institution: application.institution,
      full_name: application.user_profiles?.full_name,
      email: application.user_profiles?.email,
      phone: application.user_profiles?.phone,
      nationality: application.nationality,
      admin_feedback: application.admin_feedback
    };

    // Generate PDF
    const pdfBuffer = await generateApplicationSlip(slipData);

    // Store in Supabase Storage
    const fileName = `${user.id}/${application.application_number}/${Date.now()}-slip.pdf`;
    const { data: uploadData, error: uploadError } = await supabaseAdminClient.storage
      .from('app_docs')
      .upload(fileName, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadError) {
      console.error('Storage upload failed:', uploadError);
    } else {
      // Update application_documents table
      const { data: publicUrl } = supabaseAdminClient.storage
        .from('app_docs')
        .getPublicUrl(uploadData.path);

      await supabaseAdminClient
        .from('application_documents')
        .upsert({
          application_id: application.id,
          document_type: 'application_slip',
          document_name: `Application Slip - ${application.application_number}.pdf`,
          file_url: publicUrl.publicUrl,
          system_generated: true,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'application_id,document_type'
        });
    }

    // Return PDF
    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="application-slip-${application.application_number}.pdf"`,
        'Cache-Control': 'no-cache'
      }
    });

  } catch (error) {
    console.error('Slip generation error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to generate slip',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
