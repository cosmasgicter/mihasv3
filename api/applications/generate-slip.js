import { supabaseAdminClient, getUserFromRequest } from '../_lib/supabaseClient.js';
import { withNetlifyHandler } from '../_lib/netlifyHandler.js';

const supabase = supabaseAdminClient;

async function ensureApplicationAccess(req, applicationId) {
  const authContext = await getUserFromRequest(req);
  if (authContext.error) {
    const status = authContext.error === 'Access denied' ? 403 : 401;
    return { error: authContext.error, status };
  }

  if (authContext.isAdmin) {
    return { authContext };
  }

  const { data, error } = await supabase
    .from('applications_new')
    .select('id, user_id')
    .eq('id', applicationId)
    .maybeSingle();

  if (error) {
    return { error: error.message, status: 400 };
  }

  if (!data) {
    return { error: 'Application not found', status: 404 };
  }

  if (data.user_id !== authContext.user.id) {
    return { error: 'Access denied', status: 403 };
  }

  return { authContext };
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { applicationId } = req.body;

    if (!applicationId) {
      return res.status(400).json({ error: 'Application ID is required' });
    }

    const { error: authError, status: authStatus } = await ensureApplicationAccess(req, applicationId);
    if (authError) {
      return res.status(authStatus).json({ error: authError });
    }

    // Get application data
    const { data: application, error } = await supabase
      .from('applications_new')
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

const netlifyHandler = withNetlifyHandler(handler)

export { handler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler
