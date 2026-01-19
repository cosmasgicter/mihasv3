import { sendEmail } from '../../_lib/emailService.js';
import { supabaseAdminClient } from '../../_lib/supabaseClient.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export async function onRequest(context) {
  const { request, env } = context

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    const { email, fullName, draftName, lastUpdated } = await request.json()

    if (!email || !fullName) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Complete Your Application</h1>
          </div>
          <div class="content">
            <p>Dear ${fullName},</p>
            <p>We noticed you started an application but haven't completed it yet.</p>
            ${draftName ? `<p><strong>Draft:</strong> ${draftName}</p>` : ''}
            ${lastUpdated ? `<p><strong>Last Updated:</strong> ${new Date(lastUpdated).toLocaleDateString()}</p>` : ''}
            <p>Don't miss out on your opportunity to join MIHAS! Complete your application today.</p>
            <a href="${env.PUBLIC_URL || 'https://mihasv3.pages.dev'}/student/application-wizard" class="button">
              Continue Application
            </a>
            <p>If you have any questions, please contact us at ***REMOVED***</p>
          </div>
          <div class="footer">
            <p>Mukuba Institute of Health and Allied Sciences</p>
            <p>This is an automated reminder. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `

    const subject = 'Complete Your MIHAS Application';
    
    // Log to Supabase email_queue
    const supabaseAdmin = supabaseAdminClient;
    await supabaseAdmin.from('email_queue').insert({
      to_email: email,
      subject,
      template: 'application_reminder',
      template_data: { full_name: fullName, draft_name: draftName, last_updated: lastUpdated },
      status: 'sending',
      priority: 'normal'
    });

    // Send email via Resend
    const emailResult = await sendEmail({
      to: email,
      subject,
      html: emailHtml,
      env
    });

    // Update email_queue status
    if (emailResult.success) {
      await supabaseAdmin.from('email_queue')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('to_email', email)
        .eq('subject', subject)
        .order('created_at', { ascending: false })
        .limit(1);
    } else {
      await supabaseAdmin.from('email_queue')
        .update({ status: 'failed', error_message: emailResult.error })
        .eq('to_email', email)
        .eq('subject', subject)
        .order('created_at', { ascending: false })
        .limit(1);
      throw new Error(emailResult.error || 'Failed to send email');
    }

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Reminder sent successfully'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Reminder error:', error)
    return new Response(JSON.stringify({ 
      error: 'Failed to send reminder',
      details: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}
