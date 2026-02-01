import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Re-export the Bun-compatible Base64 utility for use by other modules
export { decodeBase64Url } from './base64';

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
 * Legacy export for backward compatibility - proxy to lazy-loaded client
 * Used only for Supabase Storage operations (file uploads)
 * 
 * NOTE: Authentication is now handled by api/_lib/auth/middleware.ts
 * Do NOT use supabaseAdmin.auth.* methods - use getAuthUser() instead
 */
export const supabaseAdmin = {
  from: (table: string) => getSupabaseAdmin().from(table),
  storage: { from: (bucket: string) => getSupabaseAdmin().storage.from(bucket) },
  rpc: (fn: string, params?: object) => getSupabaseAdmin().rpc(fn, params),
};
