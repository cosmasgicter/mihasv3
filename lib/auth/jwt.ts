/**
 * JWT Manager Module
 * 
 * Provides secure JWT token generation and verification using the jose library.
 * 
 * REQUIREMENTS:
 * - 3.1: THE JWT_Manager SHALL generate access tokens with 15-minute expiration
 * - 3.2: THE JWT_Manager SHALL generate refresh tokens with 7-day expiration
 * - 3.3: WHEN verifying an access token, THE JWT_Manager SHALL validate signature, expiration, issuer, and audience claims
 * - 3.4: WHEN verifying a refresh token, THE JWT_Manager SHALL use a separate secret from access tokens
 * - 3.5: THE JWT_Manager SHALL include user ID (sub), email, role, and permissions array in access token payload
 * - 3.6: THE JWT_Manager SHALL include only user ID (sub) and token type in refresh token payload
 * - 3.9: IF an access token is used as a refresh token, THEN THE JWT_Manager SHALL reject it with an error
 * - 3.10: THE JWT_Manager SHALL use HS256 algorithm for all token signing operations
 * 
 * SECURITY NOTES:
 * - Uses separate secrets for access and refresh tokens
 * - HS256 algorithm for signing (symmetric key)
 * - Token type field prevents cross-use attacks
 * - Never logs tokens or secrets
 */

import { SignJWT, jwtVerify, type JWTPayload as JoseJWTPayload } from "jose";

/**
 * User role type - matches the roles defined in the system
 */
export type UserRole = "super_admin" | "admin" | "reviewer" | "student";

/**
 * Token type discriminator to prevent cross-use attacks
 */
export type TokenType = "access" | "refresh";

/**
 * Access token payload structure
 * Contains full user context for authorization decisions
 */
export interface AccessTokenPayload {
  sub: string;           // User ID
  email: string;
  role: UserRole;
  permissions: string[];
  type: "access";
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

/**
 * Refresh token payload structure
 * Minimal payload - only contains user ID and token type
 */
export interface RefreshTokenPayload {
  sub: string;           // User ID
  type: "refresh";
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

/**
 * Combined JWT payload type for verification results
 */
export type JWTPayload = AccessTokenPayload | RefreshTokenPayload;

// Token configuration constants
const ACCESS_TOKEN_EXPIRATION = "15m";  // 15 minutes
const REFRESH_TOKEN_EXPIRATION = "7d";  // 7 days
const TOKEN_ISSUER = "mihas-auth";
const TOKEN_AUDIENCE = "mihas-app";
const ALGORITHM = "HS256";

/**
 * Get the JWT secret for access tokens
 * @throws Error if JWT_SECRET is not configured
 */
function getAccessTokenSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not configured");
  }
  return new TextEncoder().encode(secret);
}

/**
 * Get the JWT secret for refresh tokens
 * @throws Error if JWT_REFRESH_SECRET is not configured
 */
function getRefreshTokenSecret(): Uint8Array {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    throw new Error("JWT_REFRESH_SECRET environment variable is not configured");
  }
  return new TextEncoder().encode(secret);
}

/**
 * Generate an access token with user claims
 * 
 * Access tokens contain full user context including role and permissions
 * for authorization decisions without database lookups.
 * 
 * @param userId - User's unique identifier (UUID)
 * @param email - User's email address
 * @param role - User's role (super_admin, admin, reviewer, student)
 * @param permissions - Array of permission strings
 * @returns Promise resolving to the signed JWT string
 * @throws Error if token generation fails
 * 
 * @example
 * const token = await generateAccessToken(
 *   "user-uuid",
 *   "user@example.com",
 *   "admin",
 *   ["users:read", "applications:write"]
 * );
 */
export async function generateAccessToken(
  userId: string,
  email: string,
  role: UserRole,
  permissions: string[]
): Promise<string> {
  // Validate required inputs
  if (!userId || userId.trim().length === 0) {
    throw new Error("User ID is required for access token generation");
  }
  if (!email || email.trim().length === 0) {
    throw new Error("Email is required for access token generation");
  }
  if (!role) {
    throw new Error("Role is required for access token generation");
  }

  try {
    const secret = getAccessTokenSecret();
    
    const token = await new SignJWT({
      email,
      role,
      permissions: permissions || [],
      type: "access" as const,
    })
      .setProtectedHeader({ alg: ALGORITHM })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(ACCESS_TOKEN_EXPIRATION)
      .setIssuer(TOKEN_ISSUER)
      .setAudience(TOKEN_AUDIENCE)
      .sign(secret);

    return token;
  } catch (error) {
    // Log error without exposing sensitive details
    console.error("[JWT] Access token generation failed");
    throw new Error("Failed to generate access token");
  }
}

/**
 * Generate a refresh token with minimal claims
 * 
 * Refresh tokens only contain user ID and token type to minimize
 * exposure if compromised. Full user context is fetched on refresh.
 * 
 * @param userId - User's unique identifier (UUID)
 * @returns Promise resolving to the signed JWT string
 * @throws Error if token generation fails
 * 
 * @example
 * const refreshToken = await generateRefreshToken("user-uuid");
 */
export async function generateRefreshToken(userId: string): Promise<string> {
  // Validate required input
  if (!userId || userId.trim().length === 0) {
    throw new Error("User ID is required for refresh token generation");
  }

  try {
    const secret = getRefreshTokenSecret();
    
    const token = await new SignJWT({
      type: "refresh" as const,
    })
      .setProtectedHeader({ alg: ALGORITHM })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(REFRESH_TOKEN_EXPIRATION)
      .setIssuer(TOKEN_ISSUER)
      .setAudience(TOKEN_AUDIENCE)
      .sign(secret);

    return token;
  } catch (error) {
    // Log error without exposing sensitive details
    console.error("[JWT] Refresh token generation failed");
    throw new Error("Failed to generate refresh token");
  }
}

