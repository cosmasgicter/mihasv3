import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest } from '@vercel/node';
import { decodeBase64Url } from './base64';

// Re-export the Bun-compatible Base64 utility for use by other modules
export { decodeBase64Url } from './base64';

/**
 * Admin roles that have elevated permissions
 */
const ADMIN_ROLES = new Set(['admin', 'super_admin', 'admissions_officer']);

/**
 * Symbol for caching roles on request object
 */
const REQUEST_ROLE_CACHE_SYMBOL = Symbol.for('mihas.roleCache');

/**
 * Client options for Supabase - no session persistence for serverless
 */
const clientOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
};

// Lazy-loaded clients to avoid crashes if env vars are missing
let _supabaseAdmin: SupabaseClient | null = null;
let _supabaseAnon: SupabaseClient | null = null;

/**
 * Get admin client with service role key - full database access
 * Lazy-loaded to avoid crashes during module initialization
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) {
      throw new Error('Supabase configuration missing');
    }
    _supabaseAdmin = createClient(url, key, clientOptions);
  }
  return _supabaseAdmin;
}

/**
 * Get anonymous client - respects RLS policies
 * Lazy-loaded to avoid crashes during module initialization
 */
export function getSupabaseAnon(): SupabaseClient {
  if (!_supabaseAnon) {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
    const key = process.env.VITE_SUPABASE_ANON_KEY || '';
    if (!url || !key) {
      throw new Error('Supabase configuration missing');
    }
    _supabaseAnon = createClient(url, key, clientOptions);
  }
  return _supabaseAnon;
}

// Legacy exports for backward compatibility
export const supabaseAdmin = {
  from: (table: string) => getSupabaseAdmin().from(table),
  auth: { admin: { getUserById: (id: string) => getSupabaseAdmin().auth.admin.getUserById(id) } },
  storage: { from: (bucket: string) => getSupabaseAdmin().storage.from(bucket) },
  rpc: (fn: string, params?: object) => getSupabaseAdmin().rpc(fn, params),
};

export const supabaseAnon = {
  from: (table: string) => getSupabaseAnon().from(table),
  auth: { getUser: () => getSupabaseAnon().auth.getUser() },
};

/**
 * User authentication context returned from getUserFromRequest
 */
export interface AuthContext {
  user: {
    id: string;
    email: string;
    role: string;
    app_metadata: Record<string, unknown>;
    user_metadata: Record<string, unknown>;
  };
  roles: string[];
  isAdmin: boolean;
}

/**
 * Error result from getUserFromRequest
 */
export interface AuthError {
  error: string;
}

/**
 * Result type for getUserFromRequest
 */
export type AuthResult = AuthContext | AuthError;

/**
 * Get or create role cache on request object
 */
function getRequestRoleCache(req: VercelRequest | null): Map<string, string[]> | null {
  if (!req || typeof req !== 'object') {
    return null;
  }
  const reqAny = req as unknown as Record<symbol, Map<string, string[]>>;
  if (reqAny[REQUEST_ROLE_CACHE_SYMBOL]) {
    return reqAny[REQUEST_ROLE_CACHE_SYMBOL];
  }
  const cache = new Map<string, string[]>();
  try {
    Object.defineProperty(req, REQUEST_ROLE_CACHE_SYMBOL, {
      value: cache,
      enumerable: false,
      configurable: false,
    });
  } catch {
    reqAny[REQUEST_ROLE_CACHE_SYMBOL] = cache;
  }
  return cache;
}

/**
 * Extract roles from user token metadata
 */
function extractRolesFromUserToken(user: AuthContext['user']): string[] | null {
  if (!user) return null;
  const candidateSets = [
    (user.app_metadata as Record<string, unknown>)?.roles,
    (user.user_metadata as Record<string, unknown>)?.roles,
  ];
  for (const candidate of candidateSets) {
    if (!candidate) continue;
    if (Array.isArray(candidate)) return candidate as string[];
    if (typeof candidate === 'string') {
      return candidate.split(',').map((role) => role.trim()).filter(Boolean);
    }
  }
  const singleRole =
    (user.app_metadata as Record<string, unknown>)?.role ||
    (user.user_metadata as Record<string, unknown>)?.role;
  if (typeof singleRole === 'string') return [singleRole];
  return null;
}

