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
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withArcjetProtection } from "./_lib/arcjet";
import {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  setAuthCookies,
  clearAuthCookies,
  getAuthUser,
  requireAuth,
  getPermissionsForRole,
  USER_ROLES,
  type UserRole,
} from "./_lib/auth";
import { query, userQueries, DatabaseError } from "./_lib/db";
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
 * Login handler
 * VERIFICATION: bcrypt password compare, JWT generation
 */
async function handleLogin(req: VercelRequest, res: VercelResponse) {
  try {
    // Validate input
    const { email, password } = loginSchema.parse(req.body);

    // Find user by email
    const userResult = await query(
      userQueries.findByEmail(email).text,
      userQueries.findByEmail(email).values
    );

    if (userResult.rowCount === 0) {
      // Same error for invalid email or password (prevent enumeration)
      return sendError(res, "Invalid credentials", HttpStatus.UNAUTHORIZED);
    }

    const user = userResult.rows[0];

    // Check if user is active
    if (!user.is_active) {
      return sendError(res, "Account disabled", HttpStatus.FORBIDDEN);
    }

    // Verify password
    const passwordValid = await verifyPassword(password, user.password_hash);
    if (!passwordValid) {
      // Log failed attempt for security audit
      console.log(`[auth] Failed login attempt: ${email}`);
      return sendError(res, "Invalid credentials", HttpStatus.UNAUTHORIZED);
    }

    // Get permissions for role
    const permissions = getPermissionsForRole(user.role as UserRole);

    // Generate tokens
    const accessToken = await generateAccessToken(
      user.id,
      user.email,
      user.role as UserRole,
      permissions
    );
    const refreshToken = await generateRefreshToken(user.id);

    // Store refresh token hash (for revocation capability)
    const refreshTokenHash = await hashPassword(refreshToken);
    await query(
      userQueries.updateRefreshToken(user.id, refreshTokenHash).text,
      userQueries.updateRefreshToken(user.id, refreshTokenHash).values
    );

    // Set HTTP-only cookies
    setAuthCookies(res, accessToken, refreshToken);

    // Return success (without tokens in body - they're in cookies)
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
      return sendError(res, error.errors[0].message, HttpStatus.BAD_REQUEST);
    }
    console.error("[auth] Login error:", error);
    return sendError(res, "Login failed", HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

/**
 * Logout handler
 * VERIFICATION: Clears cookies, revokes refresh token
 */
async function handleLogout(req: VercelRequest, res: VercelResponse) {
  try {
    // Get current user (if authenticated)
    const user = await getAuthUser(req);
    
    if (user) {
      // Revoke refresh token
      await query(
        userQueries.updateRefreshToken(user.userId, null).text,
        userQueries.updateRefreshToken(user.userId, null).values
      );
      console.log(`[auth] User logged out: ${user.userId}`);
    }

    // Clear cookies
    clearAuthCookies(res);

    return sendSuccess(res, { message: "Logout successful" });

  } catch (error) {
    console.error("[auth] Logout error:", error);
    // Still clear cookies even if DB fails
    clearAuthCookies(res);
    return sendSuccess(res, { message: "Logout successful" });
  }
}

/**
 * Token refresh handler
 * VERIFICATION: Refresh token validation, rotation
 */
async function handleRefresh(req: VercelRequest, res: VercelResponse) {
  try {
    // Get refresh token from cookie or body
    const refreshToken = req.cookies?.refresh_token || req.body?.refreshToken;

    if (!refreshToken) {
      return sendError(res, "Refresh token required", HttpStatus.BAD_REQUEST);
    }

    // Verify refresh token
    let payload;
    try {
      payload = await verifyRefreshToken(refreshToken);
    } catch {
      return sendError(res, "Invalid refresh token", HttpStatus.UNAUTHORIZED);
    }

    // Get user
    const userResult = await query(
      userQueries.findById(payload.sub).text,
      userQueries.findById(payload.sub).values
    );

    if (userResult.rowCount === 0) {
      return sendError(res, "User not found", HttpStatus.UNAUTHORIZED);
    }

    const user = userResult.rows[0];

    if (!user.is_active) {
      return sendError(res, "Account disabled", HttpStatus.FORBIDDEN);
    }

    // Get permissions
    const permissions = getPermissionsForRole(user.role as UserRole);

    // Generate new tokens (token rotation)
    const newAccessToken = await generateAccessToken(
      user.id,
      user.email,
      user.role as UserRole,
      permissions
    );
    const newRefreshToken = await generateRefreshToken(user.id);

    // Store new refresh token hash
    const newRefreshTokenHash = await hashPassword(newRefreshToken);
    await query(
      userQueries.updateRefreshToken(user.id, newRefreshTokenHash).text,
      userQueries.updateRefreshToken(user.id, newRefreshTokenHash).values
    );

    // Set new cookies
    setAuthCookies(res, newAccessToken, newRefreshToken);

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
    return sendError(res, "Token refresh failed", HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

/**
 * Session handler
 * VERIFICATION: Returns current session info
 */
async function handleSession(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await getAuthUser(req);

    if (!user) {
      return sendError(res, "Not authenticated", HttpStatus.UNAUTHORIZED);
    }

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
    return sendError(res, "Session check failed", HttpStatus.INTERNAL_SERVER_ERROR);
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

    // Check if email exists
    const existingResult = await query(
      userQueries.findByEmail(email).text,
      userQueries.findByEmail(email).values
    );

    if (existingResult.rowCount > 0) {
      return sendError(res, "Email already registered", HttpStatus.CONFLICT);
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Generate UUID
    const userId = crypto.randomUUID();

    // Create user
    const createResult = await query(
      userQueries.create(userId, email, passwordHash, role, firstName, lastName).text,
      userQueries.create(userId, email, passwordHash, role, firstName, lastName).values
    );

    if (createResult.rowCount === 0) {
      throw new Error("User creation failed");
    }

    const newUser = createResult.rows[0];
    const permissions = getPermissionsForRole(newUser.role as UserRole);

    console.log(`[auth] User registered: ${newUser.id} by ${currentUser.userId}`);

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
