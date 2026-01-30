/**
 * Property-Based Tests: Cookie Manager
 * Feature: auth-security-hardening
 * Task: 3.6 Write property tests for cookie manager
 * 
 * **Property 5: Cookie security flags**
 * 
 * *For any* auth cookie set in production, the cookie SHALL have HttpOnly, Secure, and SameSite=Strict flags.
 * 
 * Additional properties tested:
 * - Access token cookie has correct Max-Age (900 seconds)
 * - Refresh token cookie has correct Max-Age (604800 seconds)
 * - Refresh token cookie path is limited to /api/auth
 * - Clear cookies sets Max-Age to 0
 * - Bearer token extraction works correctly
 * - Cookie extraction handles various formats
 * 
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8**
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  setAuthCookies,
  clearAuthCookies,
  extractBearerToken,
  extractAccessTokenFromCookie,
  extractRefreshTokenFromCookie,
  getCookieConfig,
} from '../../api/_lib/auth/cookies';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// ============================================================================
// Test Configuration
// ============================================================================

const NUM_RUNS = 100;

/**
 * Base64URL character set (used in JWT tokens)
 * JWT tokens use base64url encoding which only contains: A-Z, a-z, 0-9, -, _
 * No padding (=) in the middle of tokens, only at the end of segments
 */
const base64UrlChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * Generate a base64url-safe string (no special characters that would break cookie parsing)
 */
const base64UrlStringArb = fc.array(
  fc.constantFrom(...base64UrlChars.split('')),
  { minLength: 10, maxLength: 100 }
).map(chars => chars.join(''));

/**
 * JWT-like token arbitrary generator
 * Generates strings that look like JWT tokens (three base64url parts separated by dots)
 * Real JWT tokens are base64url encoded and don't contain semicolons, spaces, or equals signs
 */
const jwtTokenArb = fc.tuple(
  base64UrlStringArb,
  base64UrlStringArb,
  base64UrlStringArb
).map(([header, payload, signature]) => `${header}.${payload}.${signature}`);

/**
 * Token string arbitrary for general token testing
 * Uses base64url characters only (realistic for JWT tokens)
 */
const tokenStringArb = base64UrlStringArb;

// ============================================================================
// Mock Helpers
// ============================================================================

/**
 * Create a mock VercelResponse for testing cookie setting
 */
function createMockResponse(): VercelResponse & { cookies: string[] } {
  const cookies: string[] = [];
  return {
    cookies,
    setHeader: vi.fn((name: string, value: string | string[]) => {
      if (name === 'Set-Cookie') {
        if (Array.isArray(value)) {
          cookies.push(...value);
        } else {
          cookies.push(value);
        }
      }
      return {} as VercelResponse;
    }),
  } as unknown as VercelResponse & { cookies: string[] };
}

/**
 * Create a mock VercelRequest with cookie header
 */
function createMockRequestWithCookies(cookieString: string): VercelRequest {
  return {
    headers: {
      cookie: cookieString,
    },
  } as unknown as VercelRequest;
}

/**
 * Create a mock VercelRequest with Authorization header
 */
function createMockRequestWithAuth(authHeader: string): VercelRequest {
  return {
    headers: {
      authorization: authHeader,
    },
  } as unknown as VercelRequest;
}

/**
 * Parse a cookie string into its components
 */
