import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from './_lib/cors';
import { getUserFromRequest } from './_lib/supabaseClient';
import { sendSuccess, sendError, HttpStatus } from './_lib/errorHandler';

/**
 * Auth Roles API
 * GET /api/auth-roles - Get current user's roles and permissions
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  // Handle HEAD requests for health checks
  if (req.method === 'HEAD') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const authResult = await getUserFromRequest(req);
  if ('error' in authResult) {
    return sendError(res, authResult.error, HttpStatus.UNAUTHORIZED);
  }

  const { user, roles, isAdmin } = authResult;

  // Determine role from user object (populated from profile in getUserFromRequest)
  // The user.role is already set from the profile in supabaseClient.ts
  const role = user.role || (user.user_metadata?.role as string) || 'student';
  
  // Define permissions based on role
  const permissions = getPermissionsForRole(role);

  return sendSuccess(res, {
    user_id: user.id,
    email: user.email,
    role: role,
    roles: roles,
    permissions: permissions,
    is_admin: isAdmin,
  });
}

function getPermissionsForRole(role: string): string[] {
  const permissions: Record<string, string[]> = {
    super_admin: [
      'users:read', 'users:write', 'users:delete',
      'applications:read', 'applications:write', 'applications:review',
      'programs:read', 'programs:write',
      'payments:read', 'payments:verify',
      'documents:read', 'documents:verify',
      'analytics:read',
      'settings:read', 'settings:write',
    ],
    admin: [
      'users:read',
      'applications:read', 'applications:write', 'applications:review',
      'programs:read',
      'payments:read', 'payments:verify',
      'documents:read', 'documents:verify',
      'analytics:read',
    ],
    reviewer: [
      'applications:read', 'applications:review',
      'documents:read',
    ],
    student: [
      'applications:create', 'applications:read_own', 'applications:update_own',
      'documents:upload_own', 'documents:read_own',
      'payments:make_own', 'payments:read_own',
      'profile:read_own', 'profile:update_own',
    ],
  };

  return permissions[role] || permissions['student'];
}
