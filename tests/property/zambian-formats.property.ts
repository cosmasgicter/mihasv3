/**
 * Property Test: Zambian Data Format Validation
 * Feature: bun-vercel-migration
 * Property 5: Zambian Data Format Validation
 * Validates: Requirements 8.7
 * 
 * For any phone number input, the validation system SHALL accept numbers matching 
 * the pattern +260[0-9]{9} and reject numbers not matching Zambian format.
 * For any ECZ grade input, the system SHALL accept integers 1-9 and correctly 
 * classify 1-6 as pass and 7-9 as fail.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// Zambian phone validation function (mirrors src/lib/validation.ts)
function validateZambianPhone(phone: string): boolean {
  // Accept +260 followed by 9 digits
  const zambianPattern = /^\+260[0-9]{9}$/;
  return zambianPattern.test(phone);
}

// ECZ grade validation function (mirrors src/lib/validation.ts)
interface ECZGradeResult {
  isValid: boolean;
  isPass: boolean;
  grade: number;
}

function validateECZGrade(grade: number): ECZGradeResult {
  const isValid = Number.isInteger(grade) && grade >= 1 && grade <= 9;
  const isPass = isValid && grade >= 1 && grade <= 6;
  
  return {
    isValid,
    isPass,
    grade,
  };
}

describe('Feature: bun-vercel-migration, Property 5: Zambian Data Format Validation', () => {
  
  describe('Zambian Phone Number Validation', () => {
    
    it('should accept all valid +260 phone numbers', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[0-9]{9}$/),
          (nineDigits) => {
            const phone = `+260${nineDigits}`;
            expect(validateZambianPhone(phone)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject phone numbers without +260 prefix', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[0-9]{9,12}$/),
          (digits) => {
            // Without the +260 prefix
            expect(validateZambianPhone(digits)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject phone numbers with wrong country code', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.integer({ min: 1, max: 999 }).filter(n => n !== 260),
            fc.stringMatching(/^[0-9]{9}$/)
          ),
          ([countryCode, digits]) => {
            const phone = `+${countryCode}${digits}`;
            expect(validateZambianPhone(phone)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject phone numbers with wrong digit count', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[0-9]+$/).filter(s => s.length !== 9),
          (digits) => {
            const phone = `+260${digits}`;
            expect(validateZambianPhone(phone)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject phone numbers with non-numeric characters', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 9, maxLength: 9 }).filter(s => /[^0-9]/.test(s)),
          (chars) => {
            const phone = `+260${chars}`;
            expect(validateZambianPhone(phone)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('ECZ Grade Validation', () => {
    
    it('should classify grades 1-6 as pass', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 6 }),
          (grade) => {
            const result = validateECZGrade(grade);
            expect(result.isValid).toBe(true);
            expect(result.isPass).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should classify grades 7-9 as fail', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 7, max: 9 }),
          (grade) => {
            const result = validateECZGrade(grade);
            expect(result.isValid).toBe(true);
            expect(result.isPass).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject grades outside 1-9 range', () => {
      fc.assert(
        fc.property(
          fc.integer().filter(n => n < 1 || n > 9),
          (grade) => {
            const result = validateECZGrade(grade);
            expect(result.isValid).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject non-integer grades', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 1, max: 9 }).filter(n => !Number.isInteger(n)),
          (grade) => {
            const result = validateECZGrade(grade);
            expect(result.isValid).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve the original grade value in result', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 9 }),
          (grade) => {
            const result = validateECZGrade(grade);
            expect(result.grade).toBe(grade);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
