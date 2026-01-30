/**
 * Property Test: JWT Base64 URL-Safe Decoding Round-Trip
 * Feature: bun-vercel-runtime-forensics
 * Property 1: JWT Base64 URL-Safe Decoding Round-Trip
 * 
 * **Validates: Requirements 3.1, 3.4**
 * - 3.1: WHEN decoding JWT tokens, THE Auth_System SHALL use Bun-compatible Base64 decoding
 * - 3.4: THE Auth_System SHALL handle URL-safe Base64 encoding correctly (replacing `-` with `+` and `_` with `/`)
 * 
 * For any valid JWT payload object, encoding it to Base64 URL-safe format and then decoding it
 * using the Bun-safe decoder SHALL produce an equivalent object.
 * 
 * Test Strategy:
 * - Generate random JWT payload objects with various field types
 * - Encode using standard JWT Base64 URL-safe encoding
 * - Decode using the new `decodeBase64Url()` function
 * - Verify the decoded payload matches the original
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { decodeBase64Url, encodeBase64Url } from '../../api/_lib/base64';

/**
 * Generate a realistic JWT payload with various field types
 */
const jwtPayloadArbitrary = fc.record({
  // Standard JWT claims
  sub: fc.uuid(),
  email: fc.emailAddress(),
  exp: fc.integer({ min: Math.floor(Date.now() / 1000), max: Math.floor(Date.now() / 1000) + 86400 * 365 }),
  iat: fc.integer({ min: Math.floor(Date.now() / 1000) - 86400 * 365, max: Math.floor(Date.now() / 1000) }),
  aud: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  iss: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  
  // User role (common in Supabase)
  role: fc.constantFrom('authenticated', 'anon', 'service_role', 'admin', 'student', 'super_admin'),
  
  // User metadata (nested object)
  user_metadata: fc.option(
    fc.record({
      full_name: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
      phone: fc.option(fc.stringMatching(/^\+260[0-9]{9}$/), { nil: undefined }),
      avatar_url: fc.option(fc.webUrl(), { nil: undefined }),
    }),
    { nil: undefined }
  ),
  
  // App metadata (nested object)
  app_metadata: fc.option(
    fc.record({
      role: fc.option(fc.constantFrom('admin', 'student', 'super_admin'), { nil: undefined }),
      roles: fc.option(fc.array(fc.constantFrom('admin', 'student', 'super_admin'), { minLength: 0, maxLength: 3 }), { nil: undefined }),
      provider: fc.option(fc.constantFrom('email', 'google', 'github'), { nil: undefined }),
    }),
    { nil: undefined }
  ),
});

/**
 * Generate strings with various character types including Unicode
 * Using only constant values for Unicode since fc.unicodeString may not be available
 */
const unicodeStringArbitrary = fc.oneof(
  fc.string({ minLength: 0, maxLength: 100 }),
  // Specific Unicode test cases that cover various scripts and emoji
  fc.constant('Hello, 世界!'),
  fc.constant('Привет мир'),
  fc.constant('مرحبا بالعالم'),
  fc.constant('🎉🚀💻'),
  fc.constant('Ñoño español'),
  fc.constant('Cześć świat'),
  fc.constant('Zambian: Muli shani?'),
  fc.constant('日本語テスト'),
  fc.constant('한국어 테스트'),
  fc.constant('Ελληνικά'),
  fc.constant('עברית'),
  fc.constant('ไทย'),
  fc.constant('Mixed: Hello 世界 🌍'),
);

/**
 * Generate strings with special characters that might cause Base64 issues
 */
const specialCharStringArbitrary = fc.oneof(
  fc.constant('test+value/with=special'),
  fc.constant('data-with_url-safe_chars'),
  fc.constant('padding===test'),
  fc.constant('newline\ntest'),
  fc.constant('tab\ttest'),
  fc.constant('quote"test'),
  fc.constant("apostrophe'test"),
  fc.constant('backslash\\test'),
  fc.constant('null\x00test'),
);

/**
 * Clean undefined values from an object for comparison
 */
function cleanUndefined(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(cleanUndefined);
  }
  if (typeof obj === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (value !== undefined) {
        cleaned[key] = cleanUndefined(value);
      }
    }
    return cleaned;
  }
  return obj;
}

