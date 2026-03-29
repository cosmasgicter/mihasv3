// @vitest-environment node
/**
 * Property-based tests for Group B endpoint hardening (admin, applications, notifications)
 * Feature: api-endpoint-hardening
 *
 * Property 1: Invalid input payloads are rejected with structured errors
 * Property 12: UUID parameters reject non-UUID strings
 * Property 13: Pagination parameters are validated
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { scheduleInterviewBodySchema } from '../../../lib/validation/applications';
import { updateSettingBodySchema } from '../../../lib/validation/admin';
import {
  checkDuplicateBodySchema,
  preferencesBodySchema,
} from '../../../lib/validation/notifications';
import { uuidParamSchema, paginationQuerySchema } from '../../../lib/validation/common';

// ── Property 1: Invalid input payloads are rejected with structured errors ──
// **Validates: Requirements 1.1, 1.2, 1.3**

describe('P1: Invalid input payloads are rejected with structured errors', () => {
  it('scheduleInterviewBodySchema rejects payloads with wrong types', () => {
    fc.assert(
      fc.property(
        fc.record({
          application_id: fc.oneof(fc.integer(), fc.boolean(), fc.constant(null)),
          interview_date: fc.oneof(fc.integer(), fc.boolean(), fc.constant(null)),
          interview_time: fc.oneof(fc.integer(), fc.boolean()),
          location: fc.oneof(fc.integer(), fc.boolean()),
          notes: fc.oneof(fc.integer(), fc.boolean()),
        }),
        (payload) => {
          const result = scheduleInterviewBodySchema.safeParse(payload);
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('scheduleInterviewBodySchema rejects empty objects', () => {
    fc.assert(
      fc.property(fc.constant({}), (payload) => {
        const result = scheduleInterviewBodySchema.safeParse(payload);
        expect(result.success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('updateSettingBodySchema rejects payloads with wrong types for known fields', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.oneof(fc.integer(), fc.boolean(), fc.constant(null)),
          key: fc.oneof(fc.integer(), fc.boolean(), fc.constant(null)),
          is_public: fc.oneof(fc.string(), fc.integer()),
        }),
        (payload) => {
          const result = updateSettingBodySchema.safeParse(payload);
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('checkDuplicateBodySchema rejects payloads with wrong types', () => {
    fc.assert(
      fc.property(
        fc.record({
          title: fc.oneof(fc.integer(), fc.boolean(), fc.constant(null)),
          message: fc.oneof(fc.integer(), fc.boolean(), fc.constant(null)),
        }),
        (payload) => {
          const result = checkDuplicateBodySchema.safeParse(payload);
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('checkDuplicateBodySchema rejects empty objects (missing required fields)', () => {
    fc.assert(
      fc.property(fc.constant({}), (payload) => {
        const result = checkDuplicateBodySchema.safeParse(payload);
        expect(result.success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('preferencesBodySchema rejects payloads with wrong types for boolean fields', () => {
    fc.assert(
      fc.property(
        fc.record({
          sms_enabled: fc.oneof(fc.string(), fc.integer()),
          application_updates: fc.oneof(fc.string(), fc.integer()),
          payment_reminders: fc.oneof(fc.string(), fc.integer()),
          interview_reminders: fc.oneof(fc.string(), fc.integer()),
          marketing_emails: fc.oneof(fc.string(), fc.integer()),
        }),
        (payload) => {
          const result = preferencesBodySchema.safeParse(payload);
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('all schemas reject non-object inputs', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
        (payload) => {
          expect(scheduleInterviewBodySchema.safeParse(payload).success).toBe(false);
          expect(checkDuplicateBodySchema.safeParse(payload).success).toBe(false);
          expect(preferencesBodySchema.safeParse(payload).success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('failed validations produce error details with issues array', () => {
    fc.assert(
      fc.property(
        fc.anything().filter((v) => typeof v !== 'object' || v === null || Array.isArray(v)),
        (payload) => {
          const result = scheduleInterviewBodySchema.safeParse(payload);
          if (!result.success) {
            expect(result.error.issues).toBeDefined();
            expect(result.error.issues.length).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── Property 12: UUID parameters reject non-UUID strings ────────────────────
// **Validates: Requirements 7.3, 7.5**

describe('P12: UUID parameters reject non-UUID strings', () => {
  const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  it('random non-UUID strings are rejected', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !UUID_V4_REGEX.test(s)),
        (nonUuid) => {
          const result = uuidParamSchema.safeParse(nonUuid);
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('valid UUIDs are accepted', () => {
    fc.assert(
      fc.property(fc.uuid(), (uuid) => {
        const result = uuidParamSchema.safeParse(uuid);
        expect(result.success).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('empty and whitespace-only strings are rejected', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('', ' ', '  ', '\t', '\n'),
        (value) => {
          const result = uuidParamSchema.safeParse(value);
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('non-string types are rejected', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.integer(), fc.boolean(), fc.constant(null), fc.constant(undefined)),
        (value) => {
          const result = uuidParamSchema.safeParse(value);
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── Property 13: Pagination parameters are validated ────────────────────────
// **Validates: Requirements 7.4**

describe('P13: Pagination parameters are validated', () => {
  it('non-positive page values are rejected', () => {
    fc.assert(
      fc.property(
        fc.integer({ max: 0 }),
        (page) => {
          const result = paginationQuerySchema.safeParse({ page: String(page), pageSize: '20' });
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('non-positive pageSize values are rejected', () => {
    fc.assert(
      fc.property(
        fc.integer({ max: 0 }),
        (pageSize) => {
          const result = paginationQuerySchema.safeParse({ page: '1', pageSize: String(pageSize) });
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('pageSize exceeding 100 is rejected', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 101, max: 10000 }),
        (pageSize) => {
          const result = paginationQuerySchema.safeParse({ page: '1', pageSize: String(pageSize) });
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('valid positive page and pageSize within bounds are accepted', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 1, max: 100 }),
        (page, pageSize) => {
          const result = paginationQuerySchema.safeParse({
            page: String(page),
            pageSize: String(pageSize),
          });
          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.data.page).toBe(page);
            expect(result.data.pageSize).toBe(pageSize);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('defaults are applied when page and pageSize are omitted', () => {
    const result = paginationQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
    }
  });

  it('non-numeric strings for page/pageSize are rejected', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => isNaN(Number(s))),
        (badValue) => {
          const result = paginationQuerySchema.safeParse({ page: badValue, pageSize: '20' });
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('floating point page values are rejected', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 100, noNaN: true }).filter((n) => !Number.isInteger(n)),
        (page) => {
          const result = paginationQuerySchema.safeParse({ page: String(page), pageSize: '20' });
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