/**
 * Verify an access token and extract its payload
 * 
 * Validates signature, expiration, issuer, audience, and token type.
 * Rejects refresh tokens used as access tokens.
 * 
 * @param token - JWT string to verify
 * @returns Promise resolving to the verified access token payload
 * @throws Error if verification fails or token is invalid
 * 
 * @example
 * try {
 *   const payload = await verifyAccessToken(token);
 *   console.log(payload.userId, payload.role);
 * } catch (error) {
 *   // Token is invalid or expired
 * }
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  // Validate input
  if (!token || token.trim().length === 0) {
    throw new Error("Token is required for verification");
  }

  try {
    const secret = getAccessTokenSecret();
    
    const { payload } = await jwtVerify(token, secret, {
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
      algorithms: [ALGORITHM],
    });

    // Verify this is an access token, not a refresh token
    if (payload.type !== "access") {
      throw new Error("Invalid token type: expected access token");
    }

    // Validate required claims exist
    if (!payload.sub) {
      throw new Error("Token missing required subject claim");
    }
    if (!payload.email || typeof payload.email !== "string") {
      throw new Error("Token missing required email claim");
    }
    if (!payload.role || typeof payload.role !== "string") {
      throw new Error("Token missing required role claim");
    }

    // Construct and return the typed payload
    const accessPayload: AccessTokenPayload = {
      sub: payload.sub,
      email: payload.email as string,
      role: payload.role as UserRole,
      permissions: Array.isArray(payload.permissions) 
        ? (payload.permissions as string[]) 
        : [],
      type: "access",
      iat: payload.iat,
      exp: payload.exp,
      iss: payload.iss,
      aud: typeof payload.aud === "string" ? payload.aud : payload.aud?.[0],
    };

    return accessPayload;
  } catch (error) {
    // Log error without exposing token details
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    // Provide specific error messages for common cases
    if (errorMessage.includes("expired")) {
      throw new Error("Access token has expired");
    }
    if (errorMessage.includes("signature")) {
      throw new Error("Invalid token signature");
    }
    if (errorMessage.includes("issuer")) {
      throw new Error("Invalid token issuer");
    }
    if (errorMessage.includes("audience")) {
      throw new Error("Invalid token audience");
    }
    if (errorMessage.includes("token type")) {
      throw new Error(errorMessage);
    }
    if (errorMessage.includes("missing required")) {
      throw new Error(errorMessage);
    }
    
    // Generic error for other cases
    throw new Error("Access token verification failed");
  }
}

/**
 * Verify a refresh token and extract its payload
 * 
 * Uses a separate secret from access tokens for additional security.
 * Validates signature, expiration, issuer, audience, and token type.
 * Rejects access tokens used as refresh tokens.
 * 
 * @param token - JWT string to verify
 * @returns Promise resolving to the verified refresh token payload with user ID
 * @throws Error if verification fails or token is invalid
 * 
 * @example
 * try {
 *   const payload = await verifyRefreshToken(refreshToken);
 *   // Use payload.sub to look up user and generate new tokens
 * } catch (error) {
 *   // Token is invalid or expired - require re-authentication
 * }
 */
export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
  // Validate input
  if (!token || token.trim().length === 0) {
    throw new Error("Token is required for verification");
  }

  try {
    const secret = getRefreshTokenSecret();
    
    const { payload } = await jwtVerify(token, secret, {
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
      algorithms: [ALGORITHM],
    });

    // Verify this is a refresh token, not an access token
    if (payload.type !== "refresh") {
      throw new Error("Invalid token type: expected refresh token");
    }

    // Validate required claims exist
    if (!payload.sub) {
      throw new Error("Token missing required subject claim");
    }

    // Construct and return the typed payload
    const refreshPayload: RefreshTokenPayload = {
      sub: payload.sub,
      type: "refresh",
      iat: payload.iat,
      exp: payload.exp,
      iss: payload.iss,
      aud: typeof payload.aud === "string" ? payload.aud : payload.aud?.[0],
    };

    return refreshPayload;
  } catch (error) {
    // Log error without exposing token details
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    // Provide specific error messages for common cases
    if (errorMessage.includes("expired")) {
      throw new Error("Refresh token has expired");
    }
    if (errorMessage.includes("signature")) {
      throw new Error("Invalid token signature");
    }
    if (errorMessage.includes("issuer")) {
      throw new Error("Invalid token issuer");
    }
    if (errorMessage.includes("audience")) {
      throw new Error("Invalid token audience");
    }
    if (errorMessage.includes("token type")) {
      throw new Error(errorMessage);
    }
    if (errorMessage.includes("missing required")) {
      throw new Error(errorMessage);
    }
    
    // Generic error for other cases
    throw new Error("Refresh token verification failed");
  }
}

/**
 * Get token configuration constants
 * Useful for testing and configuration verification
 */
export function getTokenConfig(): {
  accessTokenExpiration: string;
  refreshTokenExpiration: string;
  issuer: string;
  audience: string;
  algorithm: string;
} {
  return {
    accessTokenExpiration: ACCESS_TOKEN_EXPIRATION,
    refreshTokenExpiration: REFRESH_TOKEN_EXPIRATION,
    issuer: TOKEN_ISSUER,
    audience: TOKEN_AUDIENCE,
    algorithm: ALGORITHM,
  };
}
