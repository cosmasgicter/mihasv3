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
    const { applicationId } = req.body;

    if (!applicationId) {
      return res.status(400).json({ error: 'Application ID is required' });
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

    // Generate simple slip data
    const slipData = {
      applicationNumber: application.application_number,
      fullName: application.full_name,
      program: application.program,
      institution: application.institution,
      intake: application.intake,
      status: application.status,
      trackingCode: application.public_tracking_code,
      createdAt: application.created_at,
      applicationFee: application.application_fee || 153.00
    };

    return res.status(200).json({
      success: true,
      data: slipData
    });

  } catch (error) {
    console.error('Generate slip error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}