/**
 * Fetch roles from database for a user
 */
async function fetchRolesFromDatabase(userId: string): Promise<string[]> {
  try {
    const client = getSupabaseAdmin();
    const { data: rolesData, error: rolesError } = await client
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (rolesError) {
      const { data: profileData, error: profileError } = await client
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();
      if (profileError) return [];
      return profileData?.role ? [profileData.role] : [];
    }
    return rolesData?.map((r) => r.role) ?? [];
  } catch {
    return [];
  }
}

/**
 * Resolve roles for a user, using cache when available
 */
async function resolveRoles(req: VercelRequest, user: AuthContext['user']): Promise<string[]> {
  const cache = getRequestRoleCache(req);
  if (cache?.has(user.id)) return cache.get(user.id) || [];
  const cachedFromToken = extractRolesFromUserToken(user);
  if (cachedFromToken) {
    cache?.set(user.id, cachedFromToken);
    return cachedFromToken;
  }
  const roles = await fetchRolesFromDatabase(user.id);
  cache?.set(user.id, roles);
  return roles;
}

/**
 * Get user from request authorization header.
 */
export async function getUserFromRequest(
  req: VercelRequest,
  options: { requireAdmin?: boolean } = {}
): Promise<AuthResult> {
  const authHeader = req.headers.authorization || req.headers.Authorization as string;
  if (!authHeader) return { error: 'No authorization header provided' };

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { error: 'Invalid authorization header' };

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return { error: 'Invalid token format' };

    let payload: Record<string, unknown>;
    try {
      const decoded = decodeBase64Url(parts[1]);
      payload = JSON.parse(decoded);
    } catch {
      return { error: 'Invalid token format' };
    }

    const userId = payload.sub as string;
    if (!userId) return { error: 'Invalid token payload' };

    if (payload.exp && (payload.exp as number) < Date.now() / 1000) {
      return { error: 'Token expired' };
    }

    const client = getSupabaseAdmin();
    const { data: profile, error: userError } = await client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (userError) return { error: 'User not found' };

    if (!profile) {
      const userEmail = payload.email as string;
      const userName = ((payload.user_metadata as Record<string, unknown>)?.full_name ||
        (payload.user_metadata as Record<string, unknown>)?.name || 'User') as string;
      const nameParts = userName.split(' ');

      const { error: createError } = await client.from('profiles').insert({
        id: userId,
        email: userEmail,
        first_name: nameParts[0] || '',
        last_name: nameParts.slice(1).join(' ') || '',
        role: 'student',
      });

      if (createError) return { error: 'User profile not found' };

      const { data: newProfile } = await client
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (!newProfile) return { error: 'User profile not found' };
      return processProfile(req, newProfile);
    }

    const authContext = await processProfile(req, profile);
    if (options.requireAdmin && !authContext.isAdmin) {
      return { error: 'Access denied' };
    }
    return authContext;
  } catch {
    return { error: 'Service temporarily unavailable' };
  }
}

async function processProfile(
  req: VercelRequest,
  profile: Record<string, unknown>
): Promise<AuthContext> {
  const user = {
    id: profile.id as string,
    email: profile.email as string,
    role: profile.role as string,
    app_metadata: {},
    user_metadata: {},
  };

  let roles = profile.role ? [profile.role as string] : [];
  try {
    const dbRoles = await resolveRoles(req, user);
    if (dbRoles && dbRoles.length > 0) roles = dbRoles;
  } catch { /* Use profile role */ }

  const isAdmin = roles.some((role) => ADMIN_ROLES.has(role));
  return { user, roles, isAdmin };
}

export async function requireUser(
  req: VercelRequest,
  options: { requireAdmin?: boolean } = {}
): Promise<AuthContext> {
  const authContext = await getUserFromRequest(req, options);
  if ('error' in authContext) throw new Error(authContext.error);
  return authContext;
}

export function clearRequestRoleCache(req: VercelRequest): void {
  const reqAny = req as unknown as Record<symbol, Map<string, string[]>>;
  const cache = reqAny[REQUEST_ROLE_CACHE_SYMBOL];
  if (cache?.clear) cache.clear();
}