describe('Feature: bun-vercel-runtime-forensics, Property 1: JWT Base64 URL-Safe Decoding Round-Trip', () => {
  
  describe('Property: Encoding then decoding produces equivalent object (Requirements 3.1, 3.4)', () => {
    
    it('should round-trip any valid JWT payload object', () => {
      fc.assert(
        fc.property(
          jwtPayloadArbitrary,
          (payload) => {
            // Clean undefined values for consistent comparison
            const cleanedPayload = cleanUndefined(payload);
            
            // Encode the payload to JSON string
            const jsonString = JSON.stringify(cleanedPayload);
            
            // Encode to Base64 URL-safe format
            const encoded = encodeBase64Url(jsonString);
            
            // Decode back using Bun-safe decoder
            const decoded = decodeBase64Url(encoded);
            
            // Parse the decoded JSON
            const parsedPayload = JSON.parse(decoded);
            
            // Verify the round-trip produces equivalent object
            expect(parsedPayload).toEqual(cleanedPayload);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should round-trip any arbitrary JSON object', () => {
      fc.assert(
        fc.property(
          // Filter out -0 values since JSON.stringify converts -0 to 0
          fc.jsonValue().filter(value => {
            // Recursively check for -0 values
            const hasNegativeZero = (v: unknown): boolean => {
              if (typeof v === 'number' && Object.is(v, -0)) return true;
              if (Array.isArray(v)) return v.some(hasNegativeZero);
              if (v && typeof v === 'object') {
                return Object.values(v).some(hasNegativeZero);
              }
              return false;
            };
            return !hasNegativeZero(value);
          }),
          (value) => {
            // Encode the value to JSON string
            const jsonString = JSON.stringify(value);
            
            // Encode to Base64 URL-safe format
            const encoded = encodeBase64Url(jsonString);
            
            // Decode back using Bun-safe decoder
            const decoded = decodeBase64Url(encoded);
            
            // Parse the decoded JSON
            const parsedValue = JSON.parse(decoded);
            
            // Verify the round-trip produces equivalent value
            expect(parsedValue).toEqual(value);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should round-trip strings with Unicode characters', () => {
      fc.assert(
        fc.property(
          unicodeStringArbitrary,
          (text) => {
            // Encode to Base64 URL-safe format
            const encoded = encodeBase64Url(text);
            
            // Decode back using Bun-safe decoder
            const decoded = decodeBase64Url(encoded);
            
            // Verify the round-trip produces equivalent string
            expect(decoded).toBe(text);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should round-trip strings with special characters', () => {
      fc.assert(
        fc.property(
          specialCharStringArbitrary,
          (text) => {
            // Encode to Base64 URL-safe format
            const encoded = encodeBase64Url(text);
            
            // Decode back using Bun-safe decoder
            const decoded = decodeBase64Url(encoded);
            
            // Verify the round-trip produces equivalent string
            expect(decoded).toBe(text);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property: URL-safe Base64 encoding is correctly handled (Requirement 3.4)', () => {
    
    it('should produce URL-safe encoded strings (no +, /, or = characters)', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }),
          (text) => {
            const encoded = encodeBase64Url(text);
            
            // URL-safe Base64 should not contain +, /, or trailing =
            expect(encoded).not.toContain('+');
            expect(encoded).not.toContain('/');
            expect(encoded).not.toMatch(/=+$/);
            
            // Should only contain URL-safe characters
            expect(encoded).toMatch(/^[A-Za-z0-9_-]*$/);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly decode strings that would have + and / in standard Base64', () => {
      fc.assert(
        fc.property(
          // Generate strings that are likely to produce + and / in standard Base64
          fc.uint8Array({ minLength: 1, maxLength: 100 }),
          (bytes) => {
            // Convert bytes to string
            const text = new TextDecoder().decode(bytes);
            
            // Encode to URL-safe Base64
            const encoded = encodeBase64Url(text);
            
            // Decode back
            const decoded = decodeBase64Url(encoded);
            
            // Should match original
            expect(decoded).toBe(text);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle various padding scenarios correctly', () => {
      // Test strings of different lengths that produce different padding requirements
      const paddingTestCases = fc.constantFrom(
        'a',      // 1 byte -> 2 chars + 2 padding
        'ab',     // 2 bytes -> 3 chars + 1 padding
        'abc',    // 3 bytes -> 4 chars + 0 padding
        'abcd',   // 4 bytes -> 6 chars + 2 padding
        'abcde',  // 5 bytes -> 7 chars + 1 padding
        'abcdef', // 6 bytes -> 8 chars + 0 padding
      );

      fc.assert(
        fc.property(
          paddingTestCases,
          (text) => {
            const encoded = encodeBase64Url(text);
            const decoded = decodeBase64Url(encoded);
            
            expect(decoded).toBe(text);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property: Empty and edge case inputs are handled correctly', () => {
    
    it('should handle empty string', () => {
      const encoded = encodeBase64Url('');
      const decoded = decodeBase64Url(encoded);
      
      expect(decoded).toBe('');
    });

    it('should handle empty string decoding directly', () => {
      const decoded = decodeBase64Url('');
      
      expect(decoded).toBe('');
    });

    it('should round-trip single characters', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 1 }),
          (char) => {
            const encoded = encodeBase64Url(char);
            const decoded = decodeBase64Url(encoded);
            
            expect(decoded).toBe(char);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should round-trip very long strings', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1000, maxLength: 5000 }),
          (text) => {
            const encoded = encodeBase64Url(text);
            const decoded = decodeBase64Url(encoded);
            
            expect(decoded).toBe(text);
          }
        ),
        { numRuns: 20 } // Fewer runs for long strings
      );
    });
  });

  describe('Property: JWT-specific payload structures are preserved', () => {
    
    it('should preserve nested user_metadata objects', () => {
      fc.assert(
        fc.property(
          fc.record({
            sub: fc.uuid(),
            user_metadata: fc.record({
              full_name: fc.string({ minLength: 1, maxLength: 50 }),
              phone: fc.stringMatching(/^\+260[0-9]{9}$/),
              preferences: fc.record({
                theme: fc.constantFrom('light', 'dark'),
                language: fc.constantFrom('en', 'fr', 'es'),
              }),
            }),
          }),
          (payload) => {
            const jsonString = JSON.stringify(payload);
            const encoded = encodeBase64Url(jsonString);
            const decoded = decodeBase64Url(encoded);
            const parsedPayload = JSON.parse(decoded);
            
            expect(parsedPayload).toEqual(payload);
            expect(parsedPayload.user_metadata.full_name).toBe(payload.user_metadata.full_name);
            expect(parsedPayload.user_metadata.phone).toBe(payload.user_metadata.phone);
            expect(parsedPayload.user_metadata.preferences).toEqual(payload.user_metadata.preferences);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve arrays in app_metadata.roles', () => {
      fc.assert(
        fc.property(
          fc.record({
            sub: fc.uuid(),
            app_metadata: fc.record({
              roles: fc.array(fc.constantFrom('admin', 'student', 'super_admin', 'reviewer'), { minLength: 1, maxLength: 5 }),
            }),
          }),
          (payload) => {
            const jsonString = JSON.stringify(payload);
            const encoded = encodeBase64Url(jsonString);
            const decoded = decodeBase64Url(encoded);
            const parsedPayload = JSON.parse(decoded);
            
            expect(parsedPayload).toEqual(payload);
            expect(Array.isArray(parsedPayload.app_metadata.roles)).toBe(true);
            expect(parsedPayload.app_metadata.roles).toEqual(payload.app_metadata.roles);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve numeric timestamps (exp, iat)', () => {
      fc.assert(
        fc.property(
          fc.record({
            sub: fc.uuid(),
            exp: fc.integer({ min: 0, max: 2147483647 }),
            iat: fc.integer({ min: 0, max: 2147483647 }),
            nbf: fc.option(fc.integer({ min: 0, max: 2147483647 }), { nil: undefined }),
          }),
          (payload) => {
            const cleanedPayload = cleanUndefined(payload);
            const jsonString = JSON.stringify(cleanedPayload);
            const encoded = encodeBase64Url(jsonString);
            const decoded = decodeBase64Url(encoded);
            const parsedPayload = JSON.parse(decoded);
            
            expect(parsedPayload).toEqual(cleanedPayload);
            expect(typeof parsedPayload.exp).toBe('number');
            expect(typeof parsedPayload.iat).toBe('number');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve email addresses with special characters', () => {
      fc.assert(
        fc.property(
          fc.record({
            sub: fc.uuid(),
            email: fc.emailAddress(),
          }),
          (payload) => {
            const jsonString = JSON.stringify(payload);
            const encoded = encodeBase64Url(jsonString);
            const decoded = decodeBase64Url(encoded);
            const parsedPayload = JSON.parse(decoded);
            
            expect(parsedPayload.email).toBe(payload.email);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property: Decoding is idempotent when re-encoded', () => {
    
    it('should produce same encoded output for same input', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }),
          (text) => {
            const encoded1 = encodeBase64Url(text);
            const encoded2 = encodeBase64Url(text);
            
            expect(encoded1).toBe(encoded2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should produce same decoded output for same input', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }),
          (text) => {
            const encoded = encodeBase64Url(text);
            const decoded1 = decodeBase64Url(encoded);
            const decoded2 = decodeBase64Url(encoded);
            
            expect(decoded1).toBe(decoded2);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
