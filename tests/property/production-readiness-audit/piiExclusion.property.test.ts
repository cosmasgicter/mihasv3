// @vitest-environment node
/**
 * Property 17: PII Exclusion from Logs
 *
 * Feature: production-readiness-audit
 * **Validates: Requirements 4.9, 10.6**
 *
 * For any log entry (error logs, audit trails, analytics), the content
 * SHALL NOT contain PII patterns (email addresses, phone numbers,
 * national IDs, names in certain contexts).
 *
 * This test covers the full logging pipeline — both sanitizeContext
 * (audit logger) and sanitizeError (error handler) — with
 * Zambian-specific PII formats.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { sanitizeContext } from '../../../lib/auditLogger';
import { sanitizeError } from '../../../lib/errorHandler';

// ---------------------------------------------------------------------------
// Generators for Zambian-specific PII
// ---------------------------------------------------------------------------

/** Zambian phone: +260 9XX XXX XXX or +260 7XX XXX XXX */
const zambianPhoneArb = fc
  .tuple(
    fc.constantFrom('9', '7'),
    fc.array(fc.constantFrom('0','1','2','3','4','5','6','7','8','9'), { minLength: 8, maxLength: 8 })
  )
  .map(([prefix, digits]) => `+260${prefix}${digits.join('')}`);

/** Email addresses */
const emailArb = fc
  .tuple(
    fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 3, maxLength: 10 }),
    fc.constantFrom('gmail.com', 'yahoo.com', 'mihas.edu.zm', 'outlook.com')
  )
  .map(([local, domain]) => `${local.join('')}@${domain}`);

/** Zambian NRC: 123456/78/1 */
const nrcArb = fc
  .tuple(
    fc.array(fc.constantFrom(...'0123456789'.split('')), { minLength: 6, maxLength: 6 }),
    fc.array(fc.constantFrom(...'0123456789'.split('')), { minLength: 2, maxLength: 2 }),
    fc.constantFrom('1', '2')
  )
  .map(([a, b, c]) => `${a.join('')}/${b.join('')}/${c}`);

/** Human names (first + last) */
const nameArb = fc
  .tuple(
    fc.constantFrom('Mwamba', 'Chanda', 'Bwalya', 'Mutale', 'Tembo', 'Banda', 'Phiri'),
    fc.constantFrom('Mulenga', 'Zulu', 'Ngosa', 'Sakala', 'Lungu', 'Daka', 'Mumba')
  )
  .map(([first, last]) => `${first} ${last}`);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Regex patterns that should never appear in sanitized output */
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const ZAMBIAN_PHONE_RE = /\+260\d{9}/;

/**
 * Check that a string does not contain raw email addresses.
 * Replacement tokens like [EMAIL] are allowed.
 */
function containsRawEmail(s: string): boolean {
  return EMAIL_RE.test(s.replace(/\[EMAIL\]/g, ''));
}

/**
 * Check that a string does not contain raw Zambian phone numbers.
 * Replacement tokens like [PHONE] are allowed.
 */
