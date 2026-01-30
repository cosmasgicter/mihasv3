/**
 * Property Test: CORS Handler
 * Feature: bun-vercel-migration
 * Property 2: API Behavior Preservation (CORS)
 * Validates: Requirements 3.3
 * 
 * For any API endpoint and any valid request, the migrated Vercel function SHALL return:
 * - Identical CORS headers as the original Cloudflare function
 * - Same JSON response format
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { getCorsHeaders, isOriginAllowed, getAllowedOrigins } from '../../api/_lib/cors';

describe('Feature: bun-vercel-migration, Property 2: API Behavior Preservation (CORS)', () => {
  const ALLOWED_ORIGINS = getAllowedOrigins();

  it('should return allowed origin for any allowed origin input', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALLOWED_ORIGINS),
        (origin) => {
          const headers = getCorsHeaders(origin);
          expect(headers['Access-Control-Allow-Origin']).toBe(origin);
          expect(headers['Access-Control-Allow-Methods']).toContain('GET');
          expect(headers['Access-Control-Allow-Methods']).toContain('POST');
          expect(headers['Access-Control-Allow-Methods']).toContain('PUT');
          expect(headers['Access-Control-Allow-Methods']).toContain('DELETE');
          expect(headers['Access-Control-Allow-Methods']).toContain('OPTIONS');
          expect(headers['Access-Control-Allow-Headers']).toContain('Content-Type');
          expect(headers['Access-Control-Allow-Headers']).toContain('Authorization');
          expect(headers['Access-Control-Allow-Credentials']).toBe('true');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return production origin for any disallowed origin', () => {
    fc.assert(
      fc.property(
        fc.string().filter(s => !ALLOWED_ORIGINS.includes(s)),
        (origin) => {
          const headers = getCorsHeaders(origin);
          // Should default to production origin
          expect(headers['Access-Control-Allow-Origin']).toBe(ALLOWED_ORIGINS[0]);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return production origin for undefined origin', () => {
    const headers = getCorsHeaders(undefined);
    expect(headers['Access-Control-Allow-Origin']).toBe(ALLOWED_ORIGINS[0]);
  });

  it('should correctly identify allowed origins', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALLOWED_ORIGINS),
        (origin) => {
          expect(isOriginAllowed(origin)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should correctly reject disallowed origins', () => {
    fc.assert(
      fc.property(
        fc.string().filter(s => !ALLOWED_ORIGINS.includes(s) && s.length > 0),
        (origin) => {
          expect(isOriginAllowed(origin)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should always include required CORS headers', () => {
    fc.assert(
      fc.property(
        fc.option(fc.string(), { nil: undefined }),
        (origin) => {
          const headers = getCorsHeaders(origin);
          
          // All required headers must be present
          expect(headers).toHaveProperty('Access-Control-Allow-Origin');
          expect(headers).toHaveProperty('Access-Control-Allow-Methods');
          expect(headers).toHaveProperty('Access-Control-Allow-Headers');
          expect(headers).toHaveProperty('Access-Control-Allow-Credentials');
          expect(headers).toHaveProperty('Access-Control-Max-Age');
          
          // Max-Age should be a valid number string
          expect(parseInt(headers['Access-Control-Max-Age'])).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
