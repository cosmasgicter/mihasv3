/**
 * Hardened Authentication API (v2)
 * 
 * REPLACES: api/auth.ts (Supabase-based)
 * SECURITY: Arcjet protected, Bun-native auth
 * VERIFICATION: Zero Supabase dependencies
 * 
 * Protected by Arcjet:
 * - Shield rules (automated attack protection)
 * - Bot detection
 * - Rate limiting (5 requests per 5 minutes)
 * 
 * Endpoints:
 * - POST /api/auth?action=login
 * - POST /api/auth?action=logout
 * - POST /api/auth?action=refresh
 * - GET /api/auth?action=session
 * 
 * Requirements:
 * - 1.1: WHEN a user submits valid credentials to POST /api/auth?action=login, THE Auth_System SHALL authenticate the user and return JWT tokens in HTTP-only cookies
 * - 1.2: WHEN a user submits invalid credentials to POST /api/auth?action=login, THE Auth_System SHALL return a 401 Unauthorized response without revealing whether email or password was incorrect
 * - 1.7: THE JWT_Manager SHALL embed user role and permissions directly in the access token payload
 * - 3.8: THE JWT_Manager SHALL store refresh token hash in database for revocation capability
 * - 5.1: WHEN a user logs in, THE Session_Manager SHALL create a session record with device info and IP address
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withArcjetProtection } from "./_lib/arcjet";
// Import from modular auth components
import { hashPassword, verifyPassword, hashToken, verifyTokenHash } from "./_lib/auth/password";
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from "./_lib/auth/jwt";
import { setAuthCookies, clearAuthCookies, extractRefreshTokenFromCookie } from "./_lib/auth/cookies";
import { getAuthUser, requireAuth } from "./_lib/auth/middleware";
import { getPermissionsForRole, USER_ROLES, type UserRole } from "./_lib/auth/permissions";
import { query } from "./_lib/db";
import { UserQueries, SessionQueries, AuditQueries, type UserAuthRecord } from "./_lib/queries";
import { handleCors } from "./_lib/cors";
import { sendSuccess, sendError, HttpStatus } from "./_lib/errorHandler";

/**
 * Request validation schemas
 * VERIFICATION: Strict input validation
 */
const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum([USER_ROLES.STUDENT]).default(USER_ROLES.STUDENT),
});

/**
 * Main handler with Arcjet protection
 * FIXED: Return type is VercelResponse | void to satisfy TypeScript
 */
