/**
 * Feature: migration-recovery-hardening, Property 11: Login issues both access and refresh tokens as HTTP-only cookies
 *
 * **Validates: Requirements 10.1**
 *
 * We test the cookie-setting layer directly: setAuthCookies must produce
 * two Set-Cookie headers (access_token + refresh_token), both with HttpOnly,
 * with correct Max-Age and path restrictions.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import { setAuthCookies, getCookieConfig } from '../../lib/auth/cookies';

describe('Property 11: Login cookie issuance', () => {
  const cookieConfig = getCookieConfig();

  it('setAuthCookies sets two HttpOnly Set-Cookie headers for any token pair', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 10, maxLength: 50 }),
        fc.string({ minLength: 10, maxLength: 50 }),
        (accessToken, refreshToken) => {
          const headers: Record<string, string | string[]> = {};
          const mockRes = {
            setHeader: (name: string, value: string | string[]) => {
              headers[name] = value;
            },
          } as any;

          setAuthCookies(mockRes, accessToken, refreshToken);

          const setCookieHeader = headers['Set-Cookie'];
          expect(Array.isArray(setCookieHeader)).toBe(true);

          const cookies = setCookieHeader as string[];
          expect(cookies.length).toBe(2);

          // Both must have HttpOnly
          for (const cookie of cookies) {
            expect(cookie).toContain('HttpOnly');
          }

          // One access_token, one refresh_token
          const ac = cookies.find(c => c.startsWith(cookieConfig.accessTokenCookieName + '='));
          const rc = cookies.find(c => c.startsWith(cookieConfig.refreshTokenCookieName + '='));
          expect(ac).toBeDefined();
          expect(rc).toBeDefined();

          // Refresh cookie restricted to /api/auth
          expect(rc).toContain(`Path=${cookieConfig.refreshTokenPath}`);

          // Access cookie Max-Age = 900
          expect(ac).toContain(`Max-Age=${cookieConfig.accessTokenMaxAge}`);
          // Refresh cookie Max-Age = 604800
          expect(rc).toContain(`Max-Age=${cookieConfig.refreshTokenMaxAge}`);
        }
      ),
      { numRuns: 5 }
    );
  });

  it('cookie config has correct expiration values', () => {
    expect(cookieConfig.accessTokenMaxAge).toBe(900);
    expect(cookieConfig.refreshTokenMaxAge).toBe(604800);
    expect(cookieConfig.refreshTokenPath).toBe('/api/auth');
  });

  it('SameSite=Lax is set on both cookies', () => {
    const headers: Record<string, string | string[]> = {};
    const mockRes = {
      setHeader: (name: string, value: string | string[]) => {
        headers[name] = value;
      },
    } as any;

    setAuthCookies(mockRes, 'test-access', 'test-refresh');
    const cookies = headers['Set-Cookie'] as string[];
    for (const cookie of cookies) {
      expect(cookie).toContain('SameSite=Lax');
    }
  });
});
