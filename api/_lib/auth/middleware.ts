/**
 * Auth Middleware Module
 * 
 * Provides authentication and authorization middleware for API routes.
 * 
 * REQUIREMENTS:
 * - 8.5: THE Auth_System SHALL provide requireAuth middleware that throws if not authenticated
 * - 8.6: THE Auth_System SHALL provide requireRole middleware that throws if user lacks required role
 * - 4.8: THE Auth_System SHALL support both cookie-based and Bearer token authentication for API flexibility
 * 
 * SECURITY NOTES:
 * - Supports both cookie-based (access_token cookie) and Bearer token authentication
 * - Cookie-based auth is preferred for browser clients (XSS protection via HttpOnly)
 * - Bearer token auth is supported for API clients and mobile apps
 * - Never logs tokens or sensitive user data
 * - Throws typed errors for consistent error handling
 */

import type { VercelRequest } from "@vercel/node";
import { verifyAccessToken, type AccessTokenPayload, type UserRole } from "./jwt";
import { extractBearerToken, extractAccessTokenFromCookie } from "./cookies";

/**
 * Auth context returned from middleware
 * Contains user information extracted from verified JWT
 */
export interface AuthContext {
  userId: string;
  email: string;
  role: UserRole;
  permissions: string[];
}

/**
 * Custom error class for authentication failures
 * Provides consistent error handling with status codes
 */