async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse | void> {
  // Handle CORS
  if (handleCors(req, res)) return;

  // Handle HEAD requests
  if (req.method === "HEAD") {
    return res.status(200).end();
  }

  const action = req.query.action as string;

  try {
    switch (action) {
      case "login":
        if (req.method !== "POST") {
          return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
        }
        return await handleLogin(req, res);

      case "logout":
        if (req.method !== "POST") {
          return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
        }
        return await handleLogout(req, res);

      case "refresh":
        if (req.method !== "POST") {
          return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
        }
        return await handleRefresh(req, res);

      case "session":
        if (req.method !== "GET") {
          return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
        }
        return await handleSession(req, res);

      case "register":
        if (req.method !== "POST") {
          return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
        }
        return await handleRegister(req, res);

      default:
        return sendError(res, "Invalid action", HttpStatus.BAD_REQUEST);
    }
  } catch (error) {
    console.error("[auth] Unhandled error:", error);
    return sendError(res, "Internal server error", HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

/**
 * Extract IP address from request
 * Handles various proxy headers for accurate IP detection
 * 
 * @param req - Vercel request object
 * @returns IP address string or "unknown"
 */
function extractIpAddress(req: VercelRequest): string {
  // Check for forwarded headers (common in proxy setups like Vercel)
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    // Take the first IP in the chain (original client)
    return ips.split(",")[0].trim();
  }
  
  // Check for real IP header (Vercel/Cloudflare)
  const realIp = req.headers["x-real-ip"];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }
  
  // Fallback to socket remote address
  return req.socket?.remoteAddress || "unknown";
}

/**
 * Extract user agent from request
 * 
 * @param req - Vercel request object
 * @returns User agent string or "unknown"
 */
function extractUserAgent(req: VercelRequest): string {
  const userAgent = req.headers["user-agent"];
  return userAgent ? (Array.isArray(userAgent) ? userAgent[0] : userAgent) : "unknown";
}

/**
 * Parse device info from user agent string
 * Extracts browser, OS, and device type information
 * 
 * @param userAgent - User agent string
 * @returns DeviceInfo object
 */
function parseDeviceInfo(userAgent: string): {
  browser?: string;
  browser_version?: string;
  os?: string;
  os_version?: string;
  device_type?: "desktop" | "mobile" | "tablet" | "unknown";
  is_mobile?: boolean;
} {
  const deviceInfo: {
    browser?: string;
    browser_version?: string;
    os?: string;
    os_version?: string;
    device_type?: "desktop" | "mobile" | "tablet" | "unknown";
    is_mobile?: boolean;
  } = {};

  // Detect browser
  if (userAgent.includes("Chrome") && !userAgent.includes("Edg")) {
    deviceInfo.browser = "Chrome";
    const match = userAgent.match(/Chrome\/(\d+)/);
    if (match) deviceInfo.browser_version = match[1];
  } else if (userAgent.includes("Firefox")) {
    deviceInfo.browser = "Firefox";
    const match = userAgent.match(/Firefox\/(\d+)/);
    if (match) deviceInfo.browser_version = match[1];
  } else if (userAgent.includes("Safari") && !userAgent.includes("Chrome")) {
    deviceInfo.browser = "Safari";
    const match = userAgent.match(/Version\/(\d+)/);
    if (match) deviceInfo.browser_version = match[1];
  } else if (userAgent.includes("Edg")) {
    deviceInfo.browser = "Edge";
    const match = userAgent.match(/Edg\/(\d+)/);
    if (match) deviceInfo.browser_version = match[1];
  }

  // Detect OS
  if (userAgent.includes("Windows")) {
    deviceInfo.os = "Windows";
    if (userAgent.includes("Windows NT 10")) deviceInfo.os_version = "10";
    else if (userAgent.includes("Windows NT 11")) deviceInfo.os_version = "11";
  } else if (userAgent.includes("Mac OS X")) {
    deviceInfo.os = "macOS";
    const match = userAgent.match(/Mac OS X (\d+[._]\d+)/);
    if (match) deviceInfo.os_version = match[1].replace("_", ".");
  } else if (userAgent.includes("Linux")) {
    deviceInfo.os = "Linux";
  } else if (userAgent.includes("Android")) {
    deviceInfo.os = "Android";
    const match = userAgent.match(/Android (\d+)/);
    if (match) deviceInfo.os_version = match[1];
  } else if (userAgent.includes("iOS") || userAgent.includes("iPhone") || userAgent.includes("iPad")) {
    deviceInfo.os = "iOS";
    const match = userAgent.match(/OS (\d+)/);
    if (match) deviceInfo.os_version = match[1];
  }

  // Detect device type
  if (userAgent.includes("Mobile") || userAgent.includes("Android") || userAgent.includes("iPhone")) {
    deviceInfo.device_type = "mobile";
    deviceInfo.is_mobile = true;
  } else if (userAgent.includes("iPad") || userAgent.includes("Tablet")) {
    deviceInfo.device_type = "tablet";
    deviceInfo.is_mobile = true;
  } else {
    deviceInfo.device_type = "desktop";
    deviceInfo.is_mobile = false;
  }

  return deviceInfo;
}

/**
 * Login handler
 * 
 * REQUIREMENTS:
 * - 1.1: Authenticate user and return JWT tokens in HTTP-only cookies
 * - 1.2: Return 401 without revealing whether email or password was incorrect
 * - 1.7: Embed user role and permissions directly in the access token payload
 * - 3.8: Store refresh token hash in database for revocation capability
 * - 5.1: Create a session record with device info and IP address
 * 
 * VERIFICATION: bcrypt password compare, JWT generation, device session creation
 */
async function handleLogin(req: VercelRequest, res: VercelResponse) {
  // Extract request metadata for session tracking and audit logging
  const ipAddress = extractIpAddress(req);
  const userAgent = extractUserAgent(req);
  
  try {
    // Validate input
    const { email, password } = loginSchema.parse(req.body);

    // Find user by email using typed query builder
    const findUserQuery = UserQueries.findByEmail(email);
    const userResult = await query<UserAuthRecord>(
      findUserQuery.text,
      findUserQuery.values
    );

    if (userResult.rowCount === 0) {
      // Requirement 1.2: Same error for invalid email or password (prevent enumeration)
      // Log failed attempt for security audit (without revealing if email exists)
      console.log("[auth] Failed login attempt - user not found");
      
      // Log auth failure to audit_logs
      try {
        const auditQuery = AuditQueries.logAuthEvent(
          null, // No actor ID - user not found
          "auth_failure",
          false,
          ipAddress,
          userAgent,
          { reason: "invalid_credentials" }
        );
        await query(auditQuery.text, auditQuery.values);
      } catch (auditError) {
        // Don't fail login on audit error
        console.error("[auth] Failed to log auth failure:", auditError);
      }
      
      return sendError(res, "Invalid credentials", HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS");
    }

    const user = userResult.rows[0];

    // Check if user account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      console.log("[auth] Login attempt on locked account");
      return sendError(res, "Account temporarily locked", HttpStatus.FORBIDDEN, "ACCOUNT_LOCKED");
    }

    // Check if user is active
    if (!user.is_active) {
      console.log("[auth] Login attempt on disabled account");
      return sendError(res, "Account disabled", HttpStatus.FORBIDDEN, "ACCOUNT_DISABLED");
    }

    // Check if password hash exists (migration safety)
    if (!user.password_hash) {
      console.log("[auth] User has no password hash - needs migration");
      return sendError(res, "Account requires password reset", HttpStatus.FORBIDDEN, "PASSWORD_RESET_REQUIRED");
    }

    // Verify password using bcrypt
    const passwordValid = await verifyPassword(password, user.password_hash);
    if (!passwordValid) {
      // Requirement 1.2: Same error for invalid email or password (prevent enumeration)
      console.log("[auth] Failed login attempt - invalid password");
      
      // Increment failed login attempts
      try {
        const incrementQuery = UserQueries.incrementFailedAttempts(user.id);
        await query(incrementQuery.text, incrementQuery.values);
        
        // Lock account after 5 failed attempts (15 minute lockout)
        if ((user.failed_login_attempts || 0) >= 4) {
          const lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
          const lockQuery = UserQueries.lockAccount(user.id, lockUntil);
          await query(lockQuery.text, lockQuery.values);
          console.log("[auth] Account locked due to too many failed attempts");
        }
      } catch (lockError) {
        console.error("[auth] Failed to update failed attempts:", lockError);
      }
      
      // Log auth failure to audit_logs
      try {
        const auditQuery = AuditQueries.logAuthEvent(
          user.id,
          "auth_failure",
          false,
          ipAddress,
          userAgent,
          { reason: "invalid_password" }
        );
        await query(auditQuery.text, auditQuery.values);
      } catch (auditError) {
        console.error("[auth] Failed to log auth failure:", auditError);
      }
      
      return sendError(res, "Invalid credentials", HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS");
    }

    // Reset failed login attempts on successful login
    try {
      const resetQuery = UserQueries.resetFailedAttempts(user.id);
      await query(resetQuery.text, resetQuery.values);
    } catch (resetError) {
      console.error("[auth] Failed to reset failed attempts:", resetError);
    }

    // Requirement 1.7: Get permissions for role (deterministic, no DB lookup)
    const permissions = getPermissionsForRole(user.role as UserRole);

    // Generate tokens with embedded role and permissions
    const accessToken = await generateAccessToken(
      user.id,
      user.email,
      user.role as UserRole,
      permissions
    );
    const refreshToken = await generateRefreshToken(user.id);

    // Requirement 3.8: Store refresh token hash in database for revocation capability
    // IMPORTANT: Use hashToken (SHA-256) instead of hashPassword (bcrypt) because:
    // - bcrypt has a 72-byte input limit
    // - JWT tokens are ~244 bytes, and the first 72 bytes are identical for same user
    // - Using bcrypt would break replay attack prevention (Requirement 1.9)
    const refreshTokenHash = hashToken(refreshToken);
    const updateTokenQuery = UserQueries.updateRefreshToken(user.id, refreshTokenHash);
    await query(updateTokenQuery.text, updateTokenQuery.values);

    // Requirement 5.1: Create device session record with device info and IP address
    const sessionId = crypto.randomUUID();
    const deviceInfo = parseDeviceInfo(userAgent);
    
    try {
      const createSessionQuery = SessionQueries.create(
        sessionId,
        user.id,
        deviceInfo,
        ipAddress,
        userAgent
      );
      await query(createSessionQuery.text, createSessionQuery.values);
      console.log("[auth] Device session created:", sessionId.substring(0, 8) + "...");
    } catch (sessionError) {
      // Log but don't fail login if session creation fails
      console.error("[auth] Failed to create device session:", sessionError);
    }

    // Log successful login to audit_logs
    try {
      const auditQuery = AuditQueries.logAuthEvent(
        user.id,
        "user_login",
        true,
        ipAddress,
        userAgent,
        { session_id: sessionId }
      );
      await query(auditQuery.text, auditQuery.values);
    } catch (auditError) {
      console.error("[auth] Failed to log successful login:", auditError);
    }

    // Requirement 1.1: Set HTTP-only cookies with tokens
    setAuthCookies(res, accessToken, refreshToken);

    // Return success (without tokens in body - they're in cookies)
    console.log("[auth] User logged in successfully:", user.id.substring(0, 8) + "...");
    
    return sendSuccess(res, {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        permissions,
      },
      message: "Login successful",
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, error.errors[0].message, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR");
    }
    
    // Check for database schema errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("password_hash") || errorMessage.includes("column")) {
      console.error("[auth] Database schema error:", errorMessage);
      return sendError(
        res, 
        "Database schema needs migration. Run the auth_security_hardening migration.", 
        HttpStatus.INTERNAL_SERVER_ERROR,
        "SCHEMA_MIGRATION_REQUIRED"
      );
    }
    
    console.error("[auth] Login error:", error);
    return sendError(res, "Login failed", HttpStatus.INTERNAL_SERVER_ERROR, "LOGIN_FAILED");
  }
}

/**
 * Logout handler
 * 
 * REQUIREMENTS:
 * - 1.3: WHEN a user calls POST /api/auth?action=logout, THE Auth_System SHALL clear all auth cookies and revoke the refresh token
 * - 5.2: WHEN a user logs out, THE Session_Manager SHALL deactivate the current session
 * 
 * VERIFICATION: Requires authentication, clears cookies, revokes refresh token, deactivates session, logs to audit
 */
async function handleLogout(req: VercelRequest, res: VercelResponse) {
  // Extract request metadata for session matching and audit logging
  const ipAddress = extractIpAddress(req);
  const userAgent = extractUserAgent(req);
  
  try {
    // Requirement: Require authentication for logout
    const user = await requireAuth(req);
    
    // Requirement 1.3: Revoke refresh token (set hash to null)
    const revokeQuery = UserQueries.updateRefreshToken(user.userId, null);
    await query(revokeQuery.text, revokeQuery.values);
    console.log("[auth] Refresh token revoked for user:", user.userId.substring(0, 8) + "...");

    // Requirement 5.2: Deactivate the current session
    // Try to find and deactivate the session matching current IP and user agent
    let deactivatedSessionId: string | null = null;
    try {
      // Get all active sessions for the user
      const getSessionsQuery = SessionQueries.getActiveForUser(user.userId);
      const sessionsResult = await query<{ id: string; ip_address: string | null; user_agent: string | null }>(
        getSessionsQuery.text,
        getSessionsQuery.values
      );

      // Find the session that matches current IP and user agent (best effort match)
      const currentSession = sessionsResult.rows.find(
        (session) => session.ip_address === ipAddress && session.user_agent === userAgent
      );

      if (currentSession) {
        // Deactivate the matched session
        const deactivateQuery = SessionQueries.deactivate(currentSession.id);
        await query(deactivateQuery.text, deactivateQuery.values);
        deactivatedSessionId = currentSession.id;
        console.log("[auth] Session deactivated:", currentSession.id.substring(0, 8) + "...");
      } else if (sessionsResult.rows.length > 0) {
        // If no exact match, deactivate the most recent session by IP (fallback)
        const sessionByIp = sessionsResult.rows.find(
          (session) => session.ip_address === ipAddress
        );
        if (sessionByIp) {
          const deactivateQuery = SessionQueries.deactivate(sessionByIp.id);
          await query(deactivateQuery.text, deactivateQuery.values);
          deactivatedSessionId = sessionByIp.id;
          console.log("[auth] Session deactivated (IP match):", sessionByIp.id.substring(0, 8) + "...");
        }
      }
    } catch (sessionError) {
      // Log but don't fail logout if session deactivation fails
      console.error("[auth] Failed to deactivate session:", sessionError);
    }

    // Log logout event to audit_logs
    try {
      const auditQuery = AuditQueries.logAuthEvent(
        user.userId,
        "user_logout",
        true,
        ipAddress,
        userAgent,
        { session_id: deactivatedSessionId }
      );
      await query(auditQuery.text, auditQuery.values);
    } catch (auditError) {
      // Log but don't fail logout if audit logging fails
      console.error("[auth] Failed to log logout event:", auditError);
    }

    // Requirement 1.3: Clear auth cookies
    clearAuthCookies(res);

    console.log("[auth] User logged out successfully:", user.userId.substring(0, 8) + "...");
    return sendSuccess(res, { message: "Logout successful" });

  } catch (error) {
    // Handle authentication errors
    if (error instanceof Error && error.message === "Authentication required") {
      // Still clear cookies even if not authenticated (defensive)
      clearAuthCookies(res);
      return sendError(res, "Authentication required", HttpStatus.UNAUTHORIZED, "AUTHENTICATION_REQUIRED");
    }
    
    console.error("[auth] Logout error:", error);
    // Still clear cookies even if DB fails (defensive)
    clearAuthCookies(res);
    return sendSuccess(res, { message: "Logout successful" });
  }
}

/**
 * Token refresh handler
 * 
 * REQUIREMENTS:
 * - 1.4: WHEN a user calls POST /api/auth?action=refresh with a valid refresh token, THE Auth_System SHALL issue new access and refresh tokens (token rotation)
 * - 1.9: IF a refresh token has been used previously, THEN THE Auth_System SHALL reject it and require re-authentication (replay attack prevention)
 * - 3.7: WHEN a token refresh occurs, THE JWT_Manager SHALL rotate both access and refresh tokens
 * 
 * VERIFICATION: 
 * - Extract refresh token from cookie (not body)
 * - Verify refresh token JWT signature and expiration
 * - Check token hash matches database (replay attack prevention)
 * - Rotate both access and refresh tokens
 * - Update refresh token hash in database
 */
async function handleRefresh(req: VercelRequest, res: VercelResponse) {
  // Extract request metadata for audit logging
  const ipAddress = extractIpAddress(req);
  const userAgent = extractUserAgent(req);
  
  try {
    // Requirement: Extract refresh token from cookie (primary) or body (fallback for API clients)
    // Cookie extraction is preferred as it's more secure (HttpOnly)
    const refreshToken = extractRefreshTokenFromCookie(req) || req.body?.refreshToken;

    if (!refreshToken) {
      console.log("[auth] Refresh attempt without token");
      return sendError(res, "Refresh token required", HttpStatus.BAD_REQUEST, "REFRESH_TOKEN_REQUIRED");
    }

    // Verify refresh token JWT (signature, expiration, issuer, audience)
    let payload;
    try {
      payload = await verifyRefreshToken(refreshToken);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.log("[auth] Refresh token verification failed:", errorMessage);
      
      // Clear cookies on invalid token to force re-authentication
      clearAuthCookies(res);
      
      return sendError(res, "Invalid or expired refresh token", HttpStatus.UNAUTHORIZED, "INVALID_REFRESH_TOKEN");
    }

    // Get user with refresh token hash for replay attack prevention
    const findUserQuery = UserQueries.findById(payload.sub);
    const userResult = await query<UserAuthRecord>(findUserQuery.text, findUserQuery.values);

    if (userResult.rowCount === 0) {
      console.log("[auth] Refresh attempt for non-existent user");
      clearAuthCookies(res);
      return sendError(res, "User not found", HttpStatus.UNAUTHORIZED, "USER_NOT_FOUND");
    }

    const user = userResult.rows[0];

    // Check if user account is active
    if (!user.is_active) {
      console.log("[auth] Refresh attempt on disabled account");
      clearAuthCookies(res);
      return sendError(res, "Account disabled", HttpStatus.FORBIDDEN, "ACCOUNT_DISABLED");
    }

    // Requirement 1.9: Replay attack prevention
    // Verify the refresh token hash matches what's stored in the database
    // If the hash doesn't match, the token has been used before (replay attack)
    if (!user.refresh_token_hash) {
      console.log("[auth] Refresh attempt with no stored token hash - possible replay attack or logout");
      clearAuthCookies(res);
      
      // Log potential replay attack
      try {
        const auditQuery = AuditQueries.logAuthEvent(
          user.id,
          "auth_failure",
          false,
          ipAddress,
          userAgent,
          { reason: "refresh_token_revoked", type: "replay_attack_prevention" }
        );
        await query(auditQuery.text, auditQuery.values);
      } catch (auditError) {
        console.error("[auth] Failed to log replay attack attempt:", auditError);
      }
      
      return sendError(res, "Refresh token has been revoked", HttpStatus.UNAUTHORIZED, "TOKEN_REVOKED");
    }

    // Verify the provided refresh token matches the stored hash
    // IMPORTANT: Use verifyTokenHash (SHA-256) instead of verifyPassword (bcrypt)
    // to ensure replay attack prevention works correctly (Requirement 1.9)
    const tokenHashValid = verifyTokenHash(refreshToken, user.refresh_token_hash);
    
    if (!tokenHashValid) {
      // Requirement 1.9: Token hash mismatch indicates replay attack
      // The token was valid (passed JWT verification) but doesn't match the current hash
      // This means the token was already used and rotated
      console.log("[auth] Refresh token hash mismatch - replay attack detected");
      
      // Security measure: Revoke all tokens for this user to force re-authentication
      // This protects against an attacker who may have stolen the old token
      const revokeQuery = UserQueries.updateRefreshToken(user.id, null);
      await query(revokeQuery.text, revokeQuery.values);
      
      // Deactivate all sessions for this user as a security precaution
      try {
        const deactivateSessionsQuery = SessionQueries.deactivateAllForUser(user.id);
        await query(deactivateSessionsQuery.text, deactivateSessionsQuery.values);
        console.log("[auth] All sessions deactivated due to replay attack");
      } catch (sessionError) {
        console.error("[auth] Failed to deactivate sessions:", sessionError);
      }
      
      // Log the replay attack attempt
      try {
        const auditQuery = AuditQueries.logAuthEvent(
          user.id,
          "auth_failure",
          false,
          ipAddress,
          userAgent,
          { reason: "replay_attack_detected", action: "all_sessions_revoked" }
        );
        await query(auditQuery.text, auditQuery.values);
      } catch (auditError) {
        console.error("[auth] Failed to log replay attack:", auditError);
      }
      
      clearAuthCookies(res);
      return sendError(
        res, 
        "Refresh token has already been used. Please log in again.", 
        HttpStatus.UNAUTHORIZED, 
        "TOKEN_REUSE_DETECTED"
      );
    }

    // Token is valid and matches stored hash - proceed with rotation
    // Requirement 3.7: Rotate both access and refresh tokens
    const permissions = getPermissionsForRole(user.role as UserRole);

    // Generate new access token with user claims
    const newAccessToken = await generateAccessToken(
      user.id,
      user.email,
      user.role as UserRole,
      permissions
    );

    // Generate new refresh token
    const newRefreshToken = await generateRefreshToken(user.id);

    // Hash the new refresh token for storage
    // IMPORTANT: Use hashToken (SHA-256) for token hashing (Requirement 1.9)
    const newRefreshTokenHash = hashToken(newRefreshToken);

    // Update the refresh token hash in database (this invalidates the old token)
    const updateTokenQuery = UserQueries.updateRefreshToken(user.id, newRefreshTokenHash);
    await query(updateTokenQuery.text, updateTokenQuery.values);

    // Set new cookies with rotated tokens
    setAuthCookies(res, newAccessToken, newRefreshToken);

    // Log successful token refresh
    try {
      const auditQuery = AuditQueries.logAuthEvent(
        user.id,
        "token_refresh",
        true,
        ipAddress,
        userAgent,
        { rotated: true }
      );
      await query(auditQuery.text, auditQuery.values);
    } catch (auditError) {
      console.error("[auth] Failed to log token refresh:", auditError);
    }

    console.log("[auth] Token refreshed successfully for user:", user.id.substring(0, 8) + "...");

    return sendSuccess(res, {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        permissions,
      },
      message: "Token refreshed",
    });

  } catch (error) {
    console.error("[auth] Refresh error:", error);
    
    // Clear cookies on any error to force re-authentication
    clearAuthCookies(res);
    
    return sendError(res, "Token refresh failed", HttpStatus.INTERNAL_SERVER_ERROR, "REFRESH_FAILED");
  }
}

