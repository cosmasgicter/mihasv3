/**
 * Unit Tests: decodeBase64Url Utility Function
 * Feature: bun-vercel-runtime-forensics
 * Task: 1.1 Create decodeBase64Url utility function
 * 
 * Tests the Bun-compatible Base64 URL-safe decoding function.
 * 
 * **Validates: Requirements 3.1, 3.4**
 * - 3.1: WHEN decoding JWT tokens, THE Auth_System SHALL use Bun-compatible Base64 decoding
 * - 3.4: THE Auth_System SHALL handle URL-safe Base64 encoding correctly (replacing `-` with `+` and `_` with `/`)
 */
import { describe, it, expect } from 'vitest';
import { decodeBase64Url, encodeBase64Url } from '../../../api/_lib/base64';

describe('Feature: bun-vercel-runtime-forensics, decodeBase64Url', () => {
  describe('Basic Decoding (Requirement 3.1)', () => {
    it('should decode a simple Base64 URL-safe string', () => {
      // "Hello" in Base64 URL-safe
      const encoded = 'SGVsbG8';
      const result = decodeBase64Url(encoded);
      expect(result).toBe('Hello');
    });

    it('should decode a JSON payload (typical JWT payload)', () => {
      // {"sub":"1234567890"} in Base64 URL-safe
      const encoded = 'eyJzdWIiOiIxMjM0NTY3ODkwIn0';
      const result = decodeBase64Url(encoded);
      expect(result).toBe('{"sub":"1234567890"}');
    });

    it('should decode a complex JWT payload with multiple fields', () => {
      // {"sub":"user123","email":"test@example.com","exp":1234567890}
      const payload = { sub: 'user123', email: 'test@example.com', exp: 1234567890 };
      const encoded = btoa(JSON.stringify(payload))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      
      const result = decodeBase64Url(encoded);
      expect(JSON.parse(result)).toEqual(payload);
    });
  });

  describe('URL-Safe Character Handling (Requirement 3.4)', () => {
    it('should handle URL-safe Base64 with - characters', () => {
      // String that produces + in standard Base64, which becomes - in URL-safe
      // ">>>>" encodes to "Pj4+Pg==" in standard Base64
      const standardBase64 = 'Pj4-Pg'; // URL-safe version (+ replaced with -)
      const result = decodeBase64Url(standardBase64);
      expect(result).toBe('>>>\x3e'); // 4 greater-than signs
    });

    it('should handle URL-safe Base64 with _ characters', () => {
      // String that produces / in standard Base64, which becomes _ in URL-safe
      // "????" encodes to "Pz8/Pw==" in standard Base64
      const standardBase64 = 'Pz8_Pw'; // URL-safe version (/ replaced with _)
      const result = decodeBase64Url(standardBase64);
      expect(result).toBe('????' ); // 4 question marks
    });

    it('should handle mixed URL-safe characters', () => {
      // Create a payload that will have both - and _ in URL-safe encoding
      const payload = { data: '>>>???<<<' };
      const encoded = btoa(JSON.stringify(payload))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      
      const result = decodeBase64Url(encoded);
      expect(JSON.parse(result)).toEqual(payload);
    });
  });

  describe('Padding Handling', () => {
    it('should handle Base64 without padding (length % 4 == 0)', () => {
      // "test" = "dGVzdA==" (8 chars with padding, 6 without)
      const encoded = 'dGVzdA';
      const result = decodeBase64Url(encoded);
      expect(result).toBe('test');
    });

    it('should handle Base64 needing 1 padding character', () => {
      // "tes" = "dGVz" (4 chars, needs no padding)
      const encoded = 'dGVz';
      const result = decodeBase64Url(encoded);
      expect(result).toBe('tes');
    });

    it('should handle Base64 needing 2 padding characters', () => {
      // "te" = "dGU=" (3 chars without padding, needs 1)
      const encoded = 'dGU';
      const result = decodeBase64Url(encoded);
      expect(result).toBe('te');
    });

    it('should handle already padded Base64', () => {
      // Some implementations might include padding
      const encoded = 'dGVzdA==';
      const result = decodeBase64Url(encoded);
      expect(result).toBe('test');
    });
  });

  describe('UTF-8 Unicode Handling', () => {
    it('should decode UTF-8 characters correctly', () => {
      // "Hello 世界" in UTF-8 Base64
      const payload = 'Hello 世界';
      const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(payload)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      
      const result = decodeBase64Url(encoded);
      expect(result).toBe(payload);
    });

    it('should decode emoji correctly', () => {
      const payload = '👋🌍';
      const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(payload)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      
      const result = decodeBase64Url(encoded);
      expect(result).toBe(payload);
    });

    it('should decode Zambian names with special characters', () => {
      // Test with names that might appear in MIHAS applications
      const payload = { name: 'Chisanga Mwelwa', location: 'Ndola' };
      const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(payload))))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      
      const result = decodeBase64Url(encoded);
      expect(JSON.parse(result)).toEqual(payload);
    });
  });

  describe('Real JWT Payload Scenarios', () => {
    it('should decode a realistic Supabase JWT payload', () => {
      const payload = {
        sub: '550e8400-e29b-41d4-a716-446655440000',
        email: 'student@mihas.edu.zm',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        role: 'authenticated',
        user_metadata: {
          full_name: 'Test Student'
        },
        app_metadata: {
          role: 'student'
        }
      };
      
      const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(payload))))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      
      const result = decodeBase64Url(encoded);
      const decoded = JSON.parse(result);
      
      expect(decoded.sub).toBe(payload.sub);
      expect(decoded.email).toBe(payload.email);
      expect(decoded.role).toBe(payload.role);
      expect(decoded.app_metadata.role).toBe('student');
    });

    it('should decode JWT payload with admin role', () => {
      const payload = {
        sub: '550e8400-e29b-41d4-a716-446655440001',
        email: '***REMOVED***',
        exp: Math.floor(Date.now() / 1000) + 3600,
        app_metadata: {
          role: 'admin',
          roles: ['admin', 'admissions_officer']
        }
      };
      
      const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(payload))))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      
      const result = decodeBase64Url(encoded);
      const decoded = JSON.parse(result);
      
      expect(decoded.app_metadata.role).toBe('admin');
      expect(decoded.app_metadata.roles).toContain('admin');
      expect(decoded.app_metadata.roles).toContain('admissions_officer');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string', () => {
      const result = decodeBase64Url('');
      expect(result).toBe('');
    });

    it('should handle single character payload', () => {
      // "a" in Base64
      const encoded = 'YQ';
      const result = decodeBase64Url(encoded);
      expect(result).toBe('a');
    });

    it('should handle very long payloads', () => {
      // Create a large payload similar to what might be in a JWT
      const payload = {
        sub: '550e8400-e29b-41d4-a716-446655440000',
        permissions: Array(50).fill('permission').map((p, i) => `${p}_${i}`),
        metadata: { key: 'value'.repeat(100) }
      };
      
      const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(payload))))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      
      const result = decodeBase64Url(encoded);
      const decoded = JSON.parse(result);
      
      expect(decoded.sub).toBe(payload.sub);
      expect(decoded.permissions.length).toBe(50);
    });
  });
});
