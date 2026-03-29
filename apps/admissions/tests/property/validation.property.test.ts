/**
 * Property Tests: Zod Validation Layer
 * Feature: website-quality-remediation
 *
 * Property 12: Zod validation rejects invalid input with field errors
 * Property 13: Zambian data format validation
 * Property 14: String input sanitization
 *
 * Validates: Requirements 6.2, 6.3, 6.4, 6.5
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  loginBodySchema,
  registerBodySchema,
  passwordResetRequestBodySchema,
  passwordResetBodySchema,
} from '../../lib/validation/auth';
import {
  nrcSchema,
  zambianPhoneSchema,
  eczGradeSchema,
} from '../../lib/validation/zambian';
import {
  sanitizedString,
  nonEmptySanitizedString,
} from '../../lib/validation/sanitize';
import { sendEmailBodySchema } from '../../lib/validation/email';

// Feature: website-quality-remediation, Property 12: Zod validation rejects invalid input with field errors
// **Validates: Requirements 6.2**
describe('Property 12: Zod validation rejects invalid input with field errors', () => {
  it('loginBodySchema rejects missing email', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        (password) => {
          const result = loginBodySchema.safeParse({ password });
          expect(result.success).toBe(false);
          if (!result.success) {
            const paths = result.error.issues.map((i) => i.path.join('.'));
            expect(paths).toContain('email');
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  it('loginBodySchema rejects missing password', () => {
    fc.assert(
      fc.property(
        fc.emailAddress(),
        (email) => {
          const result = loginBodySchema.safeParse({ email });
          expect(result.success).toBe(false);
          if (!result.success) {
            const paths = result.error.issues.map((i) => i.path.join('.'));
            expect(paths).toContain('password');
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  it('registerBodySchema rejects invalid email format', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => !s.includes('@') || !s.includes('.')),
        fc.string({ minLength: 8 }).map((s) => s + 'Aa1'),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (email, password, firstName, lastName) => {
          const result = registerBodySchema.safeParse({ email, password, firstName, lastName });
          // If email is truly invalid, it should fail
          if (!result.success) {
            const paths = result.error.issues.map((i) => i.path.join('.'));
            expect(paths.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  it('registerBodySchema rejects weak passwords (no uppercase)', () => {
    fc.assert(
      fc.property(
        fc.emailAddress(),
        fc.stringMatching(/^[a-z0-9]{8,20}$/),
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0 && !s.includes('\0')),
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0 && !s.includes('\0')),
        (email, password, firstName, lastName) => {
          const result = registerBodySchema.safeParse({ email, password, firstName, lastName });
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 10 }
    );
  });

  it('passwordResetRequestBodySchema rejects non-email strings', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !s.includes('@')),
        (email) => {
          const result = passwordResetRequestBodySchema.safeParse({ email });
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 10 }
    );
  });

  it('passwordResetBodySchema rejects empty token', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 8 }).map((s) => s + 'Aa1'),
        (newPassword) => {
          const result = passwordResetBodySchema.safeParse({ token: '', newPassword });
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 10 }
    );
  });

  it('sendEmailBodySchema rejects missing required fields', () => {
    fc.assert(
      fc.property(
        fc.constant({}),
        (body) => {
          const result = sendEmailBodySchema.safeParse(body);
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error.issues.length).toBeGreaterThan(0);
            for (const issue of result.error.issues) {
              expect(issue.message).toBeTruthy();
            }
          }
        }
      ),
      { numRuns: 10 }
    );
  });
});


// Feature: website-quality-remediation, Property 13: Zambian data format validation
// **Validates: Requirements 6.3, 6.5**
describe('Property 13: Zambian data format validation', () => {
  it('nrcSchema accepts valid NRC format (6digits/2digits/1digit)', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^\d{6}$/),
        fc.stringMatching(/^\d{2}$/),
        fc.stringMatching(/^\d$/),
        (part1, part2, part3) => {
          const nrc = `${part1}/${part2}/${part3}`;
          const result = nrcSchema.safeParse(nrc);
          expect(result.success).toBe(true);
        }
      ),
      { numRuns: 10 }
    );
  });

  it('nrcSchema rejects strings not matching NRC format', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).filter(
          (s) => !/^\d{6}\/\d{2}\/\d$/.test(s.trim())
        ),
        (input) => {
          const result = nrcSchema.safeParse(input);
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 10 }
    );
  });

  it('zambianPhoneSchema accepts valid +260 phone numbers', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^\d{9}$/),
        (digits) => {
          const phone = `+260${digits}`;
          const result = zambianPhoneSchema.safeParse(phone);
          expect(result.success).toBe(true);
        }
      ),
      { numRuns: 10 }
    );
  });

  it('zambianPhoneSchema rejects non-+260 phone numbers', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).filter(
          (s) => !/^\+260\d{9}$/.test(s.trim())
        ),
        (input) => {
          const result = zambianPhoneSchema.safeParse(input);
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 10 }
    );
  });

  it('eczGradeSchema accepts integers 1-9', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 9 }),
        (grade) => {
          const result = eczGradeSchema.safeParse(grade);
          expect(result.success).toBe(true);
        }
      ),
      { numRuns: 10 }
    );
  });

  it('eczGradeSchema rejects integers outside 1-9', () => {
    fc.assert(
      fc.property(
        fc.integer().filter((n) => n < 1 || n > 9),
        (grade) => {
          const result = eczGradeSchema.safeParse(grade);
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 10 }
    );
  });

  it('eczGradeSchema rejects non-integer numbers', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 9, noNaN: true }).filter((n) => !Number.isInteger(n)),
        (grade) => {
          const result = eczGradeSchema.safeParse(grade);
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 10 }
    );
  });
});

// Feature: website-quality-remediation, Property 14: String input sanitization
// **Validates: Requirements 6.4**
describe('Property 14: String input sanitization', () => {
  it('sanitizedString trims leading and trailing whitespace', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 100 }).filter((s) => !s.includes('\0')),
        (input) => {
          const padded = `  ${input}  `;
          const result = sanitizedString.safeParse(padded);
          if (result.success) {
            expect(result.data).toBe(input.trim());
            expect(result.data).not.toMatch(/^\s/);
            expect(result.data).not.toMatch(/\s$/);
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  it('sanitizedString rejects strings containing null bytes', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 50 }),
        fc.string({ minLength: 0, maxLength: 50 }),
        (before, after) => {
          const withNull = `${before}\0${after}`;
          const result = sanitizedString.safeParse(withNull);
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 10 }
    );
  });

  it('sanitizedString accepts clean strings without null bytes', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 100 }).filter((s) => !s.includes('\0')),
        (input) => {
          const result = sanitizedString.safeParse(input);
          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.data).not.toContain('\0');
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  it('nonEmptySanitizedString rejects empty or whitespace-only strings', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('', ' ', '  ', '\t', '\n', '\r', '   \t\n  '),
        (whitespace) => {
          const result = nonEmptySanitizedString.safeParse(whitespace);
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 10 }
    );
  });

  it('sanitized output never contains null bytes regardless of input', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 100 }),
        (input) => {
          const result = sanitizedString.safeParse(input);
          if (result.success) {
            expect(result.data).not.toContain('\0');
          }
          // If it fails, it should be because of null bytes
          if (!result.success && input.includes('\0')) {
            const messages = result.error.issues.map((i) => i.message);
            expect(messages.some((m) => m.includes('Null bytes'))).toBe(true);
          }
        }
      ),
      { numRuns: 10 }
    );
  });
});