export class AuthenticationError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, code: string = "AUTHENTICATION_REQUIRED", statusCode: number = 401) {
    super(message);
    this.name = "AuthenticationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Custom error class for authorization failures
 * Used when user is authenticated but lacks required permissions
 */
export class AuthorizationError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, code: string = "INSUFFICIENT_PERMISSIONS", statusCode: number = 403) {
    super(message);
    this.name = "AuthorizationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Extract access token from request
 * 
 * Checks both cookie-based and Bearer token authentication:
 * 1. First checks for access_token cookie (preferred for browser clients)
 * 2. Falls back to Authorization: Bearer header (for API clients)
 * 
 * @param req - Vercel request object
 * @returns Access token string or null if not found
 */
function extractToken(req: VercelRequest): string | null {
  // Priority 1: Cookie-based authentication (more secure for browsers)
  const cookieToken = extractAccessTokenFromCookie(req);
  if (cookieToken) {
    return cookieToken;
  }

  // Priority 2: Bearer token authentication (for API clients)
  const bearerToken = extractBearerToken(req);
  if (bearerToken) {
    return bearerToken;
  }

  return null;
}

/**
 * Get authenticated user from request (non-throwing)
 * 
 * Extracts and verifies the access token from the request.
 * Returns null if no valid token is found (does not throw).
 * 
 * Use this when authentication is optional or when you need
 * to handle unauthenticated requests gracefully.
 * 
 * @param req - Vercel request object
 * @returns AuthContext if authenticated, null otherwise
 * 
 * @example
 * const user = await getAuthUser(req);
 * if (user) {
 *   // User is authenticated
 *   console.log(user.email, user.role);
 * } else {
 *   // User is not authenticated - handle accordingly
 * }
 */
export async function getAuthUser(req: VercelRequest): Promise<AuthContext | null> {
  const token = extractToken(req);

  if (!token) {
    return null;
  }

  try {
    const payload = await verifyAccessToken(token);
    
    return mapPayloadToAuthContext(payload);
  } catch (error) {
    // Log verification failure without exposing token details
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.log("[AUTH] Token verification failed:", errorMessage);
    return null;
  }
}

/**
 * Require authentication middleware (throwing)
 * 
 * Extracts and verifies the access token from the request.
 * Throws AuthenticationError if no valid token is found.
 * 
 * Use this for routes that require authentication.
 * 
 * @param req - Vercel request object
 * @returns AuthContext with user information
 * @throws AuthenticationError if not authenticated
 * 
 * @example
 * try {
 *   const user = await requireAuth(req);
 *   // User is authenticated - proceed with request
 *   console.log(user.userId, user.role);
 * } catch (error) {
 *   if (error instanceof AuthenticationError) {
 *     return res.status(error.statusCode).json({
 *       success: false,
 *       error: error.message,
 *       code: error.code,
 *     });
 *   }
 * }
 */
export async function requireAuth(req: VercelRequest): Promise<AuthContext> {
  const token = extractToken(req);

  if (!token) {
    throw new AuthenticationError(
      "Authentication required",
      "AUTHENTICATION_REQUIRED",
      401
    );
  }

  try {
    const payload = await verifyAccessToken(token);
    
    return mapPayloadToAuthContext(payload);
  } catch (error) {
    // Log verification failure without exposing token details
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.log("[AUTH] Token verification failed:", errorMessage);

    // Provide specific error messages for common cases
    if (errorMessage.includes("expired")) {
      throw new AuthenticationError(
        "Access token has expired",
        "TOKEN_EXPIRED",
        401
      );
    }

    if (errorMessage.includes("signature")) {
      throw new AuthenticationError(
        "Invalid token",
        "INVALID_TOKEN",
        401
      );
    }

    // Generic authentication error for other cases
    throw new AuthenticationError(
      "Authentication failed",
      "AUTHENTICATION_FAILED",
      401
    );
  }
}

/**
 * Require specific role(s) middleware (throwing)
 * 
 * First verifies authentication, then checks if the user has
 * one of the required roles. Throws appropriate errors if
 * authentication fails or user lacks required role.
 * 
 * Use this for routes that require specific roles (e.g., admin-only).
 * 
 * @param req - Vercel request object
 * @param roles - Array of allowed roles
 * @returns AuthContext with user information
 * @throws AuthenticationError if not authenticated
 * @throws AuthorizationError if user lacks required role
 * 
 * @example
 * try {
 *   const user = await requireRole(req, ["admin", "super_admin"]);
 *   // User is authenticated and has admin role
 * } catch (error) {
 *   if (error instanceof AuthenticationError) {
 *     return res.status(401).json({ ... });
 *   }
 *   if (error instanceof AuthorizationError) {
 *     return res.status(403).json({ ... });
 *   }
 * }
 */
export async function requireRole(
  req: VercelRequest,
  roles: UserRole[]
): Promise<AuthContext> {
  // First, verify authentication
  const user = await requireAuth(req);

  // Then, check if user has one of the required roles
  if (!roles.includes(user.role)) {
    console.log(
      "[AUTH] Authorization failed: user role",
      user.role,
      "not in required roles",
      roles.join(", ")
    );

    throw new AuthorizationError(
      "Insufficient permissions",
      "INSUFFICIENT_PERMISSIONS",
      403
    );
  }

  return user;
}

/**
 * Map JWT payload to AuthContext
 * 
 * Converts the verified JWT payload to the AuthContext interface
 * used throughout the application.
 * 
 * @param payload - Verified access token payload
 * @returns AuthContext object
 */
function mapPayloadToAuthContext(payload: AccessTokenPayload): AuthContext {
  return {
    userId: payload.sub,
    email: payload.email,
    role: payload.role,
    permissions: payload.permissions || [],
  };
}

/**
 * Check if user has a specific permission
 * 
 * Utility function to check if the authenticated user has
 * a specific permission in their permissions array.
 * 
 * @param user - AuthContext from middleware
 * @param permission - Permission string to check
 * @returns true if user has the permission
 * 
 * @example
 * const user = await requireAuth(req);
 * if (hasPermission(user, "users:write")) {
 *   // User can write users
 * }
 */
export function hasPermission(user: AuthContext, permission: string): boolean {
  return user.permissions.includes(permission);
}

/**
 * Require specific permission middleware (throwing)
 * 
 * First verifies authentication, then checks if the user has
 * the required permission. Throws appropriate errors if
 * authentication fails or user lacks required permission.
 * 
 * @param req - Vercel request object
 * @param permission - Required permission string
 * @returns AuthContext with user information
 * @throws AuthenticationError if not authenticated
 * @throws AuthorizationError if user lacks required permission
 * 
 * @example
 * const user = await requirePermission(req, "applications:review");
 */
export async function requirePermission(
  req: VercelRequest,
  permission: string
): Promise<AuthContext> {
  const user = await requireAuth(req);

  if (!hasPermission(user, permission)) {
    console.log(
      "[AUTH] Authorization failed: user lacks permission",
      permission
    );

    throw new AuthorizationError(
      "Insufficient permissions",
      "INSUFFICIENT_PERMISSIONS",
      403
    );
  }

  return user;
}
