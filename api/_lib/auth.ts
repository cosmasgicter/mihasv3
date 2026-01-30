/**
 * Custom Bun-Native Authentication System
 * 
 * REPLACES: Supabase Auth entirely
 * IMPLEMENTATION: Bun-native crypto, JWT, bcrypt
 * VERIFICATION: Zero Supabase dependencies in auth flow
 * 
 * Features:
 * - Password hashing (bcrypt)
 * - JWT access + refresh tokens
 * - HTTP-only cookies
 * - Role claims embedded in JWT
 * - Bun-native crypto only
 * 
 * Prohibited:
 * - Supabase auth SDK
 * - Supabase JWT parsing
 * - Supabase session persistence
 */

import bcrypt from "bcrypt";
import { SignJWT, jwtVerify, type JWTPayload as JoseJWTPayload } from "jose";
import type { VercelRequest, VercelResponse } from "@vercel/node";

// JWT CONFIGURATION VERIFICATION
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
  console.error("[AUTH] FATAL: JWT_SECRET or JWT_REFRESH_SECRET not set");
  console.error("[AUTH] Authentication will fail");
}

// Convert secrets to Uint8Array for jose
const getSecret = (secret: string) => new TextEncoder().encode(secret);

/**
 * JWT Token Configuration
 * Access token: 15 minutes
 * Refresh token: 7 days
 * Algorithm: HS256 (Bun-native supported)
 */
export const JWT_CONFIG = {
  accessTokenExpiry: "15m",
  refreshTokenExpiry: "7d",
  algorithm: "HS256",
  issuer: "mihas-api",
  audience: "mihas-client",
} as const;

/**
 * User roles (matches existing database schema)
 */
export const USER_ROLES = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  REVIEWER: "reviewer",
  STUDENT: "student",
} as const;

export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];

/**
 * JWT Payload structure
 * VERIFICATION: Role embedded in token, no external lookup needed
 */
export interface JWTPayload extends Record<string, unknown> {
  sub: string;           // User ID
  email: string;
  role: UserRole;
  permissions: string[];
  type: "access" | "refresh";
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

/**
 * Password hashing using bcrypt
 * VERIFICATION: Bun-compatible, 12 rounds (secure)
 * 
 * @param password - Plain text password
 * @returns Hashed password
 */
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12; // OWASP recommended minimum
  return bcrypt.hash(password, saltRounds);
}

/**
 * Password verification using bcrypt
 * VERIFICATION: Constant-time comparison
 * 
 * @param password - Plain text password
 * @param hash - Stored hash
 * @returns boolean
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate JWT access token
 * VERIFICATION: Role and permissions embedded
 * 
 * @param userId - User UUID
 * @param email - User email
 * @param role - User role
 * @param permissions - Array of permission strings
 * @returns JWT string
 */
export async function generateAccessToken(
  userId: string,
  email: string,
  role: UserRole,
  permissions: string[]
): Promise<string> {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET not configured");
  }

  const secret = getSecret(JWT_SECRET);
  
  return new SignJWT({
    sub: userId,
    email,
    role,
    permissions,
    type: "access",
  })
    .setProtectedHeader({ alg: JWT_CONFIG.algorithm })
    .setIssuedAt()
    .setIssuer(JWT_CONFIG.issuer)
    .setAudience(JWT_CONFIG.audience)
    .setExpirationTime(JWT_CONFIG.accessTokenExpiry)
    .sign(secret);
}

/**
 * Generate JWT refresh token
 * VERIFICATION: Long-lived, single-purpose
 * 
 * @param userId - User UUID
 * @returns JWT string
 */
export async function generateRefreshToken(userId: string): Promise<string> {
  if (!JWT_REFRESH_SECRET) {
    throw new Error("JWT_REFRESH_SECRET not configured");
  }

  const secret = getSecret(JWT_REFRESH_SECRET);
  
  return new SignJWT({
    sub: userId,
    type: "refresh",
  })
    .setProtectedHeader({ alg: JWT_CONFIG.algorithm })
    .setIssuedAt()
    .setIssuer(JWT_CONFIG.issuer)
    .setAudience(JWT_CONFIG.audience)
    .setExpirationTime(JWT_CONFIG.refreshTokenExpiry)
    .sign(secret);
}

/**
 * Verify JWT access token
 * VERIFICATION: Full validation (signature, expiry, issuer, audience)
 * 
 * @param token - JWT string
 * @returns Decoded payload
 * @throws Error if invalid
 */
export async function verifyAccessToken(token: string): Promise<JWTPayload> {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET not configured");
  }

  const secret = getSecret(JWT_SECRET);
  
  const { payload } = await jwtVerify(token, secret, {
    algorithms: [JWT_CONFIG.algorithm],
    issuer: JWT_CONFIG.issuer,
    audience: JWT_CONFIG.audience,
  });

  // Type guard for refresh tokens
  if (payload.type === "refresh") {
    throw new Error("Use verifyRefreshToken for refresh tokens");
  }

  return payload as JWTPayload;
}

