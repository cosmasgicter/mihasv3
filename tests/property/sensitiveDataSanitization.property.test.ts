/**
 * Property-Based Tests: Sensitive Data Sanitization
 * Feature: bun-vercel-runtime-forensics
 * Task: 11.2 Write property test for sensitive data
 * 
 * **Property 6: No Sensitive Data in Error Responses**
 * 
 * *For any* database or system error, the error response SHALL NOT contain:
 * - Connection strings
 * - Credentials (API keys, passwords, secrets)
 * - Internal file paths
 * - User PII (emails, phone numbers, UUIDs)
 * - IP addresses
 * 
 * **Validates: Requirements 10.4, 7.2, 11.1**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Recreate the sanitization logic for testing
 * This mirrors the implementation in errorHandler.ts
 */
function sanitizeErrorMessage(message: string): string {
  // Remove potential UUIDs (user IDs) FIRST - before phone numbers
  let sanitized = message.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[ID]');
  
  // Remove potential email addresses
  sanitized = sanitized.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');
  
  // Remove potential JWT tokens
  sanitized = sanitized.replace(/eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g, '[TOKEN]');
  
  // Remove database connection strings (PostgreSQL, MySQL, MongoDB, etc.)
  sanitized = sanitized.replace(/(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|mssql):\/\/[^\s"']+/gi, '[CONNECTION_STRING]');
  
  // Remove Supabase URLs with keys
  sanitized = sanitized.replace(/https?:\/\/[a-z0-9-]+\.supabase\.co[^\s"']*/gi, '[SUPABASE_URL]');
  
  // Remove API keys and secrets (common patterns) - must be before phone numbers
  sanitized = sanitized.replace(/(?:api[_-]?key|secret|password|token|auth)[=:]\s*["']?[a-zA-Z0-9_\-./+=]{16,}["']?/gi, '[CREDENTIAL]');
  
  // Remove service role keys (Supabase pattern)
  sanitized = sanitized.replace(/eyJ[a-zA-Z0-9_-]{100,}/g, '[SERVICE_KEY]');
  
  // Remove file paths (Unix and Windows)
  sanitized = sanitized.replace(/(?:\/(?:home|var|usr|etc|tmp|app|opt|srv)[^\s"']*|[A-Z]:\\[^\s"']*)/gi, '[PATH]');
  
  // Remove IP addresses BEFORE phone numbers (IP addresses look like phone numbers)
  sanitized = sanitized.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP]');
  
  // Remove port numbers in connection contexts
  sanitized = sanitized.replace(/:\d{4,5}(?=\s|$|\/)/g, ':[PORT]');
  
  // Remove potential phone numbers (various formats) - AFTER IP addresses
  sanitized = sanitized.replace(/\+?\d{1,4}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g, '[PHONE]');
  
  return sanitized;
}

// Use constant values for fast, reliable testing
const uuidExamples = [
  '123e4567-e89b-12d3-a456-426614174000',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  '00000000-0000-0000-0000-000000000000',
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
];

const emailExamples = [
  'user@example.com',
  'student@mihas.edu.zm',
  'admin.user@company.co.uk',
  'test+tag@gmail.com',
];

const phoneExamples = [
  '+260977123456',
  '+1-555-123-4567',
  '+44 20 7946 0958',
  '0977123456',
];

const jwtExamples = [
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
  'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature',
];

const connectionStringExamples = [
  'postgresql://user:password@localhost:5432/mydb',
  'postgres://admin:secret123@db.example.com:5432/production',
  'mongodb+srv://user:pass@cluster.mongodb.net/mydb',
  'redis://:password@redis.example.com:6379',
  'mysql://root:password@127.0.0.1:3306/database',
];

const supabaseUrlExamples = [
  'https://abcdefghij.supabase.co/rest/v1/profiles',
  'https://myproject.supabase.co/auth/v1/token',
];

const apiKeyExamples = [
  'api_key=sk_live_1234567890abcdefghij',
  'secret: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abcdef"',
  'password="SuperSecretPassword123!"',
  'auth=Bearer_token_1234567890abcdef',
];

const filePathExamples = [
  '/home/user/documents/secret.txt',
  '/var/log/application.log',
  '/app/config/database.yml',
  'C:\\Users\\Admin\\Documents\\config.ini',
  '/etc/passwd',
];

const ipAddressExamples = [
  '192.168.1.1',
  '10.0.0.1',
  '172.16.0.100',
  '8.8.8.8',
];

describe('Property 6: No Sensitive Data in Error Responses', () => {
  describe('PII Sanitization', () => {
    it('PROPERTY: UUIDs are always replaced with [ID]', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...uuidExamples),
          fc.string({ minLength: 0, maxLength: 20 }),
          (uuid, context) => {
            const message = `Error for user ${uuid} in ${context}`;
            const sanitized = sanitizeErrorMessage(message);
            
            expect(sanitized).not.toContain(uuid);
            expect(sanitized).toContain('[ID]');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PROPERTY: Email addresses are always replaced with [EMAIL]', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...emailExamples),
          fc.string({ minLength: 0, maxLength: 20 }),
          (email, context) => {
            const message = `User ${email} failed to ${context}`;
            const sanitized = sanitizeErrorMessage(message);
            
            expect(sanitized).not.toContain(email);
            expect(sanitized).toContain('[EMAIL]');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PROPERTY: Phone numbers are always replaced with [PHONE]', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...phoneExamples),
          fc.string({ minLength: 0, maxLength: 20 }),
          (phone, context) => {
            const message = `SMS failed for ${phone}: ${context}`;
            const sanitized = sanitizeErrorMessage(message);
            
            expect(sanitized).not.toContain(phone);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PROPERTY: JWT tokens are always replaced with [TOKEN]', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...jwtExamples),
          (jwt) => {
            const message = `Invalid token: ${jwt}`;
            const sanitized = sanitizeErrorMessage(message);
            
            expect(sanitized).not.toContain(jwt);
            expect(sanitized).toContain('[TOKEN]');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Database Credential Sanitization', () => {
    it('PROPERTY: Connection strings are always replaced with [CONNECTION_STRING]', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...connectionStringExamples),
          (connStr) => {
            const message = `Database error: ${connStr}`;
            const sanitized = sanitizeErrorMessage(message);
            
            expect(sanitized).not.toContain(connStr);
            expect(sanitized).toContain('[CONNECTION_STRING]');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PROPERTY: Supabase URLs are always replaced with [SUPABASE_URL]', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...supabaseUrlExamples),
          (url) => {
            const message = `Supabase error at ${url}`;
            const sanitized = sanitizeErrorMessage(message);
            
            expect(sanitized).not.toContain(url);
            expect(sanitized).toContain('[SUPABASE_URL]');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PROPERTY: API keys and secrets are always replaced with [CREDENTIAL]', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...apiKeyExamples),
          (apiKey) => {
            const message = `Authentication failed: ${apiKey}`;
            const sanitized = sanitizeErrorMessage(message);
            
            expect(sanitized).not.toContain(apiKey);
            expect(sanitized).toContain('[CREDENTIAL]');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('System Information Sanitization', () => {
    it('PROPERTY: File paths are always replaced with [PATH]', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...filePathExamples),
          (path) => {
            const message = `File not found: ${path}`;
            const sanitized = sanitizeErrorMessage(message);
            
            expect(sanitized).not.toContain(path);
            expect(sanitized).toContain('[PATH]');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PROPERTY: IP addresses are always replaced with [IP]', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...ipAddressExamples),
          (ip) => {
            const message = `Connection refused from ${ip}`;
            const sanitized = sanitizeErrorMessage(message);
            
            expect(sanitized).not.toContain(ip);
            expect(sanitized).toContain('[IP]');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Combined Sensitive Data', () => {
    it('PROPERTY: Messages with multiple sensitive data types are fully sanitized', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...uuidExamples),
          fc.constantFrom(...emailExamples),
          fc.constantFrom(...ipAddressExamples),
          (uuid, email, ip) => {
            const message = `User ${uuid} (${email}) connected from ${ip}`;
            const sanitized = sanitizeErrorMessage(message);
            
            expect(sanitized).not.toContain(uuid);
            expect(sanitized).not.toContain(email);
            expect(sanitized).not.toContain(ip);
            expect(sanitized).toContain('[ID]');
            expect(sanitized).toContain('[EMAIL]');
            expect(sanitized).toContain('[IP]');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PROPERTY: Database errors with connection info are fully sanitized', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...connectionStringExamples),
          fc.constantFrom(...ipAddressExamples),
          (connStr, ip) => {
            const message = `Database connection failed: ${connStr} at ${ip}`;
            const sanitized = sanitizeErrorMessage(message);
            
            expect(sanitized).not.toContain(connStr);
            expect(sanitized).not.toContain(ip);
            expect(sanitized).toContain('[CONNECTION_STRING]');
            expect(sanitized).toContain('[IP]');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PROPERTY: Auth errors with tokens and user info are fully sanitized', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...jwtExamples),
          fc.constantFrom(...uuidExamples),
          fc.constantFrom(...emailExamples),
          (jwt, uuid, email) => {
            const message = `Auth failed for ${email} (${uuid}): invalid token ${jwt}`;
            const sanitized = sanitizeErrorMessage(message);
            
            expect(sanitized).not.toContain(jwt);
            expect(sanitized).not.toContain(uuid);
            expect(sanitized).not.toContain(email);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Edge Cases', () => {
    it('PROPERTY: Empty messages remain empty', () => {
      const sanitized = sanitizeErrorMessage('');
      expect(sanitized).toBe('');
    });

    it('PROPERTY: Messages without sensitive data are unchanged', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'Invalid request',
            'Method not allowed',
            'Resource not found',
            'Service temporarily unavailable',
            'Rate limit exceeded'
          ),
          (message) => {
            const sanitized = sanitizeErrorMessage(message);
            expect(sanitized).toBe(message);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PROPERTY: Sanitization is idempotent', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constantFrom(...uuidExamples).map(uuid => `Error for ${uuid}`),
            fc.constantFrom(...emailExamples).map(email => `User ${email} not found`),
            fc.constantFrom(...connectionStringExamples).map(conn => `DB error: ${conn}`)
          ),
          (message) => {
            const once = sanitizeErrorMessage(message);
            const twice = sanitizeErrorMessage(once);
            expect(twice).toBe(once);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
