// @vitest-environment node
/**
 * Bug Condition Exploration Test — SQL Parameterization & CSRF Refresh Bugs
 * Feature: production-site-fixes
 *
 * **Validates: Requirements 1.2, 1.3, 1.8, 1.9, 1.10, 1.12, 1.14, 1.25**
 *
 * Property 1: Fault Condition — SQL Parameterization & CSRF Refresh Bugs
 *
 * CRITICAL: These tests encode the EXPECTED (correct) behavior.
 * On UNFIXED code they MUST FAIL — failure confirms the bugs exist.
 * After the fix is applied, these tests MUST PASS.
 *
 * CONFIRMED BUGS (verified via raw file inspection):
 * - Bug 1: api-src/applications.ts line 280 handleCreate() — `${i + 1}` produces "1, 2, 3"
 *   instead of "$1, $2, $3" (missing literal $ before interpolation)
 * - Bug 2: api-src/auth.ts line 81 — csrfExemptActions does NOT include 'refresh'
 *
 * NOTE: Other suspected bugs (ApplicationQueries.update, handleDetails, handleExport,
 * handleProfile PATCH) were false positives — the source files use $$ (double dollar)
 * which correctly produces $N in output. The readFile tool was stripping the double dollar.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

// ── Helpers ─────────────────────────────────────────────────────────────

/** Regex that matches a valid Postgres $N parameter placeholder */
const DOLLAR_PARAM_RE = /\$\d+/;