/**
 * Session handler
 * 
 * REQUIREMENTS:
 * - 1.5: WHEN a user calls GET /api/auth?action=session with a valid access token, 
 *        THE Auth_System SHALL return the current user's session information including role and permissions
 * 
 * VERIFICATION: 
 * - Requires authentication via getAuthUser() (supports both cookie and Bearer token)
 * - Returns user session info with id, email, role, and permissions
 * - Returns 401 if not authenticated
 */
async function handleSession(req: VercelRequest, res: VercelResponse) {
  try {
    // Requirement 1.5: Require valid access token
    // getAuthUser() extracts token from cookie or Bearer header and verifies it
    const user = await getAuthUser(req);

    if (!user) {
      // Return 401 with consistent error code if not authenticated
      return sendError(res, "Not authenticated", HttpStatus.UNAUTHORIZED, "AUTHENTICATION_REQUIRED");
    }

    // Requirement 1.5: Return session information including role and permissions
    // The role and permissions are embedded in the JWT token (no DB lookup required)
    return sendSuccess(res, {
      user: {
        id: user.userId,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
      },
      authenticated: true,
    });

  } catch (error) {
    console.error("[auth] Session error:", error);
    return sendError(res, "Session check failed", HttpStatus.INTERNAL_SERVER_ERROR, "SESSION_CHECK_FAILED");
  }
}

