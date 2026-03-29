// @vitest-environment node
/**
 * Property-based tests for log sanitization
 * Feature: api-endpoint-hardening
 *
 * Property 22: Blocked request logs contain no PII
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { sanitizeError } from '../../../lib/errorHandler';

// ── Arbitraries ─────────────────────────────────────────────────────────

/** Generate realistic email addresses (alphanumeric local parts that match sanitizeError's regex) */
const realisticEmailArb = fc.tuple(
  fc.string({ minLength: 3, maxLength: 12 }).map((s) => s.replace(/[^a-zA-Z0-9._%+-]/g, 'x')).filter((s) => /^[a-zA-Z0-9]/.test(s) && s.length >= 3),
  fc.constantFrom('gmail.com', 'example.com', 'test.org', 'mail.co.zm', 'yahoo.co.uk', 'mihas.edu.zm'),
).map(([local, domain]) => `${local}@${domain}`);

/** Generate random surrounding text to embed PII within */
const surroundingTextArb = fc.constantFrom(
  'Request blocked for user ',
  'Access denied: ',
  'Rate limited request from ',
  'CSRF validation failed for ',
  'Authentication failed: ',
  'Blocked suspicious request containing ',
  'Security violation detected for ',
  'Invalid session from ',
);

/** Generate random trailing text */
const trailingTextArb = fc.constantFrom(
  ' was blocked by security policy',
  ' - request denied',
  ' at endpoint /api/admin',
  ' during authentication',
  ' while processing request',
  '',
);

/** Generate Zambian-format phone numbers: +260XXXXXXXXX (13 digits total) */
const zambianPhoneArb = fc.tuple(
  fc.integer({ min: 100, max: 999 }),
  fc.integer({ min: 100, max: 999 }),
  fc.integer({ min: 1000, max: 9999 }),
).map(([a, b, c]) => `+260${a}${b}${c}`);

// ── Tests ───────────────────────────────────────────────────────────────

// Feature: api-endpoint-hardening, Property 22: Blocked request logs contain no PII
// **Validates: Requirements 12.4**
describe('P22: Blocked request logs contain no PII', () => {
  it('sanitizes email addresses embedded in log messages', () => {
    fc.assert(
      fc.property(
        surroundingTextArb,
        realisticEmailArb,
        trailingTextArb,
        (prefix: string, email: string, suffix: string) => {
          const logMessage = `${prefix}${email}${suffix}`;
          const sanitized = sanitizeError(logMessage);

          // The original email must not appear in the sanitized output
          expect(sanitized).not.toContain(email);
          // A placeholder should be present
          expect(sanitized).toContain('[EMAIL]');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('sanitizes IP addresses embedded in log messages', () => {
    fc.assert(
      fc.property(
        surroundingTextArb,
        fc.ipV4(),
        trailingTextArb,
        (prefix: string, ip: string, suffix: string) => {
          const logMessage = `${prefix}${ip}${suffix}`;
          const sanitized = sanitizeError(logMessage);

          // The original IP must not appear in the sanitized output
          expect(sanitized).not.toContain(ip);
          // A placeholder should be present
          expect(sanitized).toContain('[IP]');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('sanitizes phone numbers embedded in log messages', () => {
    fc.assert(
      fc.property(
        surroundingTextArb,
        zambianPhoneArb,
        trailingTextArb,
        (prefix: string, phone: string, suffix: string) => {
          const logMessage = `${prefix}${phone}${suffix}`;
          const sanitized = sanitizeError(logMessage);

          // The original phone number must not appear in the sanitized output
          expect(sanitized).not.toContain(phone);
          // A placeholder should be present
          expect(sanitized).toContain('[PHONE]');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('sanitizes multiple PII types in a single log message', () => {
    fc.assert(
      fc.property(
        realisticEmailArb,
        fc.ipV4(),
        zambianPhoneArb,
        (email: string, ip: string, phone: string) => {
          const logMessage = `Blocked request from ${ip} for user ${email} with phone ${phone}`;
          const sanitized = sanitizeError(logMessage);

          // None of the original PII should remain
          expect(sanitized).not.toContain(email);
          expect(sanitized).not.toContain(ip);
          expect(sanitized).not.toContain(phone);

          // Placeholders should be present
          expect(sanitized).toContain('[EMAIL]');
          expect(sanitized).toContain('[IP]');
          expect(sanitized).toContain('[PHONE]');
        },
      ),
      { numRuns: 100 },
    );
  });
});
