import { sendEmail } from './_lib/emailService.js';

export async function onRequest(context) {
  const { request, env } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  
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
    const { to } = await request.json();
    
    if (!to) {
      return new Response(JSON.stringify({ error: 'Email address required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const result = await sendEmail({
      to,
      subject: 'MIHAS Email System Test',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">✅ Email System Working!</h2>
          <p style="color: #374151; line-height: 1.6;">
            This is a test email from the MIHAS Application System.
          </p>
          <p style="color: #374151; line-height: 1.6;">
            If you received this email, the email notification system is configured correctly.
          </p>
          <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #374151;">
              <strong>✅ Status:</strong> Email service operational<br>
              <strong>📧 Provider:</strong> Resend<br>
              <strong>🕐 Sent:</strong> ${new Date().toLocaleString()}
            </p>
          </div>
          <hr style="border: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #6b7280; font-size: 12px;">
            MIHAS Application System - Automated Email Test
          </p>
        </div>
      `,
      env
    });
    
    if (!result.success) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: result.error,
        configured: !!env.RESEND_API_KEY
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Test email sent successfully',
      emailId: result.id,
      to
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