/**
 * Registration handler
 * VERIFICATION: Admin only, strict validation
 */
async function handleRegister(req: VercelRequest, res: VercelResponse) {
  try {
    // Only admins can register new users
    const currentUser = await requireAuth(req);
    
    if (currentUser.role !== USER_ROLES.SUPER_ADMIN && currentUser.role !== USER_ROLES.ADMIN) {
      return sendError(res, "Insufficient permissions", HttpStatus.FORBIDDEN);
    }

    // Validate input
    const { email, password, firstName, lastName, role } = registerSchema.parse(req.body);

    // Check if email exists using typed query builder
    const findExistingQuery = UserQueries.findByEmail(email);
    const existingResult = await query(findExistingQuery.text, findExistingQuery.values);

    if (existingResult.rowCount > 0) {
      return sendError(res, "Email already registered", HttpStatus.CONFLICT);
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Generate UUID
    const userId = crypto.randomUUID();

    // Create user using typed query builder
    const createUserQuery = UserQueries.create(userId, email, passwordHash, role as UserRole, firstName, lastName);
    const createResult = await query(createUserQuery.text, createUserQuery.values);

    if (createResult.rowCount === 0) {
      throw new Error("User creation failed");
    }

    const newUser = createResult.rows[0] as { id: string; email: string; role: string };
    const permissions = getPermissionsForRole(newUser.role as UserRole);

    console.log("[auth] User registered:", newUser.id.substring(0, 8) + "... by", currentUser.userId.substring(0, 8) + "...");

    return sendSuccess(res, {
      user: {
        id: newUser.id,
        email: newUser.email,
        role: newUser.role,
        permissions,
      },
      message: "User registered successfully",
    }, HttpStatus.CREATED);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, error.errors[0].message, HttpStatus.BAD_REQUEST);
    }
    if (error instanceof Error && error.message === "Authentication required") {
      return sendError(res, "Authentication required", HttpStatus.UNAUTHORIZED);
    }
    console.error("[auth] Registration error:", error);
    return sendError(res, "Registration failed", HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

/**
 * Export with Arcjet protection
 * VERIFICATION: Arcjet shield applied
 */
export default withArcjetProtection(handler, "auth");