function parseCookieString(cookieStr: string): {
  name: string;
  value: string;
  attributes: Record<string, string | boolean>;
} {
  const parts = cookieStr.split(';').map(p => p.trim());
  const [nameValue, ...attrParts] = parts;
  const [name, value] = nameValue.split('=');
  
  const attributes: Record<string, string | boolean> = {};
  for (const attr of attrParts) {
    if (attr.includes('=')) {
      const [key, val] = attr.split('=');
      attributes[key.toLowerCase()] = val;
    } else {
      attributes[attr.toLowerCase()] = true;
    }
  }
  
  return { name, value, attributes };
}

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 5: Cookie security flags', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  /**
   * **Validates: Requirements 4.1, 4.2, 4.3**
   * 
   * WHEN setting auth cookies in production, THE Auth_System SHALL set:
   * - HttpOnly flag to prevent JavaScript access
   * - Secure flag to require HTTPS
   * - SameSite=Strict to prevent CSRF attacks
   */
  describe('Production Cookie Security Flags', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('PROPERTY: All auth cookies in production have HttpOnly flag', () => {
      fc.assert(
        fc.property(
          jwtTokenArb,
          jwtTokenArb,
          (accessToken, refreshToken) => {
            const res = createMockResponse();
            setAuthCookies(res, accessToken, refreshToken);
            
            // Both cookies must have HttpOnly flag
            for (const cookie of res.cookies) {
              const parsed = parseCookieString(cookie);
              expect(parsed.attributes['httponly']).toBe(true);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: All auth cookies in production have Secure flag', () => {
      fc.assert(
        fc.property(
          jwtTokenArb,
          jwtTokenArb,
          (accessToken, refreshToken) => {
            const res = createMockResponse();
            setAuthCookies(res, accessToken, refreshToken);
            
            // Both cookies must have Secure flag in production
            for (const cookie of res.cookies) {
              const parsed = parseCookieString(cookie);
              expect(parsed.attributes['secure']).toBe(true);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: All auth cookies have SameSite=Strict', () => {
      fc.assert(
        fc.property(
          jwtTokenArb,
          jwtTokenArb,
          (accessToken, refreshToken) => {
            const res = createMockResponse();
            setAuthCookies(res, accessToken, refreshToken);
            
            // Both cookies must have SameSite=Strict
            for (const cookie of res.cookies) {
              const parsed = parseCookieString(cookie);
              expect(parsed.attributes['samesite']).toBe('Strict');
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Production cookies have all three security flags together', () => {
      fc.assert(
        fc.property(
          jwtTokenArb,
          jwtTokenArb,
          (accessToken, refreshToken) => {
            const res = createMockResponse();
            setAuthCookies(res, accessToken, refreshToken);
            
            // Verify all security flags are present on each cookie
            for (const cookie of res.cookies) {
              const parsed = parseCookieString(cookie);
              expect(parsed.attributes['httponly']).toBe(true);
              expect(parsed.attributes['secure']).toBe(true);
              expect(parsed.attributes['samesite']).toBe('Strict');
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Development Cookie Security Flags', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    it('PROPERTY: Development cookies have HttpOnly and SameSite but not Secure', () => {
      fc.assert(
        fc.property(
          jwtTokenArb,
          jwtTokenArb,
          (accessToken, refreshToken) => {
            const res = createMockResponse();
            setAuthCookies(res, accessToken, refreshToken);
            
            for (const cookie of res.cookies) {
              const parsed = parseCookieString(cookie);
              // HttpOnly and SameSite should always be present
              expect(parsed.attributes['httponly']).toBe(true);
              expect(parsed.attributes['samesite']).toBe('Strict');
              // Secure should NOT be present in development (allows HTTP)
              expect(parsed.attributes['secure']).toBeUndefined();
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  /**
   * **Validates: Requirements 4.4, 4.5**
   * 
   * THE Auth_System SHALL set:
   * - Access token cookie with Max-Age of 900 seconds (15 minutes)
   * - Refresh token cookie with Max-Age of 604800 seconds (7 days)
   */
  describe('Cookie Expiration Times', () => {
    it('PROPERTY: Access token cookie has Max-Age of 900 seconds', () => {
      fc.assert(
        fc.property(
          jwtTokenArb,
          jwtTokenArb,
          (accessToken, refreshToken) => {
            const res = createMockResponse();
            setAuthCookies(res, accessToken, refreshToken);
            
            // Find access_token cookie
            const accessCookie = res.cookies.find(c => c.startsWith('access_token='));
            expect(accessCookie).toBeDefined();
            
            const parsed = parseCookieString(accessCookie!);
            expect(parsed.attributes['max-age']).toBe('900');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Refresh token cookie has Max-Age of 604800 seconds', () => {
      fc.assert(
        fc.property(
          jwtTokenArb,
          jwtTokenArb,
          (accessToken, refreshToken) => {
            const res = createMockResponse();
            setAuthCookies(res, accessToken, refreshToken);
            
            // Find refresh_token cookie
            const refreshCookie = res.cookies.find(c => c.startsWith('refresh_token='));
            expect(refreshCookie).toBeDefined();
            
            const parsed = parseCookieString(refreshCookie!);
            expect(parsed.attributes['max-age']).toBe('604800');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  /**
   * **Validates: Requirements 4.6**
   * 
   * THE Auth_System SHALL set refresh token cookie path to /api/auth to limit exposure.
   */
  describe('Cookie Path Restrictions', () => {
    it('PROPERTY: Access token cookie has path /', () => {
      fc.assert(
        fc.property(
          jwtTokenArb,
          jwtTokenArb,
          (accessToken, refreshToken) => {
            const res = createMockResponse();
            setAuthCookies(res, accessToken, refreshToken);
            
            const accessCookie = res.cookies.find(c => c.startsWith('access_token='));
            const parsed = parseCookieString(accessCookie!);
            expect(parsed.attributes['path']).toBe('/');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Refresh token cookie has path /api/auth', () => {
      fc.assert(
        fc.property(
          jwtTokenArb,
          jwtTokenArb,
          (accessToken, refreshToken) => {
            const res = createMockResponse();
            setAuthCookies(res, accessToken, refreshToken);
            
            const refreshCookie = res.cookies.find(c => c.startsWith('refresh_token='));
            const parsed = parseCookieString(refreshCookie!);
            expect(parsed.attributes['path']).toBe('/api/auth');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  /**
   * **Validates: Requirements 4.7**
   * 
   * WHEN logging out, THE Auth_System SHALL clear cookies by setting Max-Age to 0.
   */
  describe('Cookie Clearing', () => {
    it('PROPERTY: clearAuthCookies sets Max-Age to 0 for both cookies', () => {
      const res = createMockResponse();
      clearAuthCookies(res);
      
      // Both cookies should be cleared
      expect(res.cookies.length).toBe(2);
      
      for (const cookie of res.cookies) {
        const parsed = parseCookieString(cookie);
        expect(parsed.attributes['max-age']).toBe('0');
      }
    });

    it('PROPERTY: Cleared cookies maintain security flags', () => {
      process.env.NODE_ENV = 'production';
      const res = createMockResponse();
      clearAuthCookies(res);
      
      for (const cookie of res.cookies) {
        const parsed = parseCookieString(cookie);
        expect(parsed.attributes['httponly']).toBe(true);
        expect(parsed.attributes['samesite']).toBe('Strict');
      }
    });
  });

  /**
   * **Validates: Requirements 4.8**
   * 
   * THE Auth_System SHALL support both cookie-based and Bearer token authentication.
   */
  describe('Bearer Token Extraction', () => {
    it('PROPERTY: extractBearerToken extracts token from valid Authorization header', () => {
      fc.assert(
        fc.property(
          tokenStringArb,
          (token) => {
            const req = createMockRequestWithAuth(`Bearer ${token}`);
            const extracted = extractBearerToken(req);
            expect(extracted).toBe(token);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: extractBearerToken returns null for missing Authorization header', () => {
      const req = { headers: {} } as unknown as VercelRequest;
      const extracted = extractBearerToken(req);
      expect(extracted).toBeNull();
    });

    it('PROPERTY: extractBearerToken returns null for non-Bearer auth', () => {
      fc.assert(
        fc.property(
          tokenStringArb,
          (token) => {
            const req = createMockRequestWithAuth(`Basic ${token}`);
            const extracted = extractBearerToken(req);
            expect(extracted).toBeNull();
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: extractBearerToken returns null for empty Bearer token', () => {
      const req = createMockRequestWithAuth('Bearer ');
      const extracted = extractBearerToken(req);
      expect(extracted).toBeNull();
    });

    it('PROPERTY: extractBearerToken returns null for Bearer with only whitespace', () => {
      const req = createMockRequestWithAuth('Bearer    ');
      const extracted = extractBearerToken(req);
      expect(extracted).toBeNull();
    });
  });

  describe('Cookie Token Extraction', () => {
    it('PROPERTY: extractAccessTokenFromCookie extracts token correctly', () => {
      fc.assert(
        fc.property(
          tokenStringArb,
          (token) => {
            const req = createMockRequestWithCookies(`access_token=${token}`);
            const extracted = extractAccessTokenFromCookie(req);
            expect(extracted).toBe(token);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: extractRefreshTokenFromCookie extracts token correctly', () => {
      fc.assert(
        fc.property(
          tokenStringArb,
          (token) => {
            const req = createMockRequestWithCookies(`refresh_token=${token}`);
            const extracted = extractRefreshTokenFromCookie(req);
            expect(extracted).toBe(token);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Cookie extraction handles multiple cookies', () => {
      fc.assert(
        fc.property(
          tokenStringArb,
          tokenStringArb,
          (accessToken, refreshToken) => {
            const cookieString = `access_token=${accessToken}; refresh_token=${refreshToken}; other=value`;
            const req = createMockRequestWithCookies(cookieString);
            
            expect(extractAccessTokenFromCookie(req)).toBe(accessToken);
            expect(extractRefreshTokenFromCookie(req)).toBe(refreshToken);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Cookie extraction returns null for missing cookies', () => {
      const req = createMockRequestWithCookies('other=value');
      expect(extractAccessTokenFromCookie(req)).toBeNull();
      expect(extractRefreshTokenFromCookie(req)).toBeNull();
    });

    it('PROPERTY: Cookie extraction returns null for empty cookie header', () => {
      const req = { headers: {} } as unknown as VercelRequest;
      expect(extractAccessTokenFromCookie(req)).toBeNull();
      expect(extractRefreshTokenFromCookie(req)).toBeNull();
    });
  });

  describe('Token Value Preservation', () => {
    it('PROPERTY: Token values are preserved exactly in cookies', () => {
      fc.assert(
        fc.property(
          jwtTokenArb,
          jwtTokenArb,
          (accessToken, refreshToken) => {
            const res = createMockResponse();
            setAuthCookies(res, accessToken, refreshToken);
            
            const accessCookie = res.cookies.find(c => c.startsWith('access_token='));
            const refreshCookie = res.cookies.find(c => c.startsWith('refresh_token='));
            
            const parsedAccess = parseCookieString(accessCookie!);
            const parsedRefresh = parseCookieString(refreshCookie!);
            
            expect(parsedAccess.value).toBe(accessToken);
            expect(parsedRefresh.value).toBe(refreshToken);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Configuration Verification', () => {
    it('should have correct cookie configuration constants', () => {
      const config = getCookieConfig();
      
      expect(config.accessTokenCookieName).toBe('access_token');
      expect(config.refreshTokenCookieName).toBe('refresh_token');
      expect(config.accessTokenMaxAge).toBe(900);
      expect(config.refreshTokenMaxAge).toBe(604800);
      expect(config.refreshTokenPath).toBe('/api/auth');
    });
  });
});
