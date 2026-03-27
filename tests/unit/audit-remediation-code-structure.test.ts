// @vitest-environment node
/**
 * Unit Tests for Audit Remediation — Code Structure Verification
 *
 * Verifies that dead code has been removed and structural requirements are met.
 *
 * Requirements: 1.4, 6.1, 6.2, 6.3
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const LIB_DB_PATH = path.resolve(__dirname, '../../lib/db.ts');

describe('Audit Remediation — Dead Code Removal (R6)', () => {
  const dbSource = fs.readFileSync(LIB_DB_PATH, 'utf-8');

  describe('R6.1: interpolateParams removed', () => {
    it('lib/db.ts should not contain the interpolateParams function', () => {
      expect(dbSource).not.toMatch(/function\s+interpolateParams/);
    });

    it('lib/db.ts should not export interpolateParams', () => {
      expect(dbSource).not.toMatch(/export\s+.*interpolateParams/);
    });
  });

  describe('R6.2: Duplicate query builders removed', () => {
    it('lib/db.ts should not export userQueries', () => {
      expect(dbSource).not.toMatch(/export\s+(const|let|var)\s+userQueries\b/);
    });

    it('lib/db.ts should not export sessionQueries', () => {
      expect(dbSource).not.toMatch(/export\s+(const|let|var)\s+sessionQueries\b/);
    });

    it('lib/db.ts should not export auditQueries', () => {
      expect(dbSource).not.toMatch(/export\s+(const|let|var)\s+auditQueries\b/);
    });
  });

  describe('R1.4: Manual BEGIN/COMMIT/ROLLBACK removed', () => {
    it('lib/db.ts should not contain BEGIN query strings', () => {
      // Match actual query calls like query('BEGIN') or query("BEGIN")
      expect(dbSource).not.toMatch(/query\s*\(\s*['"`]BEGIN['"`]\s*\)/);
    });

    it('lib/db.ts should not contain COMMIT query strings', () => {
      expect(dbSource).not.toMatch(/query\s*\(\s*['"`]COMMIT['"`]\s*\)/);
    });

    it('lib/db.ts should not contain ROLLBACK query strings', () => {
      expect(dbSource).not.toMatch(/query\s*\(\s*['"`]ROLLBACK['"`]\s*\)/);
    });
  });

  describe('R1/R9: Neon transaction API and cached instance', () => {
    it('lib/db.ts should use sql.transaction() callback API', () => {
      expect(dbSource).toMatch(/\.transaction\s*\(/);
    });

    it('lib/db.ts should have a getNeonInstance function for caching', () => {
      expect(dbSource).toMatch(/function\s+getNeonInstance/);
    });

    it('lib/db.ts should have a module-level cachedSql variable', () => {
      expect(dbSource).toMatch(/let\s+cachedSql/);
    });
  });

  describe('Preserved exports', () => {
    it('lib/db.ts should export query function', () => {
      expect(dbSource).toMatch(/export\s+async\s+function\s+query/);
    });

    it('lib/db.ts should export transaction function', () => {
      expect(dbSource).toMatch(/export\s+async\s+function\s+transaction/);
    });

    it('lib/db.ts should export QueryConfig interface', () => {
      expect(dbSource).toMatch(/export\s+interface\s+QueryConfig/);
    });

    it('lib/db.ts should export QueryResult interface', () => {
      expect(dbSource).toMatch(/export\s+interface\s+QueryResult/);
    });

    it('lib/db.ts should export DatabaseError class', () => {
      expect(dbSource).toMatch(/export\s+class\s+DatabaseError/);
    });

    it('lib/db.ts should export DatabaseErrorCode', () => {
      expect(dbSource).toMatch(/export\s+const\s+DatabaseErrorCode/);
    });

    it('lib/db.ts should export verifyDatabaseSchema function', () => {
      expect(dbSource).toMatch(/export\s+async\s+function\s+verifyDatabaseSchema/);
    });
  });
});


// ---------------------------------------------------------------------------
// R2: Hardcoded Admin Email Bypass Removed
// Requirements: 2.1
// ---------------------------------------------------------------------------

const ADMIN_ROUTE_PATH = path.resolve(__dirname, '../../src/components/AdminRoute.tsx');

describe('Audit Remediation — Hardcoded Email Bypass Removed (R2)', () => {
  const adminRouteSource = fs.readFileSync(ADMIN_ROUTE_PATH, 'utf-8');

  describe('R2.1: No hardcoded email strings in AdminRoute', () => {
    it('AdminRoute.tsx should not contain cosmas@beanola.com', () => {
      expect(adminRouteSource).not.toContain('cosmas@beanola.com');
    });

    it('AdminRoute.tsx should not contain any email-based access check', () => {
      expect(adminRouteSource).not.toMatch(/user\.email\s*===\s*['"`]/);
    });

    it('AdminRoute.tsx should not contain any email-based negated check', () => {
      expect(adminRouteSource).not.toMatch(/user\.email\s*!==\s*['"`]/);
    });

    it('AdminRoute.tsx should still check isAdmin for access control', () => {
      expect(adminRouteSource).toMatch(/!isAdmin/);
    });
  });
});


// ---------------------------------------------------------------------------
// R3: Parameterized SQL Queries in Auth Handler
// Requirements: 3.4
// ---------------------------------------------------------------------------

const AUTH_HANDLER_PATH = path.resolve(__dirname, '../../api-src/auth.ts');

describe('Audit Remediation — Parameterized SQL in Auth Handler (R3)', () => {
  const authSource = fs.readFileSync(AUTH_HANDLER_PATH, 'utf-8');

  describe('R3.4: Zero SQL template literal interpolation in auth.ts', () => {
    it('auth.ts should not contain ${...} inside INTERVAL SQL clauses', () => {
      // Match INTERVAL followed by a template literal interpolation
      expect(authSource).not.toMatch(/INTERVAL\s*'\$\{/);
    });

    it('auth.ts should not interpolate JS variables into SQL INTERVAL expressions', () => {
      // Specifically targets the R3 finding: INTERVAL '${SOME_VAR} minutes' patterns
      // This must NOT match dynamic SET clause construction (Task 11) which builds $N placeholders
      expect(authSource).not.toMatch(/INTERVAL\s*['"`]\$\{/);
    });

    it('auth.ts should use parameterized INTERVAL pattern for login cooldown', () => {
      expect(authSource).toMatch(/INTERVAL\s+'1 minute'\s*\*\s*\$\d/);
    });
  });
});