describe('Bug Condition Exploration: SQL Parameterization & CSRF', () => {

  /**
   * Test 1a — ApplicationQueries.update() in lib/queries.ts
   * **Validates: Requirements 1.8, 1.9, 1.10, 1.12**
   *
   * Generates random subsets of allowed update fields, calls update(),
   * and asserts the SQL contains $N placeholders (not bare integers).
   *
   * NOTE: This code is actually CORRECT (uses $$paramIndex in source).
   * This test validates the correct behavior is preserved.
   */
  describe('Test 1a: ApplicationQueries.update() SQL parameterization', () => {
    it('should produce $N placeholders for all dynamic fields', async () => {
      const { ApplicationQueries } = await import('../../../lib/queries');

      const allowedFields = [
        'full_name', 'nrc_number', 'passport_number', 'date_of_birth', 'sex',
        'phone', 'email', 'residence_town', 'country', 'nationality',
        'next_of_kin_name', 'next_of_kin_phone', 'program', 'intake',
        'institution', 'result_slip_url', 'extra_kyc_url', 'payment_method',
        'payer_name', 'payer_phone', 'amount', 'paid_at', 'momo_ref',
        'pop_url', 'payment_status', 'status', 'submitted_at',
      ];

      const fieldSubsetArb = fc.subarray(allowedFields, { minLength: 1 })
        .map(fields => {
          const data: Record<string, unknown> = {};
          for (const f of fields) {
            data[f] = `test-value-${f}`;
          }
          return data;
        });

      await fc.assert(
        fc.property(fieldSubsetArb, (data) => {
          const result = ApplicationQueries.update('test-id', data);
          const sql = result.text;

          // For each field in data, the SQL should have "field = $N"
          const fieldCount = Object.keys(data).length;
          for (let i = 0; i < fieldCount; i++) {
            const paramNum = i + 2; // starts at $2 (id is $1)
            expect(sql).toContain(`$${paramNum}`);
          }
        }),
        { numRuns: 10 },
      );
    });
  });

  /**
   * Test 1b — handleCreate placeholder generation in api-src/applications.ts
   * **Validates: Requirements 1.10**
   *
   * Reads the actual source code to extract the placeholder generation logic,
   * then verifies it produces $N placeholders.
   *
   * BUG CONFIRMED: Line 280 uses `${i + 1}` which produces "1" not "$1".
   * The correct code should be `$${i + 1}` to produce "$1".
   */
  describe('Test 1b: handleCreate VALUES placeholder generation', () => {
    it('should produce $1, $2, $3 placeholders (not bare 1, 2, 3)', () => {
      // Read the actual source to extract the placeholder logic
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../../api-src/applications.ts'),
        'utf-8'
      );

      // Find the placeholder generation line
      const placeholderMatch = source.match(
        /const placeholders = values\.map\(\(_, i\) => `([^`]+)`\)\.join/
      );
      expect(placeholderMatch).not.toBeNull();

      // The template literal content should be "${i + 1}" with a literal $ before it
      // i.e., the source should contain: `$${i + 1}` (double dollar)
      // If it only has `${i + 1}` (single dollar), the bug exists
      const templateContent = placeholderMatch![1];

      // Generate random array sizes and verify the logic produces correct placeholders
      const arraySizeArb = fc.integer({ min: 1, max: 20 });

      fc.assert(
        fc.property(arraySizeArb, (count) => {
          const values = Array.from({ length: count }, (_, i) => `val${i}`);

          // Evaluate the template using the ACTUAL source pattern
          // The source has: `${i + 1}` — we need to check if it produces "$1" or "1"
          const placeholders = values.map((_, i) => {
            // Replicate what the source template literal does
            // If templateContent is "${i + 1}" → produces "1" (BUG)
            // If templateContent is "$${i + 1}" → produces "$1" (CORRECT)
            return eval('`' + templateContent.replace(/\$\{/g, '${') + '`');
          });

          // Each placeholder MUST start with $
          for (let i = 0; i < count; i++) {
            const placeholder = placeholders[i];
            expect(placeholder).toBe(`$${i + 1}`);
          }
        }),
        { numRuns: 10 },
      );
    });

    it('source code should use double-dollar for literal $ in template', () => {
      // Direct source inspection: the line should contain $$ before {i + 1}
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../../api-src/applications.ts'),
        'utf-8'
      );

      const lines = source.split('\n');
      const placeholderLine = lines.find(l => l.includes('const placeholders = values.map'));
      expect(placeholderLine).toBeDefined();

      // The line should contain the pattern: `$${i + 1}` (with double dollar)
      // NOT: `${i + 1}` (single dollar — this is the bug)
      expect(placeholderLine).toMatch(/`\$\$\{i \+ 1\}`/);
    });
  });


  /**
   * Test 1c — handleDetails filter conditions in api-src/applications.ts
   * **Validates: Requirements 1.8, 2.24**
   *
   * Verifies the source code uses $$ (double dollar) for parameter placeholders
   * in the handleDetails function's dynamic WHERE conditions.
   *
   * NOTE: This code is actually CORRECT (uses $$paramIndex in source).
   * This test validates the correct behavior is preserved.
   */
  describe('Test 1c: handleDetails filter conditions', () => {
    it('should use $$ for parameter placeholders in filter conditions', () => {
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../../api-src/applications.ts'),
        'utf-8'
      );

      // Find the handleDetails function region
      const handleDetailsStart = source.indexOf('async function handleDetails');
      expect(handleDetailsStart).toBeGreaterThan(-1);

      // Find the next function after handleDetails to bound the search
      const handleDetailsRegion = source.substring(
        handleDetailsStart,
        source.indexOf('async function', handleDetailsStart + 50)
      );

      // All conditions.push calls should use $${paramIndex} (double dollar)
      const conditionPushes = handleDetailsRegion.match(/conditions\.push\(`[^`]+`\)/g) || [];
      expect(conditionPushes.length).toBeGreaterThan(0);

      for (const push of conditionPushes) {
        // Skip static conditions like "IS NULL"
        if (push.includes('IS NULL')) continue;

        // Each dynamic condition should contain $$ before {paramIndex}
        // The pattern $${paramIndex} in source produces $N in output
        expect(push).toMatch(/\$\$\{paramIndex\}/);
      }
    });

    it('should use $$ for LIMIT/OFFSET in handleDetails', () => {
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../../api-src/applications.ts'),
        'utf-8'
      );

      const handleDetailsStart = source.indexOf('async function handleDetails');
      const handleDetailsRegion = source.substring(
        handleDetailsStart,
        source.indexOf('async function', handleDetailsStart + 50)
      );

      // LIMIT and OFFSET should use $${paramIndex}
      const limitMatch = handleDetailsRegion.match(/LIMIT \$?\$?\{paramIndex\}/);
      expect(limitMatch).not.toBeNull();
      expect(limitMatch![0]).toContain('$$');

      const offsetMatch = handleDetailsRegion.match(/OFFSET \$?\$?\{paramIndex \+ 1\}/);
      expect(offsetMatch).not.toBeNull();
      expect(offsetMatch![0]).toContain('$$');
    });
  });

  /**
   * Test 1d — handleExport filter conditions in api-src/applications.ts
   * **Validates: Requirements 1.25, 2.25**
   *
   * Same pattern as handleDetails — verify source uses $$ for placeholders.
   *
   * NOTE: This code is actually CORRECT (uses $$paramIndex in source).
   */
  describe('Test 1d: handleExport filter conditions', () => {
    it('should use $$ for parameter placeholders in export filter conditions', () => {
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../../api-src/applications.ts'),
        'utf-8'
      );

      const handleExportStart = source.indexOf('async function handleExport');
      expect(handleExportStart).toBeGreaterThan(-1);

      // Get the handleExport region (up to the next top-level function or end)
      const afterExport = source.substring(handleExportStart);
      const nextFuncIdx = afterExport.indexOf('\nasync function', 50);
      const handleExportRegion = nextFuncIdx > 0
        ? afterExport.substring(0, nextFuncIdx)
        : afterExport;

      const conditionPushes = handleExportRegion.match(/conditions\.push\(`[^`]+`\)/g) || [];
      expect(conditionPushes.length).toBeGreaterThan(0);

      for (const push of conditionPushes) {
        if (push.includes('IS NULL')) continue;
        expect(push).toMatch(/\$\$\{paramIndex\}/);
      }
    });

    it('should use $$ for LIMIT/OFFSET in handleExport', () => {
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../../api-src/applications.ts'),
        'utf-8'
      );

      const handleExportStart = source.indexOf('async function handleExport');
      const afterExport = source.substring(handleExportStart);

      // Find LIMIT/OFFSET pattern
      const limitLine = afterExport.match(/LIMIT \$?\$?\{paramIndex\}.*OFFSET \$?\$?\{paramIndex \+ 1\}/);
      expect(limitLine).not.toBeNull();
      expect(limitLine![0]).toMatch(/LIMIT \$\$\{paramIndex\}/);
      expect(limitLine![0]).toMatch(/OFFSET \$\$\{paramIndex \+ 1\}/);
    });
  });

  /**
   * Test 1e — handleProfile PATCH in api-src/auth.ts
   * **Validates: Requirements 1.3, 1.16**
   *
   * Verifies the source code uses $$ for SET clause and WHERE clause
   * parameter placeholders in the handleProfile PATCH branch.
   *
   * NOTE: This code is actually CORRECT (uses $$index and $$providedFields in source).
   */
  describe('Test 1e: handleProfile PATCH SQL parameterization', () => {
    it('should use $$ for SET clause placeholders', () => {
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../../api-src/auth.ts'),
        'utf-8'
      );

      // Find the SET clause generation in handleProfile
      // The line should be: return `${field} = $${index + 1}`;
      const setClauseLine = source.match(/return `\$\{field\} = \$?\$?\{index \+ 1\}`/);
      expect(setClauseLine).not.toBeNull();
      expect(setClauseLine![0]).toContain('$$');
    });

    it('should use $$ for WHERE clause placeholder', () => {
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../../api-src/auth.ts'),
        'utf-8'
      );

      // Find the WHERE clause: WHERE id = $${providedFields.length + 1}
      const whereMatch = source.match(/WHERE id = \$?\$?\{providedFields\.length \+ 1\}/);
      expect(whereMatch).not.toBeNull();
      expect(whereMatch![0]).toContain('$$');
    });
  });

  /**
   * Test 1f — CSRF exempt actions in api-src/auth.ts
   * **Validates: Requirements 1.2**
   *
   * Reads the csrfExemptActions array from auth.ts source and asserts
   * 'refresh' is included.
   *
   * BUG CONFIRMED: csrfExemptActions does NOT include 'refresh'.
   */
  describe('Test 1f: CSRF exempt actions include refresh', () => {
    it('should include refresh in csrfExemptActions', () => {
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../../api-src/auth.ts'),
        'utf-8'
      );

      // Find the csrfExemptActions definition
      const match = source.match(/csrfExemptActions\s*=\s*\[([^\]]+)\]/);
      expect(match).not.toBeNull();

      const actionsStr = match![1];
      const actions = actionsStr
        .split(',')
        .map(s => s.trim().replace(/['"]/g, ''))
        .filter(s => s.length > 0);

      // 'refresh' MUST be in the exempt list
      expect(actions).toContain('refresh');
    });
  });
});
