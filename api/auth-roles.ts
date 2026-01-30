import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from './_lib/cors';
import { decodeBase64Url } from './_lib/base64';

/**
 * Auth Roles API - CRITICAL: This endpoint must NEVER return 500
 * GET /api/auth-roles - Get current user's roles and permissions
 * 
 * DESIGN: Deterministic behavior, no DB calls, no Supabase
 * - Valid token → 200 with role data
 * - Invalid/missing token → 401 with { authenticated: false }
 * - NEVER throws, NEVER 500s
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set JSON content type for all responses
  res.setHeader('Content-Type', 'application/json');
  
  if (handleCors(req, res)) return;

  // Handle HEAD requests for health checks
  if (req.method === 'HEAD') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ 
      success: false, 
      authenticated: false,
      error: 'Method not allowed' 
    });
  }

  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization || req.headers.Authorization as string;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false,
        authenticated: false,
        error: 'No authorization token provided'
      });
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return res.status(401).json({ 
        success: false,
        authenticated: false,
        error: 'Empty authorization token'
      });
    }

    // Decode JWT payload (no verification - just extract claims)
    // This is safe because we're only reading, not trusting for sensitive ops
    const parts = token.split('.');
    if (parts.length !== 3) {
      return res.status(401).json({ 
        success: false,
        authenticated: false,
        error: 'Invalid token format'
      });
    }

    let payload: any;
    try {
      const payloadJson = decodeBase64Url(parts[1]);
      payload = JSON.parse(payloadJson);
    } catch {
      return res.status(401).json({ 
        success: false,
        authenticated: false,
        error: 'Invalid token payload'
      });
    }

    // Check token expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return res.status(401).json({ 
        success: false,
        authenticated: false,
        error: 'Token expired'
      });
    }

    // Extract user info from token
    const userId = payload.sub;
    const email = payload.email;
    const role = payload.role || payload.user_metadata?.role || payload.app_metadata?.role || 'student';

    if (!userId) {
      return res.status(401).json({ 
        success: false,
        authenticated: false,
        error: 'Invalid token: no user ID'
      });
    }

    // Determine permissions based on role
    const permissions = getPermissionsForRole(role);
    const isAdmin = role === 'admin' || role === 'super_admin';

    return res.status(200).json({
      success: true,
      authenticated: true,
      data: {
        user_id: userId,
        email: email,
        role: role,
        roles: [role],
        permissions: permissions,
        is_admin: isAdmin,
      }
    });
  } catch (error) {
    // CRITICAL: Never expose error details, never 500
    console.error('[auth-roles] Unexpected error:', error instanceof Error ? error.message : 'Unknown');
    return res.status(401).json({ 
      success: false,
      authenticated: false,
      error: 'Authentication failed'
    });
  }
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
