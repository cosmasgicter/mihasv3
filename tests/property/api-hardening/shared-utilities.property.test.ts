// @vitest-environment node
/**
 * Property-based tests for shared utility modules
 * Feature: api-endpoint-hardening
 *
 * Property 16: Security headers are present on all API responses
 * Property 19: Idempotency key scoping prevents cross-user collision
 * Property 20: Idempotency key format validation
 * Property 7: PII is sanitized from error messages
 */
import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { setSecurityHeaders } from '../../../lib/securityHeaders';
import { scopeIdempotencyKey, normalizeIdempotencyKey } from '../../../lib/idempotency';
import { sanitizeError } from '../../../lib/errorHandler';

// ── Helpers ─────────────────────────────────────────────────────────────

/** Create a mock VercelResponse with a setHeader spy */
function createMockResponse() {
  const headers = new Map<string, string>();
  return {
    headers,
    setHeader: vi.fn((name: string, value: string) => {
      headers.set(name, value);
    }),
  };
}

// ── Arbitraries ─────────────────────────────────────────────────────────

const VALID_KEY_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:_-';
const INVALID_KEY_CHARS = ' @#$%^&*()+=!~`[]{}|\\;"\'<>,./?\t\n';

/** Valid idempotency key: alphanumeric + colons, underscores, hyphens, ≤128 chars */
const validKeyArb = fc.string({ minLength: 1, maxLength: 128 })
  .map((s) => s.replace(/[^a-zA-Z0-9:_-]/g, ''))
  .filter((s) => s.length >= 1 && s.length <= 128);

/** Key with only invalid characters */
const invalidCharKeyArb = fc.constantFrom(
  'key with spaces',
  'key@invalid',
  'key#hash',
  'key$dollar',
  'key%percent',
  'key^caret',
  'key&amp',
  'key*star',
  'key(paren)',
  'key+plus',
  'key=equals',
  'key!bang',
  'key~tilde',
  'key[bracket]',
  'key{brace}',
);

/** Key that exceeds 128 chars */
const tooLongKeyArb = fc.string({ minLength: 129, maxLength: 200 })
  .map((s) => {
    // Ensure we have at least 129 valid chars
    let result = s.replace(/[^a-zA-Z0-9]/g, 'a');
    while (result.length < 129) result += 'a';
    return result.slice(0, 200);
  })
  .filter((s) => s.length > 128);

/** Generate random email addresses */
const emailArb = fc.tuple(
  fc.string({ minLength: 3, maxLength: 10 }).map((s) => s.replace(/[^a-z0-9]/g, 'x')).filter((s) => s.length >= 3),
  fc.constantFrom('gmail.com', 'example.com', 'test.org', 'mail.co.zm'),
).map(([local, domain]) => `${local}@${domain}`);

/** Generate random file paths */
const filePathArb = fc.constantFrom(
  '/home/user/secret.txt',
  '/var/log/app.log',
  '/etc/passwd',
  '/usr/local/bin/app',
  '/tmp/upload_12345',
  '/app/config/database.yml',
);

// ── Tests ───────────────────────────────────────────────────────────────

// Feature: api-endpoint-hardening, Property 16: Security headers are present on all API responses
// **Validates: Requirements 8.1, 8.2, 8.3, 8.4**
describe('P16: Security headers are present on all API responses', () => {
  it('sets all 4 required security headers with default values', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const mockRes = createMockResponse();
        setSecurityHeaders(mockRes as any);

        expect(mockRes.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
        expect(mockRes.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
        expect(mockRes.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
        expect(mockRes.setHeader).toHaveBeenCalledWith('Referrer-Policy', 'strict-origin-when-cross-origin');
        expect(mockRes.headers.get('X-Content-Type-Options')).toBe('nosniff');
        expect(mockRes.headers.get('X-Frame-Options')).toBe('DENY');
        expect(mockRes.headers.get('Cache-Control')).toBe('no-store');
        expect(mockRes.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      }),
      { numRuns: 100 },
    );
  });

  it('allows Cache-Control override while keeping other headers', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('public, max-age=300', 'private, no-cache', 'public, max-age=3600', 'no-cache, must-revalidate'),
        (cacheValue: string) => {
          const mockRes = createMockResponse();
          setSecurityHeaders(mockRes as any, { cacheControl: cacheValue });

          expect(mockRes.headers.get('X-Content-Type-Options')).toBe('nosniff');
          expect(mockRes.headers.get('X-Frame-Options')).toBe('DENY');
          expect(mockRes.headers.get('Cache-Control')).toBe(cacheValue);
          expect(mockRes.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: api-endpoint-hardening, Property 19: Idempotency key scoping prevents cross-user collision
// **Validates: Requirements 10.4**
describe('P19: Idempotency key scoping prevents cross-user collision', () => {
  it('produces different scoped keys for distinct users with the same endpoint and key', () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.uuid(), fc.uuid()).filter(([a, b]) => a !== b),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        ([userA, userB]: [string, string], endpoint: string, key: string) => {
          const scopedA = scopeIdempotencyKey(userA, endpoint, key);
          const scopedB = scopeIdempotencyKey(userB, endpoint, key);
          expect(scopedA).not.toBe(scopedB);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: api-endpoint-hardening, Property 20: Idempotency key format validation
// **Validates: Requirements 10.5**
describe('P20: Idempotency key format validation', () => {
  it('returns the key for valid format strings', () => {
    fc.assert(
      fc.property(validKeyArb, (key: string) => {
        const result = normalizeIdempotencyKey(key);
        expect(result).toBe(key);
      }),
      { numRuns: 100 },
    );
  });

  it('returns empty string for keys with invalid characters', () => {
    fc.assert(
      fc.property(invalidCharKeyArb, (key: string) => {
        const result = normalizeIdempotencyKey(key);
        expect(result).toBe('');
      }),
      { numRuns: 100 },
    );
  });

  it('returns empty string for keys exceeding 128 characters', () => {
    fc.assert(
      fc.property(tooLongKeyArb, (key: string) => {
        const result = normalizeIdempotencyKey(key);
        expect(result).toBe('');
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: api-endpoint-hardening, Property 7: PII is sanitized from error messages
// **Validates: Requirements 4.4**
describe('P7: PII is sanitized from error messages', () => {
  it('sanitizes embedded email addresses from error messages', () => {
    fc.assert(
      fc.property(emailArb, (email: string) => {
        const message = `User ${email} not found in database`;
        const sanitized = sanitizeError(message);
        expect(sanitized).not.toContain(email);
        expect(sanitized).toContain('[EMAIL]');
      }),
      { numRuns: 100 },
    );
  });

  it('sanitizes embedded UUIDs from error messages', () => {
    fc.assert(
      fc.property(fc.uuid(), (uuid: string) => {
        const message = `Record ${uuid} could not be updated`;
        const sanitized = sanitizeError(message);
        expect(sanitized).not.toContain(uuid);
        expect(sanitized).toContain('[ID]');
      }),
      { numRuns: 100 },
    );
  });

  it('sanitizes embedded file paths from error messages', () => {
    fc.assert(
      fc.property(filePathArb, (filePath: string) => {
        const message = `Failed to read file at ${filePath}`;
        const sanitized = sanitizeError(message);
        expect(sanitized).not.toContain(filePath);
        expect(sanitized).toContain('[PATH]');
      }),
      { numRuns: 100 },
    );
  });
});
