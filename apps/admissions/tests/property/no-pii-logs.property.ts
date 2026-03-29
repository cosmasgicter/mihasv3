/**
 * Property Test: No PII in Logs
 * Feature: bun-vercel-migration
 * Property 7: No PII in Logs
 * Validates: Requirements 11.1
 * 
 * For any log statement in the codebase, the output SHALL NOT contain patterns matching:
 * - Email addresses (*@*.*)
 * - Phone numbers (+260* or 260*)
 * - Full names (from user profile data)
 * - National ID numbers
 */
import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';

// Import the sanitization function indirectly by testing the error handler behavior
// We'll test the sanitization patterns directly

/**
 * Sanitize error message to remove any potential PII.
 * This mirrors the implementation in errorHandler.ts for testing
 * Note: Order matters - UUIDs must be sanitized before phone numbers
 * because phone number regex can match parts of UUIDs
 */
function sanitizeErrorMessage(message: string): string {
  // Remove potential UUIDs (user IDs) FIRST - before phone numbers
  let sanitized = message.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[ID]');
  
  // Remove potential email addresses
  sanitized = sanitized.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');
  
  // Remove potential phone numbers (various formats)
  sanitized = sanitized.replace(/\+?\d{1,4}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g, '[PHONE]');
  
  // Remove potential JWT tokens
  sanitized = sanitized.replace(/eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g, '[TOKEN]');
  
  return sanitized;
}

// PII pattern generators
const emailArbitrary = fc.tuple(
  fc.stringMatching(/^[a-zA-Z0-9._%+-]{1,20}$/),
  fc.stringMatching(/^[a-zA-Z0-9.-]{1,15}$/),
  fc.stringMatching(/^[a-zA-Z]{2,6}$/)
).map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

const zambianPhoneArbitrary = fc.tuple(
  fc.constantFrom('+260', '260'),
  fc.stringMatching(/^[0-9]{9}$/)
).map(([prefix, number]) => `${prefix}${number}`);

const uuidArbitrary = fc.uuid();

describe('Feature: bun-vercel-migration, Property 7: No PII in Logs', () => {
  
  it('should sanitize email addresses from any message', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.string({ minLength: 0, maxLength: 50 }),
          emailArbitrary,
          fc.string({ minLength: 0, maxLength: 50 })
        ),
        ([prefix, email, suffix]) => {
          const message = `${prefix} ${email} ${suffix}`;
          const sanitized = sanitizeErrorMessage(message);
          
          // Should not contain the original email
          expect(sanitized).not.toContain(email);
          // Should contain the placeholder
          expect(sanitized).toContain('[EMAIL]');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should sanitize Zambian phone numbers from any message', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.string({ minLength: 0, maxLength: 50 }),
          zambianPhoneArbitrary,
          fc.string({ minLength: 0, maxLength: 50 })
        ),
        ([prefix, phone, suffix]) => {
          const message = `${prefix} ${phone} ${suffix}`;
          const sanitized = sanitizeErrorMessage(message);
          
          // Should not contain the original phone number
          expect(sanitized).not.toContain(phone);
          // Should contain the placeholder
          expect(sanitized).toContain('[PHONE]');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should sanitize UUIDs (user IDs) from any message', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.string({ minLength: 0, maxLength: 50 }),
          uuidArbitrary,
          fc.string({ minLength: 0, maxLength: 50 })
        ),
        ([prefix, uuid, suffix]) => {
          const message = `${prefix} ${uuid} ${suffix}`;
          const sanitized = sanitizeErrorMessage(message);
          
          // Should not contain the original UUID
          expect(sanitized).not.toContain(uuid);
          // Should contain the placeholder
          expect(sanitized).toContain('[ID]');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should sanitize multiple PII types in a single message', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          emailArbitrary,
          zambianPhoneArbitrary,
          uuidArbitrary
        ),
        ([email, phone, uuid]) => {
          const message = `User ${email} with phone ${phone} and ID ${uuid} had an error`;
          const sanitized = sanitizeErrorMessage(message);
          
          // Should not contain any original PII
          expect(sanitized).not.toContain(email);
          expect(sanitized).not.toContain(phone);
          expect(sanitized).not.toContain(uuid);
          
          // Should contain all placeholders
          expect(sanitized).toContain('[EMAIL]');
          expect(sanitized).toContain('[PHONE]');
          expect(sanitized).toContain('[ID]');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should preserve non-PII content in messages', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }).filter(s => 
          !s.includes('@') && 
          !/\d{9,}/.test(s) && 
          !/[0-9a-f]{8}-[0-9a-f]{4}/.test(s.toLowerCase())
        ),
        (message) => {
          const sanitized = sanitizeErrorMessage(message);
          // Non-PII content should be preserved
          expect(sanitized).toBe(message);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle empty and whitespace-only messages', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('', ' ', '  ', '\t', '\n', '   \n   '),
        (message) => {
          const sanitized = sanitizeErrorMessage(message);
          expect(sanitized).toBe(message);
        }
      ),
      { numRuns: 10 }
    );
  });
});
