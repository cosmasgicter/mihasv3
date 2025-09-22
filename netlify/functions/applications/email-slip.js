import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { applicationId, email } = req.body;

    if (!applicationId || !email) {
      return res.status(400).json({ error: 'Application ID and email are required' });
    }

    // Get application data
    const { data: application, error } = await supabase
      .from('applications')
      .select('*')
      .eq('id', applicationId)
      .single();

    if (error || !application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Add to email queue (simplified - in production you'd send actual email)
    const { error: emailError } = await supabase
      .from('email_queue')
      .insert({
        recipient_email: email,
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