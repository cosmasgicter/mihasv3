/**
 * Legacy Token Support Module
 * 
 * Provides backward compatibility for users authenticated via Supabase Auth
 * during the migration period. This module allows existing users to continue
 * using their Supabase tokens while transitioning to the new custom auth system.
 * 
 * REQUIREMENTS:
 * - 11.1: Support legacy Supabase tokens during migration period
 * - 11.2: Create profile for users authenticated via legacy tokens if missing
 * - 11.3: Update password hash to bcrypt on new login
 * 
 * SECURITY NOTES:
 * - Legacy tokens should be phased out after migration period
 * - New logins should always use the new auth system
 * - Password hashes should be upgraded to bcrypt on first new login
 */

import { jwtVerify, decodeJwt, JWTPayload } from 'jose';
import { query } from './db';
import { UserQueries, UserRecord, USER_ROLES, UserRole } from './queries';
import { hashPassword } from './auth_password';

/**
 * Supabase JWT payload structure
 */
interface SupabaseJWTPayload extends JWTPayload {
  sub: string;
  email?: string;
  role?: string;
  aud?: string;
  app_metadata?: {
    provider?: string;
    providers?: string[];
  };
  user_metadata?: {
    full_name?: string;
    avatar_url?: string;
  };
}

/**
 * Legacy user info extracted from Supabase token
 */
export interface LegacyUserInfo {
  id: string;
  email: string;
  role: UserRole;
  firstName?: string;
  lastName?: string;
}

/**
 * Verify a legacy Supabase JWT token
 * 
 * Requirement 11.1: Support legacy Supabase tokens during migration period
 * 
 * @param token - The JWT token to verify
 * @returns User info if valid, null if invalid
 */
export async function verifyLegacySupabaseToken(token: string): Promise<LegacyUserInfo | null> {
  try {
    // Get Supabase JWT secret from environment
    const jwtSecret = process.env.SUPABASE_JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!jwtSecret) {
      console.warn('[Legacy Auth] No Supabase JWT secret configured');
      return null;
    }

    // Decode the token first to check structure
    const decoded = decodeJwt(token) as SupabaseJWTPayload;
    
    if (!decoded.sub || !decoded.email) {
      console.warn('[Legacy Auth] Token missing required claims');
      return null;
    }

    // Verify the token signature
    // Note: Supabase uses HS256 with the JWT secret
    const secret = new TextEncoder().encode(jwtSecret);
    
    try {
      await jwtVerify(token, secret, {
        algorithms: ['HS256'],
      });
    } catch (verifyError) {
      // Token signature invalid or expired
      console.warn('[Legacy Auth] Token verification failed:', (verifyError as Error).message);
      return null;
    }

    // Extract user info
    const userInfo: LegacyUserInfo = {
      id: decoded.sub,
      email: decoded.email,
      role: mapSupabaseRole(decoded.role),
    };

    // Extract name from user_metadata if available
    if (decoded.user_metadata?.full_name) {
      const nameParts = decoded.user_metadata.full_name.split(' ');
      userInfo.firstName = nameParts[0];
      userInfo.lastName = nameParts.slice(1).join(' ') || undefined;
    }

    return userInfo;
  } catch (error) {
    console.error('[Legacy Auth] Error verifying token:', (error as Error).message);
    return null;
  }
}

/**
 * Map Supabase role to our role system
 */
function mapSupabaseRole(supabaseRole?: string): UserRole {
  switch (supabaseRole) {
    case 'service_role':
    case 'super_admin':
      return USER_ROLES.SUPER_ADMIN;
    case 'admin':
      return USER_ROLES.ADMIN;
    case 'reviewer':
      return USER_ROLES.REVIEWER;
    case 'authenticated':
    case 'student':
    default:
      return USER_ROLES.STUDENT;
  }
}

/**
 * Ensure user profile exists for legacy token user
 * 
 * Requirement 11.2: Create profile for users authenticated via legacy tokens if missing
 * 
 * @param userInfo - User info from legacy token
 * @returns The user record (existing or newly created)
 */
