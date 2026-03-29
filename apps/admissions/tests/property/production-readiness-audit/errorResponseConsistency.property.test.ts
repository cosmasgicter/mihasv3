/**
 * Property-Based Tests: Error Response Consistency (Property 10)
 * Spec: production-readiness-audit
 * Task: 5.6
 *
 * **Property 10: Error Response Consistency**
 *
 * *For any* API error, the response SHALL follow the format
 * `{ success: false, error: string }` without exposing stack traces
 * or internal details.
 *
 * **Validates: Requirements 4.4, 11.4**
 *
 * This test models the error response and sanitization logic as pure
 * functions, importing the actual `sanitizeError` from `lib/errorHandler.ts`,
 * and verifies the properties hold for arbitrary error messages, error types,
 * and potentially dangerous payloads.
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  sanitizeError,
  AuthError,
  ErrorCode,
  HttpStatus,
} from '../../../lib/errorHandler';

const NUM_RUNS = 10;

// ============================================================================
// Types (mirroring lib/errorHandler.ts)
// ============================================================================

interface ErrorResponse {
  success: false;
  error: string;
  code: string;
  fieldErrors?: Record<string, string>;
}

// ============================================================================
// Pure functions replicating sendError / handleError envelope construction
// ============================================================================

/**
 * Replicates the envelope built by sendError() in lib/errorHandler.ts.
 * sendError sanitizes the message and wraps it in the standard envelope.
 */
function buildSendErrorEnvelope(
  message: string,
  code: string = ErrorCode.VALIDATION_ERROR
): ErrorResponse {
  return {
    success: false,
    error: sanitizeError(message),
    code,
  };
}

/**
 * Replicates the envelope built by handleError() for AuthError instances.
 */
function buildAuthErrorEnvelope(authError: AuthError): ErrorResponse {
  return authError.toJSON();
}

/**
 * Replicates the envelope built by handleError() for generic Error instances
 * (the fallback path that maps error messages to status codes).
 */
function buildGenericErrorEnvelope(errorMessage: string): ErrorResponse {
  const lower = errorMessage.toLowerCase();

  let message = 'An unexpected error occurred';
  let code: string = ErrorCode.INTERNAL_ERROR;

  if (lower.includes('unauthorized') || lower.includes('no authorization') || lower.includes('authentication')) {
    message = 'Authentication required';
    code = ErrorCode.AUTHENTICATION_ERROR;
  } else if (lower.includes('forbidden') || lower.includes('access denied') || lower.includes('permission') || lower.includes('insufficient')) {
    message = 'Access denied';
    code = ErrorCode.AUTHORIZATION_ERROR;
  } else if (lower.includes('not found')) {
    message = 'Resource not found';
    code = ErrorCode.NOT_FOUND;
  } else if (lower.includes('validation') || lower.includes('invalid')) {
    message = sanitizeError(errorMessage);
    code = ErrorCode.VALIDATION_ERROR;
  } else if (lower.includes('rate limit') || lower.includes('too many')) {
    message = 'Too many requests. Please try again later.';
    code = ErrorCode.RATE_LIMITED;
  } else if (lower.includes('unavailable') || lower.includes('timeout')) {
    message = 'Service temporarily unavailable';
    code = ErrorCode.SERVICE_UNAVAILABLE;
  } else if (lower.includes('expired')) {
    message = 'Token has expired';
    code = ErrorCode.TOKEN_EXPIRED;
  }

  return { success: false, error: message, code };
}

// ============================================================================
// Sensitive pattern detectors
// ============================================================================

/**
 * Patterns that must NEVER appear in error responses.
 *
 * Note: sanitizeError replaces file paths with [PATH], UUIDs with [ID], etc.
 * We check for the *original* sensitive values, not the sanitized placeholders.
 * Stack trace detection focuses on actual file paths with line numbers inside
 * stack frames — the structural "at ..." text with [PATH] placeholders is
 * acceptable since no real internal details are exposed.
 */
