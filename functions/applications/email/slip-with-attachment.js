import { getUserFromRequest, createSupabaseAdminClient } from '../../_lib/supabaseClient.js';
import { sendEmailWithPDF } from '../../_lib/emailService.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export async function onRequest(context) {
  const { request, env } = context;

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

    const { applicationId } = await request.json();
    if (!applicationId) {
      return new Response(JSON.stringify({ error: 'Application ID required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseAdmin = createSupabaseAdminClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // Fetch application
    const { data: application, error: fetchError } = await supabaseAdmin
      .from('applications')
      .select('*')
      .eq('id', applicationId)
      .eq('user_id', authResult.user.id)
      .single();

    if (fetchError || !application) {
      return new Response(JSON.stringify({ error: 'Application not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if slip document exists in storage
    const slipPath = `${application.user_id}/${application.application_number}/application-slip.pdf`;
    const { data: slipFile } = await supabaseAdmin.storage
      .from('app_docs')
      .download(slipPath);

    if (!slipFile) {
      return new Response(JSON.stringify({ 
        error: 'Slip not found. Please generate it first by clicking Download Slip.' 
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Convert blob to buffer
    const arrayBuffer = await slipFile.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);

    // Send email with PDF attachment
    const emailResult = await sendEmailWithPDF({
      to: application.email,
      subject: `Your MIHAS Application Slip - ${application.application_number}`,
      html: `
        <h2>Your Application Slip</h2>
        <p>Dear ${application.full_name},</p>
        <p>Please find your application slip attached to this email.</p>
        <p><strong>Application Number:</strong> ${application.application_number}</p>
        <p><strong>Tracking Code:</strong> ${application.public_tracking_code}</p>
        <p><strong>Program:</strong> ${application.program}</p>
        <p>Keep this slip for your records.</p>
        <p>Best regards,<br>MIHAS Admissions Team</p>
      `,
      pdfBuffer,
      pdfFilename: `Application-Slip-${application.application_number}.pdf`
    });

    if (!emailResult.success) {
      return new Response(JSON.stringify({ error: emailResult.error }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Email sent successfully with slip attachment'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Email slip error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
