// @vitest-environment node
/**
 * Preservation Property Tests — Static Queries, Auth Flows & CSRF Enforcement
 * Feature: production-site-fixes
 *
 * **Validates: Requirements 3.1, 3.2, 3.6, 3.7, 3.8, 3.9, 3.11, 3.12**
 *
 * Property 2: Preservation — these tests verify existing correct behavior
 * that MUST remain unchanged after the bugfix is applied.
 *
 * IMPORTANT: These tests MUST PASS on unfixed code.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

// ── Helpers ─────────────────────────────────────────────────────────────

/** UUID v4 arbitrary for generating random valid IDs */
const uuidArb = fc.uuid();

describe('Preservation: Static Queries, Auth Flows & CSRF Enforcement', () => {

  // ────────────────────────────────────────────────────────────────────
  // Test 2a — Static query preservation
  // **Validates: Requirements 3.2, 3.6**
  //
  // Static query builders (findById, delete, findByApplicationId) already
  // produce correct $1 parameterized SQL. This must remain true after fix.
  // ────────────────────────────────────────────────────────────────────
  describe('Test 2a: Static query preservation', () => {
    it('ApplicationQueries.findById SQL contains $1 for any UUID', async () => {
      const { ApplicationQueries } = await import('../../../lib/queries');

      fc.assert(
        fc.property(uuidArb, (id) => {
          const result = ApplicationQueries.findById(id);
          expect(result.text).toContain('$1');
          expect(result.values).toEqual([id]);
        }),
        { numRuns: 10 },
      );
    });

    it('ApplicationQueries.delete SQL contains $1 for any UUID', async () => {
      const { ApplicationQueries } = await import('../../../lib/queries');

      fc.assert(
        fc.property(uuidArb, (id) => {
          const result = ApplicationQueries.delete(id);
          expect(result.text).toContain('$1');
          expect(result.values).toEqual([id]);
        }),
        { numRuns: 10 },
      );
    });

    it('DocumentQueries.findByApplicationId SQL contains $1 for any UUID', async () => {
      const { DocumentQueries } = await import('../../../lib/queries');

      fc.assert(
        fc.property(uuidArb, (id) => {
          const result = DocumentQueries.findByApplicationId(id);
          expect(result.text).toContain('$1');
          expect(result.values).toEqual([id]);
        }),
        { numRuns: 10 },
      );
    });

    it('GradeQueries.findByApplicationId SQL contains $1 for any UUID', async () => {
      const { GradeQueries } = await import('../../../lib/queries');

      fc.assert(
        fc.property(uuidArb, (id) => {
          const result = GradeQueries.findByApplicationId(id);
          expect(result.text).toContain('$1');
          expect(result.values).toEqual([id]);
        }),
        { numRuns: 10 },
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Test 2b — CSRF exempt list preservation
  // **Validates: Requirements 3.7**
  //
  // The csrfExemptActions list in api-src/auth.ts currently includes
  // login, register, forgot-password, reset-password, password-reset-request,
  // password-reset. These must remain exempt after the fix.
  // ────────────────────────────────────────────────────────────────────
  describe('Test 2b: CSRF exempt list preservation', () => {
    it('csrfExemptActions includes all currently exempt actions', () => {
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../../api-src/auth.ts'),
        'utf-8'
      );

      const match = source.match(/csrfExemptActions\s*=\s*\[([^\]]+)\]/);
      expect(match).not.toBeNull();

      const actionsStr = match![1];
      const actions = actionsStr
        .split(',')
        .map(s => s.trim().replace(/['"]/g, ''))
        .filter(s => s.length > 0);

      // These actions MUST remain exempt (they are unauthenticated flows)
      const requiredExemptActions = [
        'login',
        'register',
        'forgot-password',
        'reset-password',
        'password-reset-request',
        'password-reset',
      ];

      for (const action of requiredExemptActions) {
        expect(actions).toContain(action);
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Test 2c — Response envelope preservation
  // **Validates: Requirements 3.9**
  //
  // sendSuccess() and sendError() must continue to produce the standard
  // { success: boolean, data/error } envelope format.
  // ────────────────────────────────────────────────────────────────────
  describe('Test 2c: Response envelope preservation', () => {
    it('sendSuccess produces { success: true, data: ... } envelope', async () => {
      const { sendSuccess } = await import('../../../lib/errorHandler');

      const dataArb = fc.oneof(
        fc.string(),
        fc.integer(),
        fc.record({ key: fc.string(), value: fc.integer() }),
        fc.array(fc.string(), { maxLength: 5 }),
      );

      fc.assert(
        fc.property(dataArb, (data) => {
          let capturedStatus: number | undefined;
          let capturedBody: unknown;

          const mockRes = {
            setHeader: () => mockRes,
            status: (code: number) => {
              capturedStatus = code;
              return mockRes;
            },
            json: (body: unknown) => {
              capturedBody = body;
              return mockRes;
            },
          } as any;

          sendSuccess(mockRes, data);

          expect(capturedStatus).toBe(200);
          expect(capturedBody).toEqual({ success: true, data });
        }),
        { numRuns: 10 },
      );
    });

    it('sendError produces { success: false, error: ... } envelope', async () => {
      const { sendError } = await import('../../../lib/errorHandler');

      // Generate simple alphanumeric messages to avoid sanitization edge cases
      const messageArb = fc.array(
        fc.constantFrom(
          'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
          'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
          ' ', '.', '!',
        ),
        { minLength: 1, maxLength: 50 },
      ).map(chars => chars.join(''));

      fc.assert(
        fc.property(messageArb, (message) => {
          let capturedStatus: number | undefined;
          let capturedBody: any;

          const mockRes = {
            setHeader: () => mockRes,
            status: (code: number) => {
              capturedStatus = code;
              return mockRes;
            },
            json: (body: unknown) => {
              capturedBody = body;
              return mockRes;
            },
          } as any;

          sendError(mockRes, message);

          expect(capturedStatus).toBe(400);
          expect(capturedBody).toHaveProperty('success', false);
          expect(capturedBody).toHaveProperty('error');
          expect(typeof capturedBody.error).toBe('string');
          expect(capturedBody).toHaveProperty('code');
        }),
        { numRuns: 10 },
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Test 2d — Correct SQL parameterization preservation (already correct code)
  // **Validates: Requirements 3.2, 3.8**
  //
  // These functions already use correct $$ parameterization in source.
  // Verify they produce $N placeholders and must remain correct after fix.
  // ────────────────────────────────────────────────────────────────────
  describe('Test 2d: Correct SQL parameterization preservation', () => {
    it('ApplicationQueries.update() produces $N placeholders for dynamic fields', async () => {
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
          for (const f of fields) data[f] = `val-${f}`;
          return { data, count: fields.length };
        });

      fc.assert(
        fc.property(fieldSubsetArb, ({ data, count }) => {
          const result = ApplicationQueries.update('test-id', data);
          const sql = result.text;

          // Each dynamic field should have $N (starting at $2, since $1 is id)
          for (let i = 0; i < count; i++) {
            const paramNum = i + 2;
            expect(sql).toContain(`$${paramNum}`);
          }

          // Values array: [id, ...field_values]
          expect(result.values!.length).toBe(count + 1);
          expect(result.values![0]).toBe('test-id');
        }),
        { numRuns: 10 },
      );
    });

    it('handleDetails in api-src/applications.ts uses $$ for paramIndex in source', () => {
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../../api-src/applications.ts'),
        'utf-8'
      );

      const handleDetailsStart = source.indexOf('async function handleDetails');
      expect(handleDetailsStart).toBeGreaterThan(-1);

      const handleDetailsRegion = source.substring(
        handleDetailsStart,
        source.indexOf('\nasync function', handleDetailsStart + 50)
      );

      // All conditions.push calls with paramIndex should use $${paramIndex}
      const conditionPushes = handleDetailsRegion.match(/conditions\.push\(`[^`]+`\)/g) || [];
      expect(conditionPushes.length).toBeGreaterThan(0);

      for (const push of conditionPushes) {
        if (push.includes('IS NULL')) continue;
        // Must contain $${paramIndex} (double dollar in source)
        expect(push).toMatch(/\$\$\{paramIndex\}/);
      }
    });

    it('handleProfile PATCH in api-src/auth.ts uses $$ for index in source', () => {
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../../api-src/auth.ts'),
        'utf-8'
      );

      // SET clause: return `${field} = $${index + 1}`;
      const setClauseLine = source.match(/return `\$\{field\} = \$\$\{index \+ 1\}`/);
      expect(setClauseLine).not.toBeNull();

      // WHERE clause: WHERE id = $${providedFields.length + 1}
      const whereMatch = source.match(/WHERE id = \$\$\{providedFields\.length \+ 1\}/);
      expect(whereMatch).not.toBeNull();
    });
  });
});