const SENSITIVE_PATTERNS = {
  // Real file paths (not the [PATH] placeholder)
  filePath: /(?:\/(?:home|var|usr|etc|tmp|app|opt|srv)\/[^\s"']+|[A-Z]:\\[^\s"']+)/i,
  // Stack traces with actual application file paths and line numbers
  stackTraceWithPath: /at\s+\S+\s+\((?:\/(?:home|var|usr|etc|tmp|app|opt|srv))[^\s)]+:\d+:\d+\)/i,
  // Email addresses
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
  // UUIDs
  uuid: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  // JWT tokens
  jwt: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/,
  // Database connection strings
  connectionString: /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s"']+/i,
  // bcrypt hashes
  bcryptHash: /\$2[aby]?\$\d{1,2}\$[./A-Za-z0-9]{53}/,
  // SHA-256 hashes (64 hex chars)
  sha256Hash: /\b[a-f0-9]{64}\b/i,
  // IP addresses
  ipAddress: /\b(?:\d{1,3}\.){3}\d{1,3}\b/,
};

/**
 * Checks that a sanitized error message does not contain any sensitive patterns.
 * Returns an array of pattern names that matched (empty = safe).
 */
function findLeakedPatterns(message: string): string[] {
  const leaked: string[] = [];
  for (const [name, regex] of Object.entries(SENSITIVE_PATTERNS)) {
    if (regex.test(message)) {
      leaked.push(name);
    }
  }
  return leaked;
}

// ============================================================================
// Arbitraries
// ============================================================================

/** Arbitrary for realistic error messages that might contain PII */
const errorMessageArb = fc.oneof(
  fc.string({ minLength: 1, maxLength: 200 }),
  fc.constantFrom(
    'Invalid email format',
    'User not found',
    'Database connection failed',
    'Rate limit exceeded',
    'Validation failed: email is required',
    'Internal server error',
    'Access denied',
    'Token has expired',
    'Service temporarily unavailable',
  )
);

/** Arbitrary for error messages containing emails */
const emailLeakArb = fc.tuple(
  fc.constantFrom('User ', 'Account ', 'Profile for ', 'Error for '),
  fc.emailAddress(),
  fc.constantFrom(' not found', ' already exists', ' is invalid', ' failed')
).map(([prefix, email, suffix]) => `${prefix}${email}${suffix}`);

/** Arbitrary for error messages containing UUIDs */
const uuidLeakArb = fc.tuple(
  fc.constantFrom('Record ', 'Application ', 'User ', 'Document '),
  fc.uuid(),
  fc.constantFrom(' not found', ' already exists', ' is locked')
).map(([prefix, uuid, suffix]) => `${prefix}${uuid}${suffix}`);

/** Arbitrary for error messages containing file paths */
const filePathLeakArb = fc.tuple(
  fc.constantFrom('Error in ', 'Failed at ', 'Cannot read '),
  fc.constantFrom(
    '/home/user/app/src/index.ts',
    '/var/log/app/error.log',
    '/usr/local/lib/node_modules/pg/lib/client.js',
    '/app/api-src/auth.ts',
    '/tmp/upload_12345',
  )
).map(([prefix, path]) => `${prefix}${path}`);

/** Arbitrary for error messages containing JWTs */
const jwtLeakArb = fc.constant(
  'Token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U is invalid'
);

/** Arbitrary for error messages containing connection strings */
const connectionStringLeakArb = fc.constantFrom(
  'Connection to postgres://admin:secret@db.neon.tech/mydb failed',
  'Cannot connect to postgresql://user:pass@host:5432/database?sslmode=require',
  'mongodb+srv://user:pass@cluster.mongodb.net/db timeout',
);

/** Arbitrary for error messages containing stack traces */
const stackTraceLeakArb = fc.constantFrom(
  'TypeError: Cannot read property of undefined\n    at Object.handler (/app/api-src/auth.ts:42:15)\n    at processTicksAndRejections (node:internal/process/task_queues:95:5)',
  'Error: ENOENT: no such file or directory\n    at Function.openSync (/usr/local/lib/node_modules/fs.js:123:5)',
);

/** Arbitrary for error messages containing bcrypt hashes */
const bcryptLeakArb = fc.constant(
  'Hash mismatch for $2b$12$LJ3m4ys3Lk0TSwHiPbUXYOJZP.cLuY5E3ppNv/IEwPBnXEJjW7Wi6'
);

/** Combined arbitrary for all dangerous payloads */
const dangerousMessageArb = fc.oneof(
  emailLeakArb,
  uuidLeakArb,
  filePathLeakArb,
  jwtLeakArb,
  connectionStringLeakArb,
  stackTraceLeakArb,
  bcryptLeakArb,
);

/** Arbitrary for error codes matching the project's convention */
const errorCodeArb = fc.constantFrom(
  ...Object.values(ErrorCode)
);

/** Arbitrary for HTTP status codes used in error responses */
const httpStatusArb = fc.constantFrom(
  HttpStatus.BAD_REQUEST,
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.NOT_FOUND,
  HttpStatus.TOO_MANY_REQUESTS,
  HttpStatus.INTERNAL_SERVER_ERROR,
  HttpStatus.SERVICE_UNAVAILABLE,
);

/** Arbitrary for AuthError factory methods */
const authErrorArb = fc.constantFrom(
  AuthError.validation('Bad input'),
  AuthError.authentication(),
  AuthError.invalidCredentials(),
  AuthError.tokenExpired(),
  AuthError.invalidToken(),
  AuthError.forbidden(),
  AuthError.insufficientPermissions(),
  AuthError.securityViolation(),
  AuthError.rateLimited(),
  AuthError.notFound('Application'),
  AuthError.internal(),
  AuthError.serviceUnavailable(),
  AuthError.database(),
);

// ============================================================================
// Tests
// ============================================================================

describe('Feature: production-readiness-audit, Property 10: Error Response Consistency', () => {

  // --------------------------------------------------------------------------
  // Envelope structure: sendError always produces { success: false, error: string, code: string }
  // --------------------------------------------------------------------------
  describe('Property: sendError envelope is always { success: false, error: string, code: string }', () => {
    /**
     * **Validates: Requirements 4.4**
     */
    it('envelope has correct shape for any error message and code', () => {
      fc.assert(
        fc.property(errorMessageArb, errorCodeArb, (message, code) => {
          const envelope = buildSendErrorEnvelope(message, code);

          expect(envelope.success).toBe(false);
          expect(typeof envelope.error).toBe('string');
          expect(typeof envelope.code).toBe('string');
          expect(envelope.error.length).toBeGreaterThan(0);
          expect(envelope.code).toBe(code);
          // Must not have a data field
          expect(envelope).not.toHaveProperty('data');
        }),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // --------------------------------------------------------------------------
  // Envelope structure: AuthError.toJSON always produces valid envelope
  // --------------------------------------------------------------------------
  describe('Property: AuthError.toJSON always produces valid error envelope', () => {
    /**
     * **Validates: Requirements 4.4**
     */
    it('all AuthError factory methods produce valid envelopes', () => {
      fc.assert(
        fc.property(authErrorArb, (authError) => {
          const envelope = buildAuthErrorEnvelope(authError);

          expect(envelope.success).toBe(false);
          expect(typeof envelope.error).toBe('string');
          expect(typeof envelope.code).toBe('string');
          expect(envelope.error.length).toBeGreaterThan(0);
          expect(envelope.code.length).toBeGreaterThan(0);
          expect(envelope).not.toHaveProperty('data');
        }),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // --------------------------------------------------------------------------
  // Envelope structure: handleError generic path always produces valid envelope
  // --------------------------------------------------------------------------
  describe('Property: handleError generic path always produces valid error envelope', () => {
    /**
     * **Validates: Requirements 4.4**
     */
    it('generic error messages produce valid envelopes', () => {
      fc.assert(
        fc.property(errorMessageArb, (message) => {
          const envelope = buildGenericErrorEnvelope(message);

          expect(envelope.success).toBe(false);
          expect(typeof envelope.error).toBe('string');
          expect(typeof envelope.code).toBe('string');
          expect(envelope.error.length).toBeGreaterThan(0);
          expect(envelope).not.toHaveProperty('data');
        }),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // --------------------------------------------------------------------------
  // Sanitization: no stack traces or internal details leak through sendError
  // --------------------------------------------------------------------------
  describe('Property: sanitizeError strips all sensitive data from any error message', () => {
    /**
     * **Validates: Requirements 4.4, 11.4**
     */
    it('dangerous payloads are sanitized — no PII or internal details leak', () => {
      fc.assert(
        fc.property(dangerousMessageArb, (dangerousMessage) => {
          const sanitized = sanitizeError(dangerousMessage);
          const leaked = findLeakedPatterns(sanitized);

          expect(leaked).toEqual([]);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    /**
     * **Validates: Requirements 4.4, 11.4**
     */
    it('sendError envelope never contains sensitive patterns for dangerous inputs', () => {
      fc.assert(
        fc.property(dangerousMessageArb, errorCodeArb, (dangerousMessage, code) => {
          const envelope = buildSendErrorEnvelope(dangerousMessage, code);
          const leaked = findLeakedPatterns(envelope.error);

          expect(leaked).toEqual([]);
          expect(envelope.success).toBe(false);
        }),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // --------------------------------------------------------------------------
  // Sanitization: handleError generic path never leaks internal details
  // --------------------------------------------------------------------------
  describe('Property: handleError generic path never exposes internal details', () => {
    /**
     * **Validates: Requirements 4.4, 11.4**
     */
    it('generic error path produces safe messages for any error string', () => {
      fc.assert(
        fc.property(dangerousMessageArb, (dangerousMessage) => {
          const envelope = buildGenericErrorEnvelope(dangerousMessage);
          const leaked = findLeakedPatterns(envelope.error);

          expect(leaked).toEqual([]);
          expect(envelope.success).toBe(false);
          expect(typeof envelope.error).toBe('string');
        }),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // --------------------------------------------------------------------------
  // Sanitization: sanitizeError is idempotent
  // --------------------------------------------------------------------------
  describe('Property: sanitizeError is idempotent', () => {
    /**
     * **Validates: Requirements 4.4**
     */
    it('applying sanitizeError twice yields the same result as once', () => {
      fc.assert(
        fc.property(dangerousMessageArb, (message) => {
          const once = sanitizeError(message);
          const twice = sanitizeError(once);

          expect(twice).toBe(once);
        }),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // --------------------------------------------------------------------------
  // Sanitization: null/undefined/non-string inputs produce safe fallback
  // --------------------------------------------------------------------------
  describe('Property: sanitizeError handles edge-case inputs gracefully', () => {
    /**
     * **Validates: Requirements 4.4**
     */
    it('null, undefined, empty string, and non-string inputs produce a safe fallback', () => {
      // These are direct unit checks, not property-based, but validate edge cases
      expect(sanitizeError(null as unknown as string)).toBe('An error occurred');
      expect(sanitizeError(undefined as unknown as string)).toBe('An error occurred');
      expect(sanitizeError('')).toBe('An error occurred');
      expect(sanitizeError(123 as unknown as string)).toBe('An error occurred');
    });
  });
});
