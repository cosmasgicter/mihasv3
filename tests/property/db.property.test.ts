/**
 * Property-Based Tests: Database Abstraction Layer
 * Feature: auth-security-hardening
 * Task: 1.4 Write property tests for database abstraction
 * 
 * **Property 1: Parameterized queries prevent SQL injection**
 * 
 * *For any* user input containing SQL injection patterns, the query builder
 * SHALL escape or parameterize the input such that:
 * - The values array contains the raw input (not interpolated into query text)
 * - The query text does not contain the raw injection string
 * - The query uses positional parameters ($1, $2, etc.)
 * 
 * **Validates: Requirements 6.2**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { UserQueries, SessionQueries, AuditQueries } from '../../api/_lib/queries';
import type { QueryConfig } from '../../api/_lib/db';

// ============================================================================
// SQL Injection Pattern Examples
// These represent common attack vectors that must be safely parameterized
// ============================================================================

/**
 * Classic SQL injection patterns
 */
const classicInjectionPatterns = [
  "'; DROP TABLE users; --",
  "' OR '1'='1",
  "' OR '1'='1' --",
  "'; DELETE FROM profiles WHERE '1'='1",
  "\\'; INSERT INTO profiles VALUES ('hacked'); --",
  "' UNION SELECT * FROM profiles --",
  "'; UPDATE profiles SET role='super_admin' WHERE '1'='1'; --",
  "1; DROP TABLE device_sessions;",
  "admin'--",
  "' OR 1=1--",
  "') OR ('1'='1",
  "'; TRUNCATE TABLE audit_logs; --",
];

/**
 * Unicode and encoded injection attempts
 */
const unicodeInjectionPatterns = [
  "'; DROP TABLE users; \u002D\u002D",  // Unicode dashes
  "' OR '\u0031'='\u0031",              // Unicode digits
  "\u0027 OR \u00271\u0027=\u00271",    // Unicode quotes
  "admin\u0027--",                       // Unicode apostrophe
  "'; SELECT * FROM profiles WHERE email LIKE '%\u0025'; --",
];

/**
 * Nested and complex injection patterns
 */
const complexInjectionPatterns = [
  "'; BEGIN; DROP TABLE users; COMMIT; --",
  "'; DECLARE @x VARCHAR(100); SET @x='DROP'; --",
  "' AND (SELECT COUNT(*) FROM profiles) > 0 --",
  "'; COPY profiles TO '/tmp/dump.csv'; --",
  "' AND EXTRACTVALUE(1, CONCAT(0x7e, (SELECT password_hash FROM profiles LIMIT 1))) --",
  "'; SELECT pg_sleep(10); --",
  "' AND 1=(SELECT COUNT(*) FROM information_schema.tables) --",
];

/**
 * Edge case inputs that might break naive escaping
 */
const edgeCaseInputs = [
  "",                                    // Empty string
  " ",                                   // Single space
  "   ",                                 // Multiple spaces
  "\n",                                  // Newline
  "\t",                                  // Tab
  "\r\n",                                // CRLF
  "\\",                                  // Single backslash
  "\\\\",                                // Double backslash
  "'",                                   // Single quote
  "''",                                  // Escaped single quote
  "'''",                                 // Triple quote
  '"',                                   // Double quote
  '""',                                  // Escaped double quote
  "`",                                   // Backtick
  "NULL",                                // SQL keyword
  "null",                                // Lowercase null
  "TRUE",                                // SQL boolean
  "FALSE",                               // SQL boolean
  "0",                                   // Zero
  "-1",                                  // Negative number
  "9999999999999999999999999999",        // Very large number
  "a".repeat(10000),                     // Very long string
  "test@example.com",                    // Email format
  "123e4567-e89b-12d3-a456-426614174000", // UUID format
];

/**
 * All injection patterns combined for comprehensive testing
 */