export async function ensureProfileExists(userInfo: LegacyUserInfo): Promise<UserRecord | null> {
  try {
    // Check if user already exists
    const existingResult = await query<UserRecord>(
      UserQueries.findById(userInfo.id).text,
      UserQueries.findById(userInfo.id).values
    );

    if (existingResult.rows.length > 0) {
      return existingResult.rows[0];
    }

    // Create new profile for legacy user
    const createQuery = UserQueries.createWithoutPassword(
      userInfo.id,
      userInfo.email,
      userInfo.role,
      userInfo.firstName || '',
      userInfo.lastName || ''
    );

    const createResult = await query<UserRecord>(createQuery.text, createQuery.values);

    if (createResult.rows.length > 0) {
      console.log(`[Legacy Auth] Created profile for legacy user: ${userInfo.id}`);
      return createResult.rows[0];
    }

    // If ON CONFLICT DO NOTHING triggered, fetch the existing record
    const refetchResult = await query<UserRecord>(
      UserQueries.findById(userInfo.id).text,
      UserQueries.findById(userInfo.id).values
    );

    return refetchResult.rows[0] || null;
  } catch (error) {
    console.error('[Legacy Auth] Error ensuring profile exists:', (error as Error).message);
    return null;
  }
}

/**
 * Upgrade user's password hash to bcrypt
 * 
 * Requirement 11.3: Update password hash to bcrypt on new login
 * 
 * This should be called when a legacy user logs in with a new password
 * to upgrade their password hash from the old format to bcrypt.
 * 
 * @param userId - User ID
 * @param newPassword - The new password to hash
 * @returns true if successful
 */
export async function upgradePasswordHash(userId: string, newPassword: string): Promise<boolean> {
  try {
    // Hash the password with bcrypt
    const passwordHash = await hashPassword(newPassword);

    // Update the user's password hash
    const updateQuery = UserQueries.updatePassword(userId, passwordHash);
    await query(updateQuery.text, updateQuery.values);

    console.log(`[Legacy Auth] Upgraded password hash for user: ${userId}`);
    return true;
  } catch (error) {
    console.error('[Legacy Auth] Error upgrading password hash:', (error as Error).message);
    return false;
  }
}

/**
 * Check if a user needs password hash upgrade
 * 
 * Users with null password_hash or non-bcrypt hashes need upgrade.
 * 
 * @param user - User record
 * @returns true if password hash needs upgrade
 */
export function needsPasswordUpgrade(user: UserRecord): boolean {
  if (!user.password_hash) {
    return true;
  }

  // Check if it's already a bcrypt hash ($2a$, $2b$, or $2y$)
  const isBcrypt = /^\$2[aby]\$\d{1,2}\$/.test(user.password_hash);
  return !isBcrypt;
}

/**
 * Authenticate user with legacy token and optionally upgrade to new system
 * 
 * This is the main entry point for legacy authentication.
 * It verifies the legacy token, ensures the profile exists,
 * and returns the user info for further processing.
 * 
 * @param token - Legacy Supabase JWT token
 * @returns User record if authenticated, null otherwise
 */
export async function authenticateWithLegacyToken(token: string): Promise<UserRecord | null> {
  // Verify the legacy token
  const userInfo = await verifyLegacySupabaseToken(token);
  if (!userInfo) {
    return null;
  }

  // Ensure profile exists
  const user = await ensureProfileExists(userInfo);
  if (!user) {
    return null;
  }

  return user;
}

/**
 * Check if a token looks like a Supabase token
 * 
 * Supabase tokens have a specific structure that can be detected
 * without full verification.
 * 
 * @param token - JWT token to check
 * @returns true if token appears to be a Supabase token
 */
export function isLegacySupabaseToken(token: string): boolean {
  try {
    const decoded = decodeJwt(token) as SupabaseJWTPayload;
    
    // Supabase tokens typically have these characteristics:
    // - aud claim is often 'authenticated'
    // - app_metadata with provider info
    // - iss claim contains 'supabase'
    
    if (decoded.iss?.includes('supabase')) {
      return true;
    }
    
    if (decoded.aud === 'authenticated') {
      return true;
    }
    
    if (decoded.app_metadata?.provider || decoded.app_metadata?.providers) {
      return true;
    }
    
    return false;
  } catch {
    return false;
  }
}