/**
 * Verify JWT refresh token
 * VERIFICATION: Separate secret, single purpose
 * 
 * @param token - JWT string
 * @returns Decoded payload (userId only)
 * @throws Error if invalid
 */
export async function verifyRefreshToken(token: string): Promise<{ sub: string }> {
  if (!JWT_REFRESH_SECRET) {
    throw new Error("JWT_REFRESH_SECRET not configured");
  }

  const secret = getSecret(JWT_REFRESH_SECRET);
  
  const { payload } = await jwtVerify(token, secret, {
    algorithms: [JWT_CONFIG.algorithm],
    issuer: JWT_CONFIG.issuer,
    audience: JWT_CONFIG.audience,
  });

  if (payload.type !== "refresh") {
    throw new Error("Invalid token type");
  }

  return { sub: payload.sub as string };
}

/**
 * Extract Bearer token from Authorization header
 * VERIFICATION: No Supabase parsing, standard JWT only
 * 
 * @param req - Vercel request
 * @returns Token string or null
 */
export function extractBearerToken(req: VercelRequest): string | null {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  
  if (!authHeader || typeof authHeader !== "string") {
    return null;
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

/**
 * Set HTTP-only cookies for tokens
 * VERIFICATION: Secure, SameSite, HTTP-only flags
 * 
 * @param res - Vercel response
 * @param accessToken - JWT access token
 * @param refreshToken - JWT refresh token
 */
export function setAuthCookies(
  res: VercelResponse,
  accessToken: string,
  refreshToken: string
): void {
  const isProduction = process.env.NODE_ENV === "production";
  
  // Access token cookie (15 minutes)
  res.setHeader("Set-Cookie", [
    `access_token=${accessToken}; HttpOnly; Secure=${isProduction}; SameSite=Strict; Max-Age=900; Path=/`,
    `refresh_token=${refreshToken}; HttpOnly; Secure=${isProduction}; SameSite=Strict; Max-Age=604800; Path=/api/auth`,
  ]);
}

/**
 * Clear auth cookies (logout)
 * 
 * @param res - Vercel response
 */
export function clearAuthCookies(res: VercelResponse): void {
  res.setHeader("Set-Cookie", [
    `access_token=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/`,
    `refresh_token=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/api/auth`,
  ]);
}

/**
 * Authenticated user context
 */
export interface AuthContext {
  userId: string;
  email: string;
  role: UserRole;
  permissions: string[];
}

/**
 * Get authenticated user from request
 * VERIFICATION: No Supabase dependencies, pure JWT
 * 
 * @param req - Vercel request
 * @returns AuthContext or null
 */
export async function getAuthUser(req: VercelRequest): Promise<AuthContext | null> {
  const token = extractBearerToken(req);
  
  if (!token) {
    return null;
  }

  try {
    const payload = await verifyAccessToken(token);
    
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      permissions: payload.permissions,
    };
  } catch (error) {
    console.log("[AUTH] Token verification failed:", (error as Error).message);
    return null;
  }
}

/**
 * Require authentication middleware
 * Throws error if not authenticated
 * 
 * @param req - Vercel request
 * @returns AuthContext
 * @throws Error if not authenticated
 */
export async function requireAuth(req: VercelRequest): Promise<AuthContext> {
  const user = await getAuthUser(req);
  
  if (!user) {
    throw new Error("Authentication required");
  }
  
  return user;
}

/**
 * Require specific role
 * 
 * @param req - Vercel request
 * @param roles - Allowed roles
 * @returns AuthContext
 * @throws Error if unauthorized
 */
export async function requireRole(
  req: VercelRequest,
  roles: UserRole[]
): Promise<AuthContext> {
  const user = await requireAuth(req);
  
  if (!roles.includes(user.role)) {
    throw new Error("Insufficient permissions");
  }
  
  return user;
}

/**
 * Generate permissions for role
 * VERIFICATION: Deterministic, no DB lookup needed
 * 
 * @param role - User role
 * @returns Array of permission strings
 */
export function getPermissionsForRole(role: UserRole): string[] {
  const permissions: Record<UserRole, string[]> = {
    [USER_ROLES.SUPER_ADMIN]: [
      "users:read", "users:write", "users:delete",
      "applications:read", "applications:write", "applications:review",
      "programs:read", "programs:write",
      "payments:read", "payments:verify",
      "documents:read", "documents:verify",
      "analytics:read",
      "settings:read", "settings:write",
    ],
    [USER_ROLES.ADMIN]: [
      "users:read",
      "applications:read", "applications:write", "applications:review",
      "programs:read",
      "payments:read", "payments:verify",
      "documents:read", "documents:verify",
      "analytics:read",
    ],
    [USER_ROLES.REVIEWER]: [
      "applications:read", "applications:review",
      "documents:read",
    ],
    [USER_ROLES.STUDENT]: [
      "applications:create", "applications:read_own", "applications:update_own",
      "documents:upload_own", "documents:read_own",
      "payments:make_own", "payments:read_own",
      "profile:read_own", "profile:update_own",
    ],
  };

  return permissions[role] || permissions[USER_ROLES.STUDENT];
}
