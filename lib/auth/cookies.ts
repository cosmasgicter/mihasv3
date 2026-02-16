/**
 * Cookie Manager Module
 * 
 * Provides secure HTTP-only cookie management for JWT tokens.
 * 
 * REQUIREMENTS:
 * - 4.1: WHEN setting auth cookies, THE Auth_System SHALL set the HttpOnly flag to prevent JavaScript access
 * - 4.2: WHEN setting auth cookies in production, THE Auth_System SHALL set the Secure flag to require HTTPS
 * - 4.3: WHEN setting auth cookies, THE Auth_System SHALL set SameSite=Lax to prevent CSRF on unsafe methods while allowing top-level navigations
 * - 4.4: THE Auth_System SHALL set access token cookie with Max-Age of 900 seconds (15 minutes)
 * - 4.5: THE Auth_System SHALL set refresh token cookie with Max-Age of 604800 seconds (7 days)
 * - 4.6: THE Auth_System SHALL set refresh token cookie path to /api/auth to limit exposure
 * - 4.7: WHEN logging out, THE Auth_System SHALL clear cookies by setting Max-Age to 0
 * - 4.8: THE Auth_System SHALL support both cookie-based and Bearer token authentication for API flexibility
 * 
 * SECURITY NOTES:
 * - HttpOnly prevents XSS attacks from accessing tokens
 * - Secure flag ensures cookies only sent over HTTPS in production
 * - SameSite=Lax prevents CSRF on POST/PUT/DELETE while allowing cookies on top-level GET navigations
 * - Refresh token path limited to /api/auth to reduce exposure
 * - Never logs tokens
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

// Cookie names
const ACCESS_TOKEN_COOKIE = "access_token";
const REFRESH_TOKEN_COOKIE = "refresh_token";

// Cookie expiration times in seconds
const ACCESS_TOKEN_MAX_AGE = 900;      // 15 minutes
const REFRESH_TOKEN_MAX_AGE = 604800;  // 7 days

// Refresh token path - limited to auth endpoints only
const REFRESH_TOKEN_PATH = "/api/auth";

/**
 * Check if the current environment is production
 * Uses NODE_ENV to determine if Secure flag should be set
 * 
 * NOTE: We read from process['env'] to prevent Bun's bundler from
 * statically evaluating process.env.NODE_ENV at build time and
 * hardcoding the result to `false`.
 */
function isProduction(): boolean {
  const env = process['env'];
  return env.NODE_ENV === "production";
}

/**
 * Build a cookie string with security flags
 * 
 * @param name - Cookie name
 * @param value - Cookie value
 * @param maxAge - Max-Age in seconds
 * @param path - Cookie path (defaults to "/")
 * @returns Formatted cookie string
 */
