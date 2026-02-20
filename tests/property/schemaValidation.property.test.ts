/**
 * Feature: migration-recovery-hardening, Property 7: Contract schema validation accepts valid responses and rejects invalid ones
 * 
 * Validates: Requirements 7.2, 7.3
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  ApplicationListResponseSchema,
  AuditLogResponseSchema,
  AppealsResponseSchema,
  CatalogProgramsResponseSchema,
  AuthSessionResponseSchema,
} from '../unit/contracts/schemas'

// Use integer timestamps to avoid Invalid Date from fast-check's fc.date()
const validDate = fc.integer({ min: 946684800000, max: 4102444800000 }).map(ts => new Date(ts).toISOString())

const validApplication = fc.record({
  id: fc.uuid(),
  application_number: fc.string({ minLength: 1, maxLength: 20 }),
  status: fc.constantFrom('draft', 'submitted', 'under_review', 'approved', 'rejected'),
  program: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: null }),
  payment_status: fc.option(fc.constantFrom('pending_review', 'verified', 'rejected'), { nil: null }),
  created_at: validDate,
})

describe('Property 7: Contract schema validation accepts valid and rejects invalid', () => {
  it('PROPERTY: Valid ApplicationListResponse passes schema', () => {
    fc.assert(
      fc.property(
        fc.array(validApplication, { maxLength: 5 }),
        fc.nat({ max: 1000 }),
        fc.nat({ max: 100 }),
        fc.nat({ max: 50 }),
        (apps, totalCount, page, pageSize) => {
          const response = { applications: apps, totalCount, page, pageSize }
          expect(ApplicationListResponseSchema.safeParse(response).success).toBe(true)
        }
      ),
      { numRuns: 20 }
    )
  })

  it('PROPERTY: Missing required fields fail schema', () => {
    fc.assert(
      fc.property(fc.nat(), (totalCount) => {
        // Missing 'applications' field
        const response = { totalCount, page: 1, pageSize: 10 }
        expect(ApplicationListResponseSchema.safeParse(response).success).toBe(false)
      }),
      { numRuns: 20 }
    )
  })

  it('PROPERTY: Valid AuditLogResponse passes schema', () => {
    const validEntry = fc.record({
      id: fc.uuid(),
      action: fc.constantFrom('login', 'logout', 'create', 'update', 'delete'),
      entity_type: fc.constantFrom('user', 'application', 'document'),
      entity_id: fc.uuid(),
      created_at: validDate,
    })

    fc.assert(
      fc.property(
        fc.array(validEntry, { maxLength: 5 }),
        fc.nat({ max: 100 }),
        fc.nat({ max: 50 }),
        fc.nat({ max: 10 }),
        fc.nat({ max: 1000 }),
        (entries, page, pageSize, totalPages, totalCount) => {
          const response = { entries, page, pageSize, totalPages, totalCount }
          expect(AuditLogResponseSchema.safeParse(response).success).toBe(true)
        }
      ),
      { numRuns: 20 }
    )
  })

  it('PROPERTY: Valid AuthSessionResponse with user passes schema', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.emailAddress(),
        fc.constantFrom('student', 'admin', 'super_admin', 'reviewer'),
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        (id, email, role, firstName, lastName) => {
          const response = { user: { id, email, role, firstName, lastName } }
          expect(AuthSessionResponseSchema.safeParse(response).success).toBe(true)
        }
      ),
      { numRuns: 20 }
    )
  })
})
