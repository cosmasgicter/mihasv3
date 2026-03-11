/**
 * Property-Based Tests: API Security Headers Presence (Property 8)
 * Spec: production-readiness-audit
 * Task: 5.4
 *
 * **Property 8: API Security Headers Presence**
 *
 * *For any* API response, the required security headers (CSP, HSTS,
 * X-Content-Type-Options, X-Frame-Options) SHALL be present with correct values.
 *
 * **Validates: Requirements 4.2, 4.3**
 *
 * This test models the security header validation logic as pure functions,
 * reads the actual vercel.json configuration, and verifies the properties
 * hold for arbitrary API endpoint paths.
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

const NUM_RUNS = 10;

// ============================================================================
// Types
// ============================================================================

interface HeaderEntry {
  key: string;
  value: string;
}

interface HeaderBlock {
  source: string;
  headers: HeaderEntry[];
}

interface VercelConfig {
  headers: HeaderBlock[];
}

// ============================================================================
// Required Security Headers Specification
// ============================================================================

/** Minimum required security headers and their validation rules */
const REQUIRED_HEADERS: Record<string, (value: string) => boolean> = {
  'Content-Security-Policy': (v) =>
    v.includes("default-src 'self'") && v.includes("frame-ancestors 'none'"),
  'Strict-Transport-Security': (v) => {
    const match = v.match(/max-age=(\d+)/);
    return !!match && parseInt(match[1], 10) >= 31536000 && v.includes('includeSubDomains');
  },
  'X-Content-Type-Options': (v) => v === 'nosniff',
  'X-Frame-Options': (v) => v === 'DENY',
  'Referrer-Policy': (v) => v === 'strict-origin-when-cross-origin',
  'Permissions-Policy': (v) =>
    v.includes('camera=()') && v.includes('microphone=()') && v.includes('geolocation=()'),
};

// ============================================================================
// Pure Functions Under Test
// ============================================================================

/**
 * Resolves which headers apply to a given request path by matching
 * vercel.json header block source patterns.
 */
function resolveHeadersForPath(
  headerBlocks: HeaderBlock[],
  requestPath: string
): Map<string, string> {
  const resolved = new Map<string, string>();

  for (const block of headerBlocks) {
    if (pathMatchesSource(requestPath, block.source)) {
      for (const h of block.headers) {
        // Later blocks override earlier ones for the same key
        resolved.set(h.key, h.value);
      }
    }
  }

  return resolved;
}

/**
 * Converts a Vercel source pattern to a regex and tests the path.
 * Handles common Vercel patterns: `(.*)`, `:path*`, named groups.
 */
function pathMatchesSource(requestPath: string, source: string): boolean {
  // Convert Vercel source pattern to regex
  let pattern = source
    .replace(/\(\.?\*\)/g, '.*')       // (.*) or (.*) → .*
    .replace(/:[\w]+\*/g, '.*');        // :path* → .*

  // Anchor the pattern
  const regex = new RegExp(`^${pattern}$`);
  return regex.test(requestPath);
}

/**
 * Validates that all required security headers are present and have
 * correct values in the resolved header map.
 */
function validateSecurityHeaders(
  headers: Map<string, string>
): { valid: boolean; missing: string[]; invalid: string[] } {
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const [headerName, validator] of Object.entries(REQUIRED_HEADERS)) {
    const value = headers.get(headerName);
    if (!value) {
      missing.push(headerName);
    } else if (!validator(value)) {
      invalid.push(headerName);
    }
  }

  return {
    valid: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
  };
}

/**
 * Checks that a specific header is non-empty in the resolved map.
 */
function headerIsPresent(headers: Map<string, string>, key: string): boolean {
  const value = headers.get(key);
  return value !== undefined && value.trim().length > 0;
}

// ============================================================================
// Arbitraries
// ============================================================================

/** Known API endpoint paths from vercel.json */
const API_ENDPOINTS = [
  '/api/health',
  '/api/auth',
  '/api/admin',
  '/api/applications',
  '/api/bootstrap',
  '/api/catalog',
  '/api/documents',
  '/api/email',
  '/api/notifications',
  '/api/payments',
  '/api/sessions',
];

/** Arbitrary that generates valid API endpoint paths */
const apiPathArb = fc.oneof(
  // Known endpoints
  fc.constantFrom(...API_ENDPOINTS),
  // Catch-all API paths with random segments
  fc.array(fc.constantFrom('a', 'b', 'c', '1', '2', '-', '_'), { minLength: 1, maxLength: 8 })
    .map((chars) => `/api/${chars.join('')}`)
);

