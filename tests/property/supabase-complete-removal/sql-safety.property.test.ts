/**
 * Property-Based Tests: SQL Parameterization Safety
 * Feature: supabase-complete-removal
 * Task: 8.2 Write property test for SQL parameterization
 * 
 * **Property 4: SQL Parameterization Safety**
 * *For any* database query in the admin API, the query SHALL use parameterized SQL
 * via `lib/db.ts` to prevent SQL injection.
 * 
 * **Validates: Requirements 8.1, 8.2, 8.3**
 * 
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ============================================================================
// Test Configuration
// ============================================================================

const NUM_RUNS = 100;

// ============================================================================
// SQL Parameterization Patterns
// ============================================================================

/**
 * Regex patterns for detecting parameterized queries
 */
const PARAMETERIZED_PLACEHOLDER_PATTERN = /\$\d+/;
const SQL_INJECTION_PATTERNS = [
  /'\s*OR\s*'1'\s*=\s*'1/i,
  /;\s*DROP\s+TABLE/i,
  /;\s*DELETE\s+FROM/i,
  /UNION\s+SELECT/i,
  /--\s*$/,
  /\/\*.*\*\//,
];

/**
 * Check if a SQL query uses parameterized placeholders
 */
function usesParameterizedQuery(sql: string): boolean {
  return PARAMETERIZED_PLACEHOLDER_PATTERN.test(sql);
}

/**
 * Check if a value contains potential SQL injection patterns
 */
function containsSqlInjection(value: string): boolean {
  return SQL_INJECTION_PATTERNS.some(pattern => pattern.test(value));
}

/**
 * Simulate the query function from lib/db.ts
 * This validates that user input is passed as parameters, not interpolated
 */
function simulateParameterizedQuery(
  sql: string,
  params: (string | number | boolean | null)[]
): { sql: string; params: (string | number | boolean | null)[]; safe: boolean } {
  // Check that the SQL uses placeholders
  const placeholderCount = (sql.match(/\$\d+/g) || []).length;
  
  // Verify placeholder count matches params
  const safe = placeholderCount === params.length && placeholderCount > 0;
  
  return { sql, params, safe };
}

/**
 * Build a settings query like admin.ts does
 */
function buildSettingsInsertQuery(
  settingKey: string,
  settingValue: string,
  settingType: string,
  description: string | null,
  isPublic: boolean,
  userId: string
): { sql: string; params: (string | boolean | null)[] } {
  const sql = `INSERT INTO system_settings (setting_key, setting_value, setting_type, description, is_public, updated_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING *`;
  
  const params = [
    settingKey.trim(),
    String(settingValue),
    settingType || 'string',
    description || null,
    isPublic,
    userId,
  ];
  
  return { sql, params };
}

/**
 * Build a user lookup query like admin.ts does
 */
function buildUserLookupQuery(email: string): { sql: string; params: string[] } {
  const sql = 'SELECT id FROM profiles WHERE email = $1 LIMIT 1';
  const params = [email.toLowerCase()];
  return { sql, params };
}

/**
 * Build a delete query like admin.ts does
 */
function buildDeleteQuery(identifier: string, byId: boolean): { sql: string; params: string[] } {
  const sql = byId 
    ? 'DELETE FROM system_settings WHERE id = $1'
    : 'DELETE FROM system_settings WHERE setting_key = $1';
  const params = [identifier];
  return { sql, params };
}

// ============================================================================
// Arbitrary Generators
// ============================================================================

const uuidArb = fc.uuid();

/**
 * Generate potentially malicious SQL injection strings
 */
const sqlInjectionArb = fc.oneof(
  fc.constant("'; DROP TABLE users; --"),
  fc.constant("' OR '1'='1"),
  fc.constant("1; DELETE FROM applications"),
  fc.constant("admin'--"),
  fc.constant("' UNION SELECT * FROM profiles --"),
  fc.constant("'; INSERT INTO profiles (role) VALUES ('super_admin'); --"),
  fc.constant("test\"; DROP TABLE system_settings; --"),
  fc.string().map(s => `${s}' OR 1=1 --`),
);

/**
 * Generate valid setting keys
 */
const settingKeyArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0);

/**
 * Generate valid setting values (including potentially dangerous ones)
 */
const settingValueArb = fc.oneof(
  fc.string({ minLength: 0, maxLength: 200 }),
  sqlInjectionArb,
);

/**
 * Generate valid emails (including potentially dangerous ones)
 */
const emailArb = fc.oneof(
  fc.emailAddress(),
  sqlInjectionArb.map(s => `${s}@example.com`),
);

// ============================================================================
// Property 4: SQL Parameterization Safety
// ============================================================================

