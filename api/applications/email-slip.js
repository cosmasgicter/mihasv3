import { supabaseAdminClient } from '../_lib/supabaseClient.js';
import { withNetlifyHandler } from '../_lib/netlifyHandler.js';
import { ensureApplicationAccess } from './_ensureAccess.js';

const supabase = supabaseAdminClient;

async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
  if (req.method === "OPTIONS") return res.status(200).end()
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { applicationId, email: requestedEmail } = req.body || {};

    if (!applicationId) {
      return res.status(400).json({ error: 'Application ID is required' });
    }

    const { authContext, error: authError, status: authStatus } = await ensureApplicationAccess(req, applicationId);
    if (authError) {
      return res.status(authStatus).json({ error: authError });
    }

    // Get application data
    let applicationQuery = supabase
      .from('applications')
      .select('*')
      .eq('id', applicationId);

    if (!authContext.isAdmin) {
      applicationQuery = applicationQuery.eq('user_id', authContext.user.id);
    }

    const { data: application, error } = await applicationQuery.single();

    if (error || !application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const preferredEmails = [
      authContext.isAdmin ? requestedEmail : undefined,
      application.email,
      authContext.user.email
    ].filter((candidate) => typeof candidate === 'string' && candidate.trim().length > 0);

    const recipientEmail = preferredEmails.length > 0 ? preferredEmails[0].trim() : null;

    if (!recipientEmail) {
      return res.status(400).json({ error: 'No recipient email available' });
    }

    // Generate application slip PDF
    const { generateApplicationSlip } = await import('../_lib/applicationSlip.js');
    
    const slipData = {
      application_number: application.application_number,
      public_tracking_code: application.public_tracking_code,
      full_name: application.full_name,
      email: application.email,
      phone: application.phone,
      program_name: application.program,
      intake_name: application.intake,
      institution: application.institution,
      status: application.status,
      payment_status: application.payment_status,
      submitted_at: application.submitted_at,
      updated_at: application.updated_at
    };

    const pdfBuffer = await generateApplicationSlip(slipData);
    const pdfBase64 = pdfBuffer.toString('base64');

    // Generate email HTML using unified template
    const { generateApplicationSlipEmail } = await import('../_lib/emailTemplates.js');
    
    const emailHtml = generateApplicationSlipEmail({
      full_name: application.full_name,
      application_number: application.application_number,
      public_tracking_code: application.public_tracking_code,
      program_name: application.program,
      status: application.status,
      submitted_at: application.submitted_at,
      slipUrl: `https://apply.mihas.edu.zm/track-application?code=${application.public_tracking_code}`
    });

    // Send email with PDF attachment
    const { data: emailResult, error: emailError } = await supabase.functions.invoke('send-email', {
      body: {
        to: recipientEmail,
        subject: `Application Slip - ${application.application_number}`,
        html: emailHtml,
        attachments: [{
          filename: `application-slip-${application.application_number}.pdf`,
          content: pdfBase64,
          type: 'application/pdf',
          disposition: 'attachment'
        }]
      }
    });

    if (emailError) {
      console.error('Email send error:', emailError);
      return res.status(500).json({ error: 'Failed to send email' });
    }

    if (!emailResult?.success) {
      console.error('Email provider error:', emailResult?.error);
      return res.status(500).json({ error: 'Email delivery failed' });
    }

    return res.status(200).json({
      success: true,
      message: 'Application slip has been sent to your email'
    });

  } catch (error) {
    console.error('Email slip error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

const netlifyHandler = withNetlifyHandler(handler)

export { handler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler
