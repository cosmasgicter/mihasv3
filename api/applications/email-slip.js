import { supabaseAdminClient } from '../_lib/supabaseClient.js';
import { withNetlifyHandler } from '../_lib/netlifyHandler.js';
import { ensureApplicationAccess } from './_ensureAccess.js';

const supabase = supabaseAdminClient;

async function handler(req, res) {
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
      .from('applications_new')
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

    // Add to email queue (simplified - in production you'd send actual email)
    const { error: emailError } = await supabase
      .from('email_queue')
      .insert({
        recipient_email: recipientEmail,
        subject: `Application Slip - ${application.application_number}`,
        template_name: 'application_slip',
        template_data: {
          applicationNumber: application.application_number,
          fullName: application.full_name,
          program: application.program,
          institution: application.institution,
          trackingCode: application.public_tracking_code
        },
        status: 'pending'
      });

    if (emailError) {
      console.error('Email queue error:', emailError);
      return res.status(500).json({ error: 'Failed to queue email' });
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