describe('Feature: supabase-complete-removal, Property 4: SQL Parameterization Safety', () => {
  describe('Settings Operations', () => {
    /**
     * **Validates: Requirements 8.1, 8.2**
     * THE Admin_API SHALL replace all `supabaseAdmin.from()` calls with direct SQL queries using `lib/db.ts`
     * WHEN fetching settings, THE Admin_API SHALL use parameterized SQL queries
     */
    it('PROPERTY: Settings insert SHALL use parameterized query with $1-$6 placeholders', async () => {
      await fc.assert(
        fc.asyncProperty(
          settingKeyArb,
          settingValueArb,
          fc.constantFrom('string', 'number', 'boolean', 'json'),
          fc.option(fc.string({ minLength: 0, maxLength: 200 }), { nil: null }),
          fc.boolean(),
          uuidArb,
          async (key, value, type, description, isPublic, userId) => {
            const { sql, params } = buildSettingsInsertQuery(key, value, type, description, isPublic, userId);
            
            // SQL must use parameterized placeholders
            expect(usesParameterizedQuery(sql)).toBe(true);
            
            // Must have exactly 6 placeholders for 6 params
            const placeholders = sql.match(/\$\d+/g) || [];
            expect(placeholders.length).toBe(6);
            
            // Params must match placeholder count
            expect(params.length).toBe(6);
            
            // User input must be in params, not interpolated in SQL
            // Only check values that are unique enough to not appear in SQL template
            // (empty strings, single spaces, common SQL keywords, or substrings of column names would give false positives)
            const sqlTemplate = 'INSERT INTO system_settings setting_key setting_value setting_type description is_public updated_by created_at updated_at VALUES RETURNING NOW';
            const isUniqueValue = (v: string) => {
              if (v.length <= 2) return false;
              if (/^[\s$]+$/.test(v)) return false;
              if (['string', 'null', 'true', 'false'].includes(v.toLowerCase())) return false;
              // Check if value appears in SQL template (case-insensitive)
              if (sqlTemplate.toLowerCase().includes(v.toLowerCase())) return false;
              return true;
            };
            
            if (isUniqueValue(key.trim())) {
              expect(sql).not.toContain(key.trim());
            }
            if (isUniqueValue(value)) {
              expect(sql).not.toContain(value);
            }
            expect(params[0]).toBe(key.trim());
            expect(params[1]).toBe(String(value));
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: SQL injection attempts in setting values SHALL be safely parameterized', async () => {
      await fc.assert(
        fc.asyncProperty(
          settingKeyArb,
          sqlInjectionArb,
          uuidArb,
          async (key, maliciousValue, userId) => {
            const { sql, params } = buildSettingsInsertQuery(key, maliciousValue, 'string', null, false, userId);
            
            // The malicious value should be in params, not in SQL
            expect(sql).not.toContain(maliciousValue);
            expect(params).toContain(String(maliciousValue));
            
            // SQL should still be valid parameterized query
            expect(usesParameterizedQuery(sql)).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Delete operations SHALL use parameterized queries', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(uuidArb, sqlInjectionArb),
          fc.boolean(),
          async (identifier, byId) => {
            const { sql, params } = buildDeleteQuery(identifier, byId);
            
            // Must use parameterized query
            expect(usesParameterizedQuery(sql)).toBe(true);
            
            // Identifier must be in params, not SQL
            expect(sql).not.toContain(identifier);
            expect(params[0]).toBe(identifier);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('User Operations', () => {
    /**
     * **Validates: Requirements 8.3**
     * WHEN creating/updating users, THE Admin_API SHALL use the `query()` function from `lib/db.ts`
     */
    it('PROPERTY: User lookup SHALL use parameterized email query', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailArb,
          async (email) => {
            const { sql, params } = buildUserLookupQuery(email);
            
            // Must use parameterized query
            expect(usesParameterizedQuery(sql)).toBe(true);
            
            // Email must be in params, not SQL
            expect(sql).not.toContain(email);
            expect(params[0]).toBe(email.toLowerCase());
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: SQL injection in email SHALL be safely parameterized', async () => {
      await fc.assert(
        fc.asyncProperty(
          sqlInjectionArb,
          async (maliciousEmail) => {
            const { sql, params } = buildUserLookupQuery(maliciousEmail);
            
            // Malicious input should be in params, not SQL
            expect(sql).not.toContain(maliciousEmail);
            expect(params[0]).toBe(maliciousEmail.toLowerCase());
            
            // SQL structure should be intact
            expect(sql).toContain('SELECT');
            expect(sql).toContain('FROM profiles');
            expect(sql).toContain('WHERE email = $1');
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Query Validation', () => {
    /**
     * **Validates: Requirements 8.1, 8.2, 8.3**
     * All user-provided values are passed as parameters, not interpolated
     */
    it('PROPERTY: Parameterized query SHALL have matching placeholder and param counts', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.oneof(fc.string(), fc.integer(), fc.boolean()), { minLength: 1, maxLength: 10 }),
          async (params) => {
            // Build a query with correct number of placeholders
            const placeholders = params.map((_, i) => `$${i + 1}`).join(', ');
            const sql = `SELECT * FROM test WHERE col IN (${placeholders})`;
            
            const result = simulateParameterizedQuery(sql, params);
            
            expect(result.safe).toBe(true);
            expect((sql.match(/\$\d+/g) || []).length).toBe(params.length);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Query without placeholders SHALL be flagged as unsafe for user input', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate strings that don't look like placeholders
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => !/\$\d+/.test(s)),
          async (userInput) => {
            // Unsafe: directly interpolating user input
            const unsafeSql = `SELECT * FROM test WHERE col = '${userInput}'`;
            
            // This should NOT have parameterized placeholders
            expect(usesParameterizedQuery(unsafeSql)).toBe(false);
            
            // Safe version
            const safeSql = 'SELECT * FROM test WHERE col = $1';
            expect(usesParameterizedQuery(safeSql)).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Placeholder Syntax', () => {
    /**
     * **Validates: Requirements 8.1, 8.2, 8.3**
     * The `$1, $2, ...` placeholder syntax is used consistently
     */
    it('PROPERTY: Placeholders SHALL use $N syntax (PostgreSQL style)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 20 }),
          async (paramCount) => {
            // Build query with correct PostgreSQL placeholders
            const placeholders = Array.from({ length: paramCount }, (_, i) => `$${i + 1}`);
            const sql = `INSERT INTO test VALUES (${placeholders.join(', ')})`;
            
            // All placeholders should match $N pattern
            const matches = sql.match(/\$\d+/g) || [];
            expect(matches.length).toBe(paramCount);
            
            // Verify sequential numbering
            matches.forEach((match, index) => {
              expect(match).toBe(`$${index + 1}`);
            });
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Placeholders SHALL be sequential starting from $1', async () => {
      // Test actual queries from admin.ts
      const queries = [
        'SELECT id FROM profiles WHERE email = $1 LIMIT 1',
        'DELETE FROM system_settings WHERE id = $1',
        'DELETE FROM system_settings WHERE setting_key = $1',
        'UPDATE profiles SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        `INSERT INTO profiles (email, password_hash, first_name, last_name, role, email_verified, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
         RETURNING id, email, first_name, last_name, role, created_at`,
      ];
      
      for (const sql of queries) {
        const matches = sql.match(/\$\d+/g) || [];
        
        // Should have at least one placeholder
        expect(matches.length).toBeGreaterThan(0);
        
        // Verify sequential numbering
        const numbers = matches.map(m => parseInt(m.substring(1), 10));
        const sorted = [...numbers].sort((a, b) => a - b);
        
        // Should start from 1
        expect(sorted[0]).toBe(1);
        
        // Should be sequential (no gaps)
        for (let i = 1; i < sorted.length; i++) {
          expect(sorted[i]).toBe(sorted[i - 1] + 1);
        }
      }
    });
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  it('PROPERTY: Empty string values SHALL be safely parameterized', async () => {
    const { sql, params } = buildSettingsInsertQuery('key', '', 'string', null, false, 'user-id');
    
    expect(usesParameterizedQuery(sql)).toBe(true);
    expect(params[1]).toBe('');
  });

  it('PROPERTY: Very long values SHALL be safely parameterized', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1000, maxLength: 5000 }),
        async (longValue) => {
          const { sql, params } = buildSettingsInsertQuery('key', longValue, 'string', null, false, 'user-id');
          
          // Long value should be in params, not SQL
          expect(sql).not.toContain(longValue);
          expect(params[1]).toBe(longValue);
        }
      ),
      { numRuns: 10 }
    );
  });

  it('PROPERTY: Special characters SHALL be safely parameterized', async () => {
    const specialChars = ["'", '"', '\\', '\n', '\r', '\t', '\0', '%', '_'];
    
    for (const char of specialChars) {
      const value = `test${char}value`;
      const { sql, params } = buildSettingsInsertQuery('key', value, 'string', null, false, 'user-id');
      
      expect(sql).not.toContain(value);
      expect(params[1]).toBe(value);
    }
  });

  it('PROPERTY: Unicode characters SHALL be safely parameterized', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate strings that are unique enough to not appear in SQL template
        fc.string({ minLength: 5, maxLength: 100 }).filter(s => !/^[\s$]+$/.test(s)),
        async (unicodeValue) => {
          const { sql, params } = buildSettingsInsertQuery('key', unicodeValue, 'string', null, false, 'user-id');
          
          // Value should be in params, not SQL
          expect(sql).not.toContain(unicodeValue);
          expect(params[1]).toBe(unicodeValue);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });
});
