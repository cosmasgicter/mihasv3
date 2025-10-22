import { supabaseAdminClient, getUserFromRequest } from '../../_lib/supabaseClient.js';
import { generateApplicationSlip } from '../../_lib/applicationSlip.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

function renderApplicationSlipEmail(data) {
  const escapeHtml = (str) => String(str || '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);

  const formatStatus = (val) => val.replace(/[_\s]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>MIHAS Application Slip</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f6f9;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f6f9;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 10px 40px rgba(15,23,42,0.08);">
          <tr>
            <td style="padding:32px 40px;">
              <h1 style="font-size:24px;margin:0 0 12px;color:#111827;">Your application slip is ready</h1>
              <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#374151;">
                Hello ${escapeHtml(data.applicantName)},<br/>
                A digital copy of your MIHAS application slip is now available. You can download it using the secure link below.
              </p>
              <a href="${escapeHtml(data.slipUrl)}" style="display:inline-block;padding:14px 28px;background-color:#0ea5e9;color:#ffffff;font-weight:600;border-radius:9999px;text-decoration:none;margin-bottom:24px;">Download your slip</a>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border-radius:10px;overflow:hidden;box-shadow:inset 0 0 0 1px #e5e7eb;">
                <tr>
                  <td style="padding:12px 16px;font-weight:600;color:#1f2937;background-color:#f9fafb;border-bottom:1px solid #e5e7eb;width:40%;">Application number</td>
                  <td style="padding:12px 16px;color:#111827;background-color:#ffffff;border-bottom:1px solid #e5e7eb;">${escapeHtml(data.applicationNumber)}</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;font-weight:600;color:#1f2937;background-color:#f9fafb;border-bottom:1px solid #e5e7eb;">Tracking code</td>
                  <td style="padding:12px 16px;color:#111827;background-color:#ffffff;border-bottom:1px solid #e5e7eb;">${escapeHtml(data.trackingCode)}</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;font-weight:600;color:#1f2937;background-color:#f9fafb;border-bottom:1px solid #e5e7eb;">Status</td>
                  <td style="padding:12px 16px;color:#111827;background-color:#ffffff;border-bottom:1px solid #e5e7eb;">${formatStatus(data.status)}</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;font-weight:600;color:#1f2937;background-color:#f9fafb;border-bottom:1px solid #e5e7eb;">Programme</td>
                  <td style="padding:12px 16px;color:#111827;background-color:#ffffff;border-bottom:1px solid #e5e7eb;">${escapeHtml(data.programName || 'Not specified')}</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;font-weight:600;color:#1f2937;background-color:#f9fafb;">Payment status</td>
                  <td style="padding:12px 16px;color:#111827;background-color:#ffffff;">${formatStatus(data.paymentStatus || 'Pending review')}</td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:15px;line-height:1.6;color:#4b5563;">
                If the button above does not work, copy and paste this link into your browser:<br/>
                <span style="color:#2563eb;word-break:break-all;">${escapeHtml(data.slipUrl)}</span>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;background-color:#f9fafb;color:#4b5563;font-size:12px;text-align:center;">
              © ${new Date().getFullYear()} MIHAS. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

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

    const { applicationId, applicationNumber, email } = await request.json();
    
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

    const recipientEmail = email || application.email;
    if (!recipientEmail) {
      return new Response(JSON.stringify({ 
        error: 'No email address provided' 
      }), {
        status: 400,
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
      email: recipientEmail,
      phone: application.phone,
      nationality: application.nationality,
      admin_feedback: application.admin_feedback,
      admin_feedback_date: application.admin_feedback_date
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
      return new Response(JSON.stringify({ 
        error: 'Failed to store slip',
        message: uploadError.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get public URL
    const { data: publicUrl } = supabaseAdminClient.storage
      .from('app_docs')
      .getPublicUrl(uploadData.path);

    // Update application_documents table
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

    // Send email via Supabase Edge Function
    const html = renderApplicationSlipEmail({
      applicantName: application.full_name || recipientEmail,
      applicationNumber: application.application_number,
      trackingCode: application.public_tracking_code,
      status: application.status,
      slipUrl: publicUrl.publicUrl,
      programName: application.program,
      paymentStatus: application.payment_status
    });

    const { data: emailResult, error: emailError } = await supabaseAdminClient.functions.invoke('send-email', {
      body: {
        to: recipientEmail,
        subject: 'Your MIHAS Application Slip',
        html
      }
    });

    if (emailError) {
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Failed to send email',
        message: emailError.message,
        slipUrl: publicUrl.publicUrl
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Application slip sent successfully',
      slipUrl: publicUrl.publicUrl
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Email slip error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to email slip',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
