import { createSupabaseAdminClient } from '../_lib/supabaseClient.js';
import { sendEmail } from '../_lib/emailService.js';

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
    const { applicationNumber } = await request.json();

    if (!applicationNumber) {
      return new Response(JSON.stringify({ error: 'Application number required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseAdmin = createSupabaseAdminClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    const { data: application, error: appError } = await supabaseAdmin
      .from('applications')
      .select('*')
      .eq('application_number', applicationNumber)
      .single();

    if (appError || !application) {
      return new Response(JSON.stringify({ error: 'Application not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const title = '✅ Application Submitted Successfully';
    const content = `Your application #${application.application_number} for ${application.program} has been submitted successfully and is under review.`;

    // Send email
    const emailResult = await sendEmail({
      to: application.email,
      subject: title,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #10b981;">${title}</h2>
          <p style="color: #374151; line-height: 1.6;">Dear ${application.full_name},</p>
          <p style="color: #374151; line-height: 1.6;">${content}</p>
          <p style="color: #374151; line-height: 1.6;">Our admissions team will review your application and notify you of the outcome.</p>
          <a href="${env.VITE_APP_URL || '***REMOVED***'}/student/application/${application.id}" 
             style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0;">
            View Application
          </a>
          <hr style="border: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #6b7280; font-size: 12px;">MIHAS Application System</p>
        </div>
      `,
      env
    });

    // Create in-app notification
    await supabaseAdmin.from('in_app_notifications').insert({
      user_id: application.user_id,
      title,
      content,
      type: 'success',
      action_url: `/student/application/${application.id}`,
      read: false
    });

    return new Response(JSON.stringify({ 
      success: true,
      emailSent: emailResult.success,
      error: emailResult.error
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Send notification error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