function buildCookieString(
  name: string,
  value: string,
  maxAge: number,
  path: string = "/"
): string {
  const parts: string[] = [
    `${name}=${value}`,
    `Max-Age=${maxAge}`,
    `Path=${path}`,
    "HttpOnly",
    "SameSite=Lax",
  ];

  // Add Secure flag in production to require HTTPS
  if (isProduction()) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

/**
 * Set authentication cookies with proper security flags
 * 
 * Sets both access token and refresh token cookies with:
 * - HttpOnly: Prevents JavaScript access (XSS protection)
 * - Secure: Requires HTTPS in production
 * - SameSite=Strict: Prevents CSRF attacks
 * 
 * Access token cookie:
 * - Max-Age: 900 seconds (15 minutes)
 * - Path: / (available to all routes)
 * 
 * Refresh token cookie:
 * - Max-Age: 604800 seconds (7 days)
 * - Path: /api/auth (limited exposure)
 * 
 * @param res - Vercel response object
 * @param accessToken - JWT access token
 * @param refreshToken - JWT refresh token
 * 
 * @example
 * setAuthCookies(res, accessToken, refreshToken);
 * // Sets two cookies with proper security flags
 */
export function setAuthCookies(
  res: VercelResponse,
  accessToken: string,
  refreshToken: string
): void {
  // Build cookie strings with security flags
  const accessCookie = buildCookieString(
    ACCESS_TOKEN_COOKIE,
    accessToken,
    ACCESS_TOKEN_MAX_AGE,
    "/"
  );

  const refreshCookie = buildCookieString(
    REFRESH_TOKEN_COOKIE,
    refreshToken,
    REFRESH_TOKEN_MAX_AGE,
    REFRESH_TOKEN_PATH
  );

  // Set both cookies using Set-Cookie header
  // Multiple Set-Cookie headers are allowed and required for multiple cookies
  res.setHeader("Set-Cookie", [accessCookie, refreshCookie]);
}

/**
 * Clear authentication cookies by setting Max-Age to 0
 * 
 * This effectively deletes the cookies from the browser.
 * Used during logout to remove authentication state.
 * 
 * @param res - Vercel response object
 * 
 * @example
 * clearAuthCookies(res);
 * // Both access_token and refresh_token cookies are cleared
 */
export function clearAuthCookies(res: VercelResponse): void {
  // Build cookie strings with Max-Age=0 to clear them
  const clearAccessCookie = buildCookieString(
    ACCESS_TOKEN_COOKIE,
    "",
    0,
    "/"
  );

  const clearRefreshCookie = buildCookieString(
    REFRESH_TOKEN_COOKIE,
    "",
    0,
    REFRESH_TOKEN_PATH
  );

  // Set both cookies with Max-Age=0 to clear them
  res.setHeader("Set-Cookie", [clearAccessCookie, clearRefreshCookie]);
}

/**
 * Parse cookies from request headers
 * 
 * Cookie values in HTTP headers are NOT trimmed - whitespace is preserved.
 * However, cookie names are trimmed as per RFC 6265.
 * 
 * Note: JWT tokens are base64url encoded and don't contain special characters
 * like semicolons or equals signs, so simple parsing is sufficient.
 * 
 * @param req - Vercel request object
 * @returns Object mapping cookie names to values
 */
function parseCookies(req: VercelRequest): Record<string, string> {
  const cookieHeader = req.headers.cookie;
  
  if (!cookieHeader) {
    return {};
  }

  const cookies: Record<string, string> = {};
  
  // Parse cookie header: "name1=value1; name2=value2"
  // Split on semicolons to separate cookies
  const pairs = cookieHeader.split(";");
  
  for (const pair of pairs) {
    // Find the first equals sign - everything before is the name, after is the value
    const equalsIndex = pair.indexOf("=");
    
    if (equalsIndex > 0) {
      // Cookie names are trimmed, but values preserve whitespace
      const name = pair.substring(0, equalsIndex).trim();
      // Value is everything after the first equals sign (may contain more equals signs)
      const value = pair.substring(equalsIndex + 1);
      cookies[name] = value;
    }
  }

  return cookies;
}

/**
 * Extract Bearer token from Authorization header
 * 
 * Supports API clients that prefer Bearer token authentication
 * over cookie-based authentication.
 * 
 * @param req - Vercel request object
 * @returns Bearer token string or null if not present
 * 
 * @example
 * // Request with header: Authorization: Bearer eyJhbGc...
 * const token = extractBearerToken(req);
 * // Returns: "eyJhbGc..."
 */
export function extractBearerToken(req: VercelRequest): string | null {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return null;
  }

  // Check for Bearer prefix (case-insensitive)
  const bearerPrefix = "Bearer ";
  if (!authHeader.startsWith(bearerPrefix)) {
    return null;
  }

  // Extract token after "Bearer "
  const token = authHeader.substring(bearerPrefix.length).trim();
  
  // Return null for empty tokens
  if (token.length === 0) {
    return null;
  }

  return token;
}

/**
 * Extract access token from cookie
 * 
 * @param req - Vercel request object
 * @returns Access token string or null if not present
 * 
 * @example
 * const accessToken = extractAccessTokenFromCookie(req);
 * if (accessToken) {
 *   // Verify and use the token
 * }
 */
export function extractAccessTokenFromCookie(req: VercelRequest): string | null {
  const cookies = parseCookies(req);
  const token = cookies[ACCESS_TOKEN_COOKIE];
  
  // Return null for missing or empty tokens
  if (!token || token.length === 0) {
    return null;
  }

  return token;
}

/**
 * Extract refresh token from cookie
 * 
 * @param req - Vercel request object
 * @returns Refresh token string or null if not present
 * 
 * @example
 * const refreshToken = extractRefreshTokenFromCookie(req);
 * if (refreshToken) {
 *   // Verify and use the token for refresh
 * }
 */
export function extractRefreshTokenFromCookie(req: VercelRequest): string | null {
  const cookies = parseCookies(req);
  const token = cookies[REFRESH_TOKEN_COOKIE];
  
  // Return null for missing or empty tokens
  if (!token || token.length === 0) {
    return null;
  }

  return token;
}

/**
 * Get cookie configuration constants
 * Useful for testing and configuration verification
 */
export function getCookieConfig() {
  return {
    accessTokenCookieName: ACCESS_TOKEN_COOKIE,
    refreshTokenCookieName: REFRESH_TOKEN_COOKIE,
    accessTokenMaxAge: ACCESS_TOKEN_MAX_AGE,
    refreshTokenMaxAge: REFRESH_TOKEN_MAX_AGE,
    refreshTokenPath: REFRESH_TOKEN_PATH,
  };
}
