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
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">${title}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px;">
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">Dear ${application.full_name},</p>
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">${content}</p>
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">Our admissions team will review your application and notify you of the outcome.</p>
              
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 6px; padding: 20px; margin: 20px 0;">
                <tr>
                  <td>
                    <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px;"><strong>Application Number:</strong> ${application.application_number}</p>
                    <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px;"><strong>Program:</strong> ${application.program}</p>
                    <p style="margin: 0; color: #6b7280; font-size: 14px;"><strong>Status:</strong> Under Review</p>
                  </td>
                </tr>
              </table>
              
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${env.VITE_APP_URL || 'https://apply.mihas.edu.zm'}/student/application/${application.id}" 
                       style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: bold;">
                      View Application
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #6b7280; font-size: 12px; margin: 0;">MIHAS Application System</p>
              <p style="color: #9ca3af; font-size: 11px; margin: 5px 0 0 0;">Mukuba Institute of Health and Allied Sciences</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
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
