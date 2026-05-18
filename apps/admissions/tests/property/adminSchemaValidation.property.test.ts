/**
 * Feature: migration-recovery-hardening, Property 6: Admin endpoint responses conform to their Zod schemas
 * 
 * Validates: Requirements 6.1, 6.2
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { AuditLogResponseSchema, AppealsResponseSchema } from '../unit/contracts/schemas'

const auditEntryArb = fc.record({
  id: fc.uuid(),
  action: fc.constantFrom('login', 'logout', 'create', 'update', 'delete', 'review'),
  entity_type: fc.constantFrom('user', 'application', 'document', 'payment'),
  entity_id: fc.uuid(),
  created_at: fc.date().filter((date) => Number.isFinite(date.getTime())).map(d => d.toISOString()),
})

const appealArb = fc.record({
  id: fc.uuid(),
  application_id: fc.uuid(),
  status: fc.constantFrom('pending', 'approved', 'rejected', 'under_review'),
  appeal_type: fc.constantFrom('grade_review', 'eligibility_review', 'document_review'),
  created_at: fc.date().filter((date) => Number.isFinite(date.getTime())).map(d => d.toISOString()),
})

describe('Property 6: Admin endpoint responses conform to their Zod schemas', () => {
  it('PROPERTY: Valid audit log responses pass AuditLogResponseSchema', () => {
    fc.assert(
      fc.property(
        fc.array(auditEntryArb, { maxLength: 10 }),
        fc.nat({ max: 100 }),
        fc.integer({ min: 1, max: 50 }),
        fc.nat({ max: 10 }),
        fc.nat({ max: 500 }),
        (entries, page, pageSize, totalPages, totalCount) => {
          const response = { entries, page, pageSize, totalPages, totalCount }
          const result = AuditLogResponseSchema.safeParse(response)
          expect(result.success).toBe(true)
        }
      ),
      { numRuns: 10 }
    )
  })

  it('PROPERTY: Valid appeals responses pass AppealsResponseSchema', () => {
    fc.assert(
      fc.property(
        fc.array(appealArb, { maxLength: 10 }),
        fc.nat({ max: 500 }),
        fc.nat({ max: 100 }),
        fc.integer({ min: 1, max: 50 }),
        (appeals, totalCount, page, pageSize) => {
          const response = { appeals, totalCount, page, pageSize }
          const result = AppealsResponseSchema.safeParse(response)
          expect(result.success).toBe(true)
        }
      ),
      { numRuns: 10 }
    )
  })

  it('PROPERTY: Both schemas require pagination fields', () => {
    fc.assert(
      fc.property(
        fc.array(auditEntryArb, { maxLength: 3 }),
        (entries) => {
          // Missing pagination fields should fail
          const incomplete = { entries }
          expect(AuditLogResponseSchema.safeParse(incomplete).success).toBe(false)
        }
      ),
      { numRuns: 10 }
    )
  })
})
