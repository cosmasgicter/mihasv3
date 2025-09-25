import { supabaseAdminClient } from '../_lib/supabaseClient.js';
import { withNetlifyHandler } from '../_lib/netlifyHandler.js';
import { ensureApplicationAccess } from './_ensureAccess.js';

const supabase = supabaseAdminClient;

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { applicationId } = req.body;

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

const netlifyHandler = withNetlifyHandler(handler)

export { handler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler
