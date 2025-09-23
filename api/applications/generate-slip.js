import { supabaseAdminClient, getUserFromRequest } from '../_lib/supabaseClient.js';
import { logAuditEvent } from '../_lib/auditLogger.js';
import { withNetlifyHandler } from '../_lib/netlifyHandler.js';

const supabase = supabaseAdminClient;

async function ensureApplicationAccess(req, applicationId) {
  const authContext = await getUserFromRequest(req);
  if (authContext.error) {
    const status = authContext.error === 'Access denied' ? 403 : 401;
    return { error: authContext.error, status };
  }

  if (!authContext.user?.id) {
    return { error: 'Access denied', status: 403 };
  }

  if (authContext.isAdmin) {
    return { authContext };
  }

  let ownershipQuery = supabase
    .from('applications_new')
    .select('id')
    .eq('id', applicationId);

  ownershipQuery = ownershipQuery.eq('user_id', authContext.user.id);

  const { data, error } = await ownershipQuery.maybeSingle();

  if (error) {
    console.error('Failed to verify application ownership', error);
    return { error: 'Failed to verify access', status: 500 };
  }

  if (!data) {
    await logAuditEvent({
      req,
      action: 'application.slip.access.denied',
      actorId: authContext.user.id,
      actorEmail: authContext.user.email || null,
      actorRoles: authContext.roles || [],
      targetTable: 'applications_new',
      targetId: applicationId,
      metadata: { reason: 'ownership_mismatch' }
    });

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
