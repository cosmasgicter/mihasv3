import { supabaseAdminClient, getUserFromRequest } from '../_lib/supabaseClient.js';
import { logAuditEvent } from '../_lib/auditLogger.js';

const supabase = supabaseAdminClient;

export async function ensureApplicationAccess(req, applicationId) {
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

export default ensureApplicationAccess;