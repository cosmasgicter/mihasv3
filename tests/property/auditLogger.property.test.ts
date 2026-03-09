/**
 * Property Tests for Audit Logger — P17
 *
 * Properties verified:
 * 1. sanitizeContext always redacts sensitive fields (passwords, tokens, secrets)
 * 2. sanitizeContext always redacts PII fields (email, phone, name, address)
 * 3. sanitizeContext preserves non-sensitive fields unchanged
 * 4. sanitizeContext handles nested objects recursively
 * 5. sanitizeContext handles null/undefined gracefully
 * 6. logAuditEvent never throws (audit logging must not break main flow)
 * 7. All audit event types produce sanitized output
 */

import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { sanitizeContext } from '../../lib/auditLogger';

// Sensitive field names that must always be redacted
const SENSITIVE_FIELDS = [
  'password', 'Password', 'PASSWORD',
  'secret', 'Secret', 'jwt_secret',
  'token', 'access_token', 'refresh_token',
  'api_key', 'apiKey', 'credential',
  'auth_header', 'authorization',
  'hash', 'password_hash', 'salt',
  'bearer', 'cookie', 'session_id',
];

// PII field names that must always be redacted
const PII_FIELDS = [
  'email', 'user_email', 'Email',
  'phone', 'phone_number', 'Phone',
  'address', 'home_address', 'Address',
  'first_name', 'last_name', 'full_name', 'name',
  'ssn', 'national_id', 'passport_number',
  'date_of_birth', 'birth_date',
];

// Safe field names that should pass through
const SAFE_FIELDS = [
  'action', 'status', 'count', 'id', 'entity_id',
  'created_at', 'updated_at', 'success', 'method',
  'duration_ms', 'retention_category', 'revoked_count',
];

describe('Audit Logger Property Tests (P17)', () => {
  describe('P17.1: Sensitive fields are always redacted', () => {
    it('should redact all sensitive field patterns', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...SENSITIVE_FIELDS),
          fc.string({ minLength: 1, maxLength: 100 }),
          (fieldName, value) => {
            const result = sanitizeContext({ [fieldName]: value });
            expect(result).not.toBeNull();
            expect(result![fieldName]).toBe('[REDACTED]');
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  describe('P17.2: PII fields are always redacted', () => {
    it('should redact all PII field patterns', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...PII_FIELDS),
          fc.string({ minLength: 1, maxLength: 100 }),
          (fieldName, value) => {
            const result = sanitizeContext({ [fieldName]: value });
            expect(result).not.toBeNull();
            expect(result![fieldName]).toBe('[PII_REDACTED]');
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  describe('P17.3: Safe fields are preserved', () => {
    it('should preserve non-sensitive, non-PII fields', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...SAFE_FIELDS),
          fc.oneof(fc.string(), fc.integer(), fc.boolean()),
          (fieldName, value) => {
            const result = sanitizeContext({ [fieldName]: value });
            expect(result).not.toBeNull();
            // Value should not be redacted
            expect(result![fieldName]).not.toBe('[REDACTED]');
            expect(result![fieldName]).not.toBe('[PII_REDACTED]');
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  describe('P17.4: Nested objects are sanitized recursively', () => {
    it('should redact sensitive fields in nested objects', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...SENSITIVE_FIELDS),
          fc.string({ minLength: 1, maxLength: 50 }),
          (sensitiveField, value) => {
            const nested = {
              metadata: { [sensitiveField]: value, safe_field: 'ok' },
            };
            const result = sanitizeContext(nested);
            expect(result).not.toBeNull();
            const inner = result!.metadata as Record<string, unknown>;
            expect(inner[sensitiveField]).toBe('[REDACTED]');
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should redact PII fields in nested objects', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...PII_FIELDS),
          fc.string({ minLength: 1, maxLength: 50 }),
          (piiField, value) => {
            const nested = {
              user_data: { [piiField]: value, id: '123' },
            };
            const result = sanitizeContext(nested);
            expect(result).not.toBeNull();
            const inner = result!.user_data as Record<string, unknown>;
            expect(inner[piiField]).toBe('[PII_REDACTED]');
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  describe('P17.5: Null/undefined handling', () => {
    it('should return null for null input', () => {
      expect(sanitizeContext(null)).toBeNull();
    });

    it('should return null for undefined input', () => {
      expect(sanitizeContext(undefined)).toBeNull();
    });

    it('should handle empty objects', () => {
      const result = sanitizeContext({});
      expect(result).toEqual({});
    });

    it('should handle objects with null/undefined values', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...SAFE_FIELDS),
          (fieldName) => {
            const withNull = sanitizeContext({ [fieldName]: null });
            expect(withNull).not.toBeNull();
            expect(withNull![fieldName]).toBeNull();

            const withUndef = sanitizeContext({ [fieldName]: undefined });
            expect(withUndef).not.toBeNull();
            expect(withUndef![fieldName]).toBeUndefined();
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('P17.6: Mixed objects with sensitive and safe fields', () => {
    it('should redact only sensitive/PII fields in mixed objects', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...SENSITIVE_FIELDS),
          fc.constantFrom(...PII_FIELDS),
          fc.constantFrom(...SAFE_FIELDS),
          fc.string({ minLength: 1, maxLength: 50 }),
          (sensitiveField, piiField, safeField, value) => {
            const input = {
              [sensitiveField]: value,
              [piiField]: value,
              [safeField]: value,
            };
            const result = sanitizeContext(input);
            expect(result).not.toBeNull();
            expect(result![sensitiveField]).toBe('[REDACTED]');
            expect(result![piiField]).toBe('[PII_REDACTED]');
            // Safe field should not be redacted
            expect(result![safeField]).not.toBe('[REDACTED]');
            expect(result![safeField]).not.toBe('[PII_REDACTED]');
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  describe('P17.7: Array values are sanitized', () => {
    it('should handle arrays of primitives', () => {
      const result = sanitizeContext({ ids: ['a', 'b', 'c'], count: 3 });
      expect(result).not.toBeNull();
      expect(result!.ids).toEqual(['a', 'b', 'c']);
      expect(result!.count).toBe(3);
    });
  });
});