function containsRawZambianPhone(s: string): boolean {
  return ZAMBIAN_PHONE_RE.test(s.replace(/\[PHONE\]/g, ''));
}

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Property 17: PII Exclusion from Logs', () => {
  // -----------------------------------------------------------------------
  // sanitizeError — string-level PII scrubbing
  // -----------------------------------------------------------------------
  describe('sanitizeError strips PII from arbitrary error messages', () => {
    it('removes email addresses embedded in error strings', () => {
      fc.assert(
        fc.property(emailArb, (email) => {
          const msg = `Failed to process request for ${email} due to timeout`;
          const sanitized = sanitizeError(msg);
          expect(containsRawEmail(sanitized)).toBe(false);
        }),
        { numRuns: 10 }
      );
    });

    it('removes Zambian phone numbers from error strings', () => {
      fc.assert(
        fc.property(zambianPhoneArb, (phone) => {
          const msg = `SMS delivery failed for ${phone}`;
          const sanitized = sanitizeError(msg);
          expect(containsRawZambianPhone(sanitized)).toBe(false);
        }),
        { numRuns: 10 }
      );
    });

    it('removes names in user/profile/account patterns', () => {
      fc.assert(
        fc.property(nameArb, (name) => {
          const msg = `User ${name} not found in database`;
          const sanitized = sanitizeError(msg);
          expect(sanitized).not.toContain(name);
        }),
        { numRuns: 10 }
      );
    });
  });

  // -----------------------------------------------------------------------
  // sanitizeContext — field-level PII redaction for audit logs
  // -----------------------------------------------------------------------
  describe('sanitizeContext redacts PII fields regardless of value', () => {
    it('redacts email fields containing Zambian emails', () => {
      fc.assert(
        fc.property(emailArb, (email) => {
          const result = sanitizeContext({ email, action: 'test' });
          expect(result).not.toBeNull();
          expect(result!.email).toBe('[PII_REDACTED]');
          expect(result!.action).toBe('test');
        }),
        { numRuns: 10 }
      );
    });

    it('redacts phone fields containing Zambian numbers', () => {
      fc.assert(
        fc.property(zambianPhoneArb, (phone) => {
          const result = sanitizeContext({ phone, status: 'active' });
          expect(result).not.toBeNull();
          expect(result!.phone).toBe('[PII_REDACTED]');
        }),
        { numRuns: 10 }
      );
    });

    it('redacts national_id fields containing NRC numbers', () => {
      fc.assert(
        fc.property(nrcArb, (nrc) => {
          const result = sanitizeContext({ national_id: nrc, entity_type: 'user' });
          expect(result).not.toBeNull();
          expect(result!.national_id).toBe('[PII_REDACTED]');
        }),
        { numRuns: 10 }
      );
    });

    it('redacts name-related fields', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('first_name', 'last_name', 'full_name', 'name'),
          nameArb,
          (field, name) => {
            const result = sanitizeContext({ [field]: name, id: 'abc' });
            expect(result).not.toBeNull();
            expect(result![field]).toBe('[PII_REDACTED]');
          }
        ),
        { numRuns: 10 }
      );
    });

    it('redacts passport and birth fields', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('passport', 'passport_number', 'date_of_birth', 'birth_date'),
          fc.string({ minLength: 1, maxLength: 20 }),
          (field, value) => {
            const result = sanitizeContext({ [field]: value, status: 'ok' });
            expect(result).not.toBeNull();
            expect(result![field]).toBe('[PII_REDACTED]');
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  // -----------------------------------------------------------------------
  // Full pipeline: PII in string values inside context objects
  // -----------------------------------------------------------------------
  describe('sanitizeContext scrubs PII from string values via sanitizeError', () => {
    it('scrubs emails embedded in non-PII field values', () => {
      fc.assert(
        fc.property(emailArb, (email) => {
          const result = sanitizeContext({
            error_message: `Login failed for ${email}`,
            status: 'error',
          });
          expect(result).not.toBeNull();
          const msg = result!.error_message as string;
          expect(containsRawEmail(msg)).toBe(false);
        }),
        { numRuns: 10 }
      );
    });

    it('scrubs Zambian phones embedded in non-PII field values', () => {
      fc.assert(
        fc.property(zambianPhoneArb, (phone) => {
          const result = sanitizeContext({
            details: `Notification failed for ${phone}`,
            action: 'send_sms',
          });
          expect(result).not.toBeNull();
          const details = result!.details as string;
          expect(containsRawZambianPhone(details)).toBe(false);
        }),
        { numRuns: 10 }
      );
    });
  });

  // -----------------------------------------------------------------------
  // Combined: multiple PII types in one context
  // -----------------------------------------------------------------------
  describe('sanitizeContext handles mixed PII in a single context', () => {
    it('redacts all PII types simultaneously', () => {
      fc.assert(
        fc.property(
          emailArb,
          zambianPhoneArb,
          nrcArb,
          nameArb,
          (email, phone, nrc, name) => {
            const input = {
              email,
              phone,
              national_id: nrc,
              first_name: name.split(' ')[0],
              last_name: name.split(' ')[1],
              error_message: `User ${email} with phone ${phone}`,
              action: 'audit_test',
              entity_id: 'test-123',
            };
            const result = sanitizeContext(input);
            expect(result).not.toBeNull();

            // Field-level redaction
            expect(result!.email).toBe('[PII_REDACTED]');
            expect(result!.phone).toBe('[PII_REDACTED]');
            expect(result!.national_id).toBe('[PII_REDACTED]');
            expect(result!.first_name).toBe('[PII_REDACTED]');
            expect(result!.last_name).toBe('[PII_REDACTED]');

            // Value-level scrubbing in non-PII fields
            const errMsg = result!.error_message as string;
            expect(containsRawEmail(errMsg)).toBe(false);
            expect(containsRawZambianPhone(errMsg)).toBe(false);

            // Safe fields preserved
            expect(result!.action).toBe('audit_test');
            expect(result!.entity_id).toBe('test-123');
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});
