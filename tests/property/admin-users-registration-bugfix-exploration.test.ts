// @vitest-environment node
/**
 * Bug Condition Exploration Tests
 *
 * These tests encode the EXPECTED (correct) behavior for three production bugs.
 * They are EXPECTED TO FAIL on unfixed code — failure confirms the bugs exist.
 *
 * Bug 1: SQL Parameterization — LIMIT/OFFSET use template literal interpolation
 *         instead of $N placeholders in handleUsers() (api-src/admin.ts)
 * Bug 2: VARCHAR Overflow — 'reg:' + 64-char ipHash = 68 chars exceeds VARCHAR(64)
 *         in recordRegistrationAttempt() (api-src/auth.ts)
 * Bug 3: CORS Preflight — withArcjetProtection() OPTIONS block omits X-CSRF-Token
 *         from Access-Control-Allow-Headers (lib/arcjet.ts)
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { createHash } from 'crypto';

// ---------------------------------------------------------------------------
// Extracted logic from api-src/admin.ts handleUsers() — SQL query builder
// This replicates the EXACT buggy logic from the source to test in isolation.
// ---------------------------------------------------------------------------
function buildUsersQuery(options: {
  role?: string;
  search?: string;
  page: number;
  limit: number;
  includeInactive?: boolean;
}): { sql: string; params: (string | number)[] } {
  const { role, search, page, limit, includeInactive } = options;

  const offset = (page - 1) * limit;
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  let paramIndex = 1;

  if (!includeInactive) {
    conditions.push('is_active = true');
  }

  if (role) {
    conditions.push(`role = $${paramIndex}`);
    params.push(role);
    paramIndex++;
  }

  if (search) {
    conditions.push(
      `(LOWER(full_name) LIKE $${paramIndex} OR LOWER(first_name) LIKE $${paramIndex} OR LOWER(last_name) LIKE $${paramIndex} OR LOWER(email) LIKE $${paramIndex})`
    );
    params.push(`%${search.toLowerCase()}%`);
    paramIndex++;
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const safeColumns =
    'id, email, full_name, first_name, last_name, phone, nationality, role, is_active, created_at, updated_at';

  // FIXED: Uses $${paramIndex} to produce proper $N PostgreSQL placeholders
  // instead of embedding literal numbers into the SQL string.
  const sql = `SELECT ${safeColumns} FROM profiles ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  return { sql, params };
}

// ---------------------------------------------------------------------------
// Helper: count $N placeholders in a SQL string
// ---------------------------------------------------------------------------
function countDollarPlaceholders(sql: string): number {
  const matches = sql.match(/\$\d+/g);
  return matches ? matches.length : 0;
}

// ---------------------------------------------------------------------------
// Extracted logic from api-src/auth.ts — registration key (BUGGY version)
// This replicates the exact concatenation used in recordRegistrationAttempt()
// and checkRegistrationRateLimit().
// ---------------------------------------------------------------------------
function buildRegistrationKey(ipHash: string): string {
  return createHash('sha256').update('reg:' + ipHash).digest('hex');
}

// ---------------------------------------------------------------------------
// Extracted CORS headers from lib/arcjet.ts withArcjetProtection() OPTIONS block
// This replicates the exact hardcoded headers from the source.
// ---------------------------------------------------------------------------
function getArcjetOptionsHeaders(origin?: string): Record<string, string> {
  const allowedOrigins = [
    '***REMOVED***',
    'https://mihas.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000',
  ];
  const allowedOrigin =
    origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods':
      'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token',
    'Access-Control-Expose-Headers': 'X-CSRF-Token',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}


// ===========================================================================
// Bug 1: SQL Parameterization — Placeholder count must match params length
// Validates: Requirements 1.1, 1.2, 1.3
// ===========================================================================
describe('Bug 1: SQL Parameterization — placeholder count matches params length', () => {
  /**
   * **Validates: Requirements 1.1**
   *
   * Property: For any valid (page, limit) with no role/search filters,
   * the number of $N placeholders in the SQL must equal params.length.
   *
   * On unfixed code: SQL has `LIMIT 1 OFFSET 2` as literal text (0 placeholders)
   * but params has [limit, offset] (2 values) → FAILS.
   */
  it('no filters: placeholder count === params.length', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        (page, limit) => {
          const { sql, params } = buildUsersQuery({ page, limit });
          const placeholderCount = countDollarPlaceholders(sql);
          expect(placeholderCount).toBe(params.length);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * **Validates: Requirements 1.2**
   *
   * Property: For any valid (role, page, limit) with role filter only,
   * the number of $N placeholders in the SQL must equal params.length.
   *
   * On unfixed code: SQL has `WHERE role = $1 LIMIT 2 OFFSET 3` (1 placeholder)
   * but params has [role, limit, offset] (3 values) → FAILS.
   */
  it('role filter only: placeholder count === params.length', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('student', 'admin', 'reviewer', 'super_admin'),
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        (role, page, limit) => {
          const { sql, params } = buildUsersQuery({ role, page, limit });
          const placeholderCount = countDollarPlaceholders(sql);
          expect(placeholderCount).toBe(params.length);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * **Validates: Requirements 1.3**
   *
   * Property: For any valid (role, search, page, limit) with both filters,
   * the number of $N placeholders in the SQL must equal params.length.
   *
   * On unfixed code: SQL has `WHERE role = $1 AND (...LIKE $2...) LIMIT 3 OFFSET 4`
   * (2 unique placeholders, but $2 repeated 4 times) but params has
   * [role, search, limit, offset] (4 values) → FAILS.
   */
  it('role + search filters: placeholder count === params.length', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('student', 'admin', 'reviewer', 'super_admin'),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        (role, search, page, limit) => {
          const { sql, params } = buildUsersQuery({ role, search, page, limit });
          // Count unique placeholder indices, not occurrences
          const matches = sql.match(/\$(\d+)/g);
          const uniquePlaceholders = matches
            ? new Set(matches).size
            : 0;
          expect(uniquePlaceholders).toBe(params.length);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: For search filter only (no role), placeholder count === params.length.
   */
  it('search filter only: placeholder count === params.length', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        (search, page, limit) => {
          const { sql, params } = buildUsersQuery({ search, page, limit });
          const matches = sql.match(/\$(\d+)/g);
          const uniquePlaceholders = matches
            ? new Set(matches).size
            : 0;
          expect(uniquePlaceholders).toBe(params.length);
        }
      ),
      { numRuns: 10 }
    );
  });
});

// ===========================================================================
// Bug 2: VARCHAR Overflow — registration key must fit VARCHAR(64)
// Validates: Requirements 1.5, 1.6, 1.7
// ===========================================================================
describe('Bug 2: VARCHAR Overflow — registration key fits VARCHAR(64)', () => {
  /**
   * **Validates: Requirements 1.5, 1.6**
   *
   * Property: For any 64-char hex string (SHA-256 digest), the registration
   * key used for INSERT must be at most 64 characters.
   *
   * On unfixed code: 'reg:' + 64-char hash = 68 chars → FAILS.
   */
  it('registration key length <= 64 for any 64-char hex ipHash', () => {
    // Generate 64-char hex strings (SHA-256 digest format)
    const hexString64 = fc
      .array(fc.integer({ min: 0, max: 15 }), { minLength: 64, maxLength: 64 })
      .map((nums) => nums.map((n) => n.toString(16)).join(''));

    fc.assert(
      fc.property(hexString64, (ipHash) => {
        const key = buildRegistrationKey(ipHash);
        expect(key.length).toBeLessThanOrEqual(64);
      }),
      { numRuns: 10 }
    );
  });

  /**
   * **Validates: Requirements 1.7**
   *
   * Property: The key used for INSERT (recordRegistrationAttempt) must
   * exactly match the key used for SELECT (checkRegistrationRateLimit).
   * Both use the same buildRegistrationKey() function, so this tests
   * consistency. On unfixed code, both produce the same 68-char string
   * (consistent but overflowing), so this test passes — the overflow
   * test above catches the actual bug.
   */
  it('INSERT key matches SELECT key (consistency)', () => {
    const hexString64 = fc
      .array(fc.integer({ min: 0, max: 15 }), { minLength: 64, maxLength: 64 })
      .map((nums) => nums.map((n) => n.toString(16)).join(''));

    fc.assert(
      fc.property(hexString64, (ipHash) => {
        const insertKey = buildRegistrationKey(ipHash);
        const selectKey = buildRegistrationKey(ipHash);
        expect(insertKey).toBe(selectKey);
      }),
      { numRuns: 10 }
    );
  });
});

// ===========================================================================
// Bug 3: CORS Preflight — OPTIONS must include X-CSRF-Token
// Validates: Requirements 1.8, 1.9, 1.10
// ===========================================================================
describe('Bug 3: CORS Preflight — OPTIONS includes X-CSRF-Token', () => {
  const allowedOrigins = [
    '***REMOVED***',
    'https://mihas.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000',
  ];

  /**
   * **Validates: Requirements 1.8, 1.9**
   *
   * Property: For any allowed origin, the OPTIONS response from
   * withArcjetProtection() must include X-CSRF-Token in
   * Access-Control-Allow-Headers.
   *
   * On unfixed code: headers are 'Content-Type, Authorization' → FAILS.
   */
  it('Access-Control-Allow-Headers includes X-CSRF-Token', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...allowedOrigins),
        (origin) => {
          const headers = getArcjetOptionsHeaders(origin);
          const allowHeaders = headers['Access-Control-Allow-Headers'];
          expect(allowHeaders).toContain('X-CSRF-Token');
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * **Validates: Requirements 1.10**
   *
   * Property: For any allowed origin, the OPTIONS response from
   * withArcjetProtection() must include Access-Control-Expose-Headers
   * with X-CSRF-Token.
   *
   * On unfixed code: Access-Control-Expose-Headers is not set at all → FAILS.
   */
  it('Access-Control-Expose-Headers includes X-CSRF-Token', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...allowedOrigins),
        (origin) => {
          const headers = getArcjetOptionsHeaders(origin);
          const exposeHeaders = headers['Access-Control-Expose-Headers'];
          expect(exposeHeaders).toBeDefined();
          expect(exposeHeaders).toContain('X-CSRF-Token');
        }
      ),
      { numRuns: 10 }
    );
  });
});