const allInjectionPatterns = [
  ...classicInjectionPatterns,
  ...unicodeInjectionPatterns,
  ...complexInjectionPatterns,
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a QueryConfig properly parameterizes the given input
 * Returns true if the input is safely parameterized
 */
function isProperlyParameterized(queryConfig: QueryConfig, inputValue: unknown): boolean {
  const { text, values } = queryConfig;
  
  // The input value should be in the values array
  const valueInArray = values?.some(v => v === inputValue);
  
  // The raw input should NOT appear in the query text (unless it's a very short/common string)
  // We check for strings longer than 2 chars to avoid false positives with common SQL keywords
  const inputStr = String(inputValue);
  const rawInputInText = inputStr.length > 2 && text.includes(inputStr);
  
  // Query should use positional parameters ($1, $2, etc.)
  const usesPositionalParams = /\$\d+/.test(text);
  
  return valueInArray && !rawInputInText && usesPositionalParams;
}

/**
 * Check if a QueryConfig uses positional parameters
 */
function usesPositionalParameters(queryConfig: QueryConfig): boolean {
  return /\$\d+/.test(queryConfig.text);
}

/**
 * Check if the query text contains dangerous SQL patterns
 * This checks if injection strings leaked into the query text
 */
function containsDangerousPatterns(queryText: string, injectionInput: string): boolean {
  // Skip very short inputs that might legitimately appear in SQL
  if (injectionInput.length <= 2) return false;
  
  // Check if the injection string appears verbatim in the query
  return queryText.includes(injectionInput);
}

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 1: Parameterized queries prevent SQL injection', () => {
  /**
   * **Validates: Requirements 6.2**
   */
  describe('UserQueries - SQL Injection Prevention', () => {
    it('PROPERTY: findByEmail parameterizes email input containing injection patterns', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...allInjectionPatterns),
          (maliciousEmail) => {
            const queryConfig = UserQueries.findByEmail(maliciousEmail);
            
            // Query must use positional parameters
            expect(usesPositionalParameters(queryConfig)).toBe(true);
            
            // The malicious input must be in the values array, not in the query text
            expect(queryConfig.values).toContain(maliciousEmail);
            
            // The raw injection string should not appear in the query text
            expect(containsDangerousPatterns(queryConfig.text, maliciousEmail)).toBe(false);
            
            // Query text should contain $1 placeholder
            expect(queryConfig.text).toContain('$1');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PROPERTY: findById parameterizes ID input containing injection patterns', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...allInjectionPatterns),
          (maliciousId) => {
            const queryConfig = UserQueries.findById(maliciousId);
            
            expect(usesPositionalParameters(queryConfig)).toBe(true);
            expect(queryConfig.values).toContain(maliciousId);
            expect(containsDangerousPatterns(queryConfig.text, maliciousId)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PROPERTY: create parameterizes all user input fields', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...allInjectionPatterns),
          fc.constantFrom(...allInjectionPatterns),
          fc.constantFrom(...allInjectionPatterns),
          (maliciousEmail, maliciousFirstName, maliciousLastName) => {
            const queryConfig = UserQueries.create(
              'test-id',
              maliciousEmail,
              'hashed-password',
              'student',
              maliciousFirstName,
              maliciousLastName
            );
            
            expect(usesPositionalParameters(queryConfig)).toBe(true);
            expect(queryConfig.values).toContain(maliciousEmail);
            expect(queryConfig.values).toContain(maliciousFirstName);
            expect(queryConfig.values).toContain(maliciousLastName);
            expect(containsDangerousPatterns(queryConfig.text, maliciousEmail)).toBe(false);
            expect(containsDangerousPatterns(queryConfig.text, maliciousFirstName)).toBe(false);
            expect(containsDangerousPatterns(queryConfig.text, maliciousLastName)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PROPERTY: updatePassword parameterizes password hash input', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...allInjectionPatterns),
          (maliciousHash) => {
            const queryConfig = UserQueries.updatePassword('test-id', maliciousHash);
            
            expect(usesPositionalParameters(queryConfig)).toBe(true);
            expect(queryConfig.values).toContain(maliciousHash);
            expect(containsDangerousPatterns(queryConfig.text, maliciousHash)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PROPERTY: updateRefreshToken parameterizes token hash input', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...allInjectionPatterns),
          (maliciousToken) => {
            const queryConfig = UserQueries.updateRefreshToken('test-id', maliciousToken);
            
            expect(usesPositionalParameters(queryConfig)).toBe(true);
            expect(queryConfig.values).toContain(maliciousToken);
            expect(containsDangerousPatterns(queryConfig.text, maliciousToken)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PROPERTY: findByRefreshToken parameterizes token hash input', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...allInjectionPatterns),
          (maliciousToken) => {
            const queryConfig = UserQueries.findByRefreshToken(maliciousToken);
            
            expect(usesPositionalParameters(queryConfig)).toBe(true);
            expect(queryConfig.values).toContain(maliciousToken);
            expect(containsDangerousPatterns(queryConfig.text, maliciousToken)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('SessionQueries - SQL Injection Prevention', () => {
    /**
     * **Validates: Requirements 6.2**
     */
    it('PROPERTY: create parameterizes all session input fields', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...allInjectionPatterns),
          fc.constantFrom(...allInjectionPatterns),
          fc.constantFrom(...allInjectionPatterns),
          (maliciousId, maliciousIp, maliciousUserAgent) => {
            const queryConfig = SessionQueries.create(
              maliciousId,
              'user-id',
              { browser: 'test' },
              maliciousIp,
              maliciousUserAgent
            );
            
            expect(usesPositionalParameters(queryConfig)).toBe(true);
            expect(queryConfig.values).toContain(maliciousId);
            expect(queryConfig.values).toContain(maliciousIp);
            expect(queryConfig.values).toContain(maliciousUserAgent);
            expect(containsDangerousPatterns(queryConfig.text, maliciousId)).toBe(false);
            expect(containsDangerousPatterns(queryConfig.text, maliciousIp)).toBe(false);
            expect(containsDangerousPatterns(queryConfig.text, maliciousUserAgent)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PROPERTY: findById parameterizes session ID input', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...allInjectionPatterns),
          (maliciousId) => {
            const queryConfig = SessionQueries.findById(maliciousId);
            
            expect(usesPositionalParameters(queryConfig)).toBe(true);
            expect(queryConfig.values).toContain(maliciousId);
            expect(containsDangerousPatterns(queryConfig.text, maliciousId)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PROPERTY: deactivate parameterizes session ID input', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...allInjectionPatterns),
          (maliciousId) => {
            const queryConfig = SessionQueries.deactivate(maliciousId);
            
            expect(usesPositionalParameters(queryConfig)).toBe(true);
            expect(queryConfig.values).toContain(maliciousId);
            expect(containsDangerousPatterns(queryConfig.text, maliciousId)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PROPERTY: deactivateAllForUser parameterizes user ID input', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...allInjectionPatterns),
          (maliciousUserId) => {
            const queryConfig = SessionQueries.deactivateAllForUser(maliciousUserId);
            
            expect(usesPositionalParameters(queryConfig)).toBe(true);
            expect(queryConfig.values).toContain(maliciousUserId);
            expect(containsDangerousPatterns(queryConfig.text, maliciousUserId)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PROPERTY: getActiveForUser parameterizes user ID input', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...allInjectionPatterns),
          (maliciousUserId) => {
            const queryConfig = SessionQueries.getActiveForUser(maliciousUserId);
            
            expect(usesPositionalParameters(queryConfig)).toBe(true);
            expect(queryConfig.values).toContain(maliciousUserId);
            expect(containsDangerousPatterns(queryConfig.text, maliciousUserId)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('AuditQueries - SQL Injection Prevention', () => {
    /**
     * **Validates: Requirements 6.2**
     */
    it('PROPERTY: log parameterizes all audit input fields', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...allInjectionPatterns),
          fc.constantFrom(...allInjectionPatterns),
          fc.constantFrom(...allInjectionPatterns),
          (maliciousActorId, maliciousEntityId, maliciousIp) => {
            const queryConfig = AuditQueries.log({
              actor_id: maliciousActorId,
              action: 'user_login',
              entity_type: 'user',
              entity_id: maliciousEntityId,
              ip_address: maliciousIp,
              user_agent: 'test-agent',
            });
            
            expect(usesPositionalParameters(queryConfig)).toBe(true);
            expect(queryConfig.values).toContain(maliciousActorId);
            expect(queryConfig.values).toContain(maliciousEntityId);
            expect(queryConfig.values).toContain(maliciousIp);
            expect(containsDangerousPatterns(queryConfig.text, maliciousActorId)).toBe(false);
            expect(containsDangerousPatterns(queryConfig.text, maliciousEntityId)).toBe(false);
            expect(containsDangerousPatterns(queryConfig.text, maliciousIp)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PROPERTY: logAuthEvent parameterizes actor ID and IP address', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...allInjectionPatterns),
          fc.constantFrom(...allInjectionPatterns),
          (maliciousActorId, maliciousIp) => {
            const queryConfig = AuditQueries.logAuthEvent(
              maliciousActorId,
              'user_login',
              true,
              maliciousIp,
              'test-agent'
            );
            
            expect(usesPositionalParameters(queryConfig)).toBe(true);
            expect(queryConfig.values).toContain(maliciousActorId);
            expect(queryConfig.values).toContain(maliciousIp);
            expect(containsDangerousPatterns(queryConfig.text, maliciousActorId)).toBe(false);
            expect(containsDangerousPatterns(queryConfig.text, maliciousIp)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PROPERTY: getForEntity parameterizes entity ID input', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...allInjectionPatterns),
          (maliciousEntityId) => {
            const queryConfig = AuditQueries.getForEntity('user', maliciousEntityId);
            
            expect(usesPositionalParameters(queryConfig)).toBe(true);
            expect(queryConfig.values).toContain(maliciousEntityId);
            expect(containsDangerousPatterns(queryConfig.text, maliciousEntityId)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PROPERTY: getByActor parameterizes actor ID input', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...allInjectionPatterns),
          (maliciousActorId) => {
            const queryConfig = AuditQueries.getByActor(maliciousActorId);
            
            expect(usesPositionalParameters(queryConfig)).toBe(true);
            expect(queryConfig.values).toContain(maliciousActorId);
            expect(containsDangerousPatterns(queryConfig.text, maliciousActorId)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Edge Cases - SQL Injection Prevention', () => {
    /**
     * **Validates: Requirements 6.2**
     */
    it('PROPERTY: Empty strings are safely parameterized', () => {
      const queryConfig = UserQueries.findByEmail('');
      
      expect(usesPositionalParameters(queryConfig)).toBe(true);
      expect(queryConfig.values).toContain('');
    });

    it('PROPERTY: Very long strings are safely parameterized', () => {
      const longString = 'a'.repeat(10000);
      const queryConfig = UserQueries.findByEmail(longString);
      
      expect(usesPositionalParameters(queryConfig)).toBe(true);
      expect(queryConfig.values).toContain(longString);
      expect(queryConfig.text).not.toContain(longString);
    });

    it('PROPERTY: Special characters are safely parameterized', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...edgeCaseInputs),
          (edgeCase) => {
            const queryConfig = UserQueries.findByEmail(edgeCase);
            
            expect(usesPositionalParameters(queryConfig)).toBe(true);
            expect(queryConfig.values).toContain(edgeCase);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PROPERTY: Null values for optional parameters are handled', () => {
      const queryConfig = UserQueries.updateRefreshToken('test-id', null);
      
      expect(usesPositionalParameters(queryConfig)).toBe(true);
      expect(queryConfig.values).toContain(null);
    });

    it('PROPERTY: Unicode injection attempts are safely parameterized', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...unicodeInjectionPatterns),
          (unicodeInjection) => {
            const queryConfig = UserQueries.findByEmail(unicodeInjection);
            
            expect(usesPositionalParameters(queryConfig)).toBe(true);
            expect(queryConfig.values).toContain(unicodeInjection);
            expect(containsDangerousPatterns(queryConfig.text, unicodeInjection)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('QueryConfig Structure Validation', () => {
    /**
     * **Validates: Requirements 6.2**
     */
    it('PROPERTY: All query configs have text and values properties', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...allInjectionPatterns),
          (input) => {
            const queryConfig = UserQueries.findByEmail(input);
            
            expect(queryConfig).toHaveProperty('text');
            expect(queryConfig).toHaveProperty('values');
            expect(typeof queryConfig.text).toBe('string');
            expect(Array.isArray(queryConfig.values)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PROPERTY: Values array length matches parameter count in query', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...allInjectionPatterns),
          (input) => {
            const queryConfig = UserQueries.findByEmail(input);
            
            // Count $N placeholders in query
            const paramMatches = queryConfig.text.match(/\$\d+/g) || [];
            const uniqueParams = new Set(paramMatches);
            
            // Values array should have at least as many values as unique parameters
            expect(queryConfig.values?.length).toBeGreaterThanOrEqual(uniqueParams.size);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PROPERTY: Query text does not contain string concatenation with user input', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...allInjectionPatterns),
          (maliciousInput) => {
            const queryConfig = UserQueries.findByEmail(maliciousInput);
            
            // The query text should be a static template, not dynamically built
            // Check that the malicious input is NOT in the query text
            if (maliciousInput.length > 2) {
              expect(queryConfig.text).not.toContain(maliciousInput);
            }
            
            // The input should be in the values array
            expect(queryConfig.values).toContain(maliciousInput);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Arbitrary String Generation - Comprehensive Testing', () => {
    /**
     * **Validates: Requirements 6.2**
     * 
     * This test uses fast-check's arbitrary string generation to test
     * with truly random inputs, not just predefined patterns.
     */
    it('PROPERTY: Any arbitrary string is safely parameterized in findByEmail', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 1000 }),
          (arbitraryInput) => {
            const queryConfig = UserQueries.findByEmail(arbitraryInput);
            
            expect(usesPositionalParameters(queryConfig)).toBe(true);
            expect(queryConfig.values).toContain(arbitraryInput);
            
            // For non-trivial strings, verify they don't appear in query text
            if (arbitraryInput.length > 2) {
              expect(queryConfig.text).not.toContain(arbitraryInput);
            }
          }
        ),
        { numRuns: 500 }
      );
    });

    it('PROPERTY: Any arbitrary string is safely parameterized in create', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 500 }),
          fc.string({ minLength: 0, maxLength: 500 }),
          fc.string({ minLength: 0, maxLength: 500 }),
          (email, firstName, lastName) => {
            const queryConfig = UserQueries.create(
              'test-id',
              email,
              'hashed-password',
              'student',
              firstName,
              lastName
            );
            
            expect(usesPositionalParameters(queryConfig)).toBe(true);
            expect(queryConfig.values).toContain(email);
            expect(queryConfig.values).toContain(firstName);
            expect(queryConfig.values).toContain(lastName);
          }
        ),
        { numRuns: 200 }
      );
    });

    it('PROPERTY: Strings with SQL keywords are safely parameterized', () => {
      const sqlKeywords = [
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE',
        'ALTER', 'TRUNCATE', 'GRANT', 'REVOKE', 'BEGIN', 'COMMIT',
        'ROLLBACK', 'WHERE', 'FROM', 'JOIN', 'UNION', 'AND', 'OR',
        'NOT', 'NULL', 'TRUE', 'FALSE', 'LIKE', 'IN', 'EXISTS',
      ];
      
      fc.assert(
        fc.property(
          fc.constantFrom(...sqlKeywords),
          fc.string({ minLength: 0, maxLength: 50 }),
          (keyword, suffix) => {
            const input = `${keyword} ${suffix}`;
            const queryConfig = UserQueries.findByEmail(input);
            
            expect(usesPositionalParameters(queryConfig)).toBe(true);
            expect(queryConfig.values).toContain(input);
          }
        ),
        { numRuns: 200 }
      );
    });
  });
});