/** Common frontend paths */
const FRONTEND_PATHS = ['/', '/signin', '/signup', '/dashboard', '/settings', '/admin', '/applications', '/payments'];

/** Arbitrary that generates any site path (both API and non-API) */
const anyPathArb = fc.oneof(
  apiPathArb,
  fc.constantFrom(...FRONTEND_PATHS)
);

// ============================================================================
// Tests
// ============================================================================

describe('Feature: production-readiness-audit, Property 8: API Security Headers Presence', () => {
  let vercelConfig: VercelConfig;

  beforeAll(() => {
    const configPath = path.join(process.cwd(), 'vercel.json');
    vercelConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  });

  it('should have a global header block matching all routes', () => {
    const globalBlock = vercelConfig.headers.find((h) => h.source === '/(.*)');
    expect(globalBlock).toBeDefined();
    expect(globalBlock!.headers.length).toBeGreaterThan(0);
  });

  describe('Property: For any API path, all required security headers are present with correct values', () => {
    it('all required headers present for any API endpoint path', () => {
      fc.assert(
        fc.property(apiPathArb, (apiPath) => {
          const headers = resolveHeadersForPath(vercelConfig.headers, apiPath);
          const result = validateSecurityHeaders(headers);

          expect(result.missing).toEqual([]);
          expect(result.invalid).toEqual([]);
          expect(result.valid).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    /**
     * **Validates: Requirements 4.2**
     */
    it('all required headers present for any site path', () => {
      fc.assert(
        fc.property(anyPathArb, (sitePath) => {
          const headers = resolveHeadersForPath(vercelConfig.headers, sitePath);
          const result = validateSecurityHeaders(headers);

          expect(result.missing).toEqual([]);
          expect(result.invalid).toEqual([]);
          expect(result.valid).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Property: No required header can be missing or empty', () => {
    /**
     * **Validates: Requirements 4.3**
     */
    it('every required header is non-empty for any API path', () => {
      const requiredKeys = Object.keys(REQUIRED_HEADERS);

      fc.assert(
        fc.property(
          apiPathArb,
          fc.constantFrom(...requiredKeys),
          (apiPath, headerKey) => {
            const headers = resolveHeadersForPath(vercelConfig.headers, apiPath);
            expect(headerIsPresent(headers, headerKey)).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Property: HSTS max-age meets minimum requirement', () => {
    it('HSTS max-age >= 31536000 for any path', () => {
      fc.assert(
        fc.property(anyPathArb, (sitePath) => {
          const headers = resolveHeadersForPath(vercelConfig.headers, sitePath);
          const hsts = headers.get('Strict-Transport-Security');
          expect(hsts).toBeDefined();

          const match = hsts!.match(/max-age=(\d+)/);
          expect(match).not.toBeNull();
          expect(parseInt(match![1], 10)).toBeGreaterThanOrEqual(31536000);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('HSTS includes includeSubDomains for any path', () => {
      fc.assert(
        fc.property(anyPathArb, (sitePath) => {
          const headers = resolveHeadersForPath(vercelConfig.headers, sitePath);
          const hsts = headers.get('Strict-Transport-Security');
          expect(hsts).toBeDefined();
          expect(hsts).toContain('includeSubDomains');
        }),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Property: CSP restricts default-src and frame-ancestors', () => {
    it('CSP contains default-src self and frame-ancestors none for any path', () => {
      fc.assert(
        fc.property(anyPathArb, (sitePath) => {
          const headers = resolveHeadersForPath(vercelConfig.headers, sitePath);
          const csp = headers.get('Content-Security-Policy');
          expect(csp).toBeDefined();
          expect(csp).toContain("default-src 'self'");
          expect(csp).toContain("frame-ancestors 'none'");
        }),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Property: X-Frame-Options is DENY and X-Content-Type-Options is nosniff', () => {
    it('X-Frame-Options is exactly DENY for any path', () => {
      fc.assert(
        fc.property(anyPathArb, (sitePath) => {
          const headers = resolveHeadersForPath(vercelConfig.headers, sitePath);
          expect(headers.get('X-Frame-Options')).toBe('DENY');
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('X-Content-Type-Options is exactly nosniff for any path', () => {
      fc.assert(
        fc.property(anyPathArb, (sitePath) => {
          const headers = resolveHeadersForPath(vercelConfig.headers, sitePath);
          expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
        }),
        { numRuns: NUM_RUNS }
      );
    });
  });
});
