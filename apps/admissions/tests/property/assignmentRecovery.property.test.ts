/**
 * Property: recoverable assignment-failure guidance never dead-ends the student.
 *
 * Spec: .kiro/specs/multi-tenant-beanola-admissions, task 21.2.
 * Requirements R10.4 (wizard presents a recoverable path, never dead-ends),
 * R2.6 (NO_ELIGIBLE_OFFERING recoverable response), R2.7 (submit-time
 * OFFERING_NO_LONGER_AVAILABLE / OFFERING_CAPACITY_FULL recoverable, never a
 * silent success).
 *
 * For ANY failure code (including transient/unknown) and ANY program/intake
 * label, `resolveAssignmentRecovery` must yield non-empty guidance that always
 * lets the student change intake and contact admissions.
 *
 * Property-based assertions wrapped in fc.assert with numRuns 100, seed 0.
 *
 * **Validates: Requirements R10.4, R2.6, R2.7**
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

import {
  ASSIGNMENT_FAILURE_CODES,
  resolveAssignmentRecovery,
  type AssignmentFailureCode,
} from '@/pages/student/applicationWizard/lib/assignmentRecovery'

const codeArb: fc.Arbitrary<AssignmentFailureCode | null> = fc.constantFrom(
  ...ASSIGNMENT_FAILURE_CODES,
  null,
)

const labelArb = fc.option(fc.string(), { nil: undefined })

describe('resolveAssignmentRecovery — never dead-ends (R10.4)', () => {
  it('always returns a non-empty action set including change-intake and contact-admissions', () => {
    fc.assert(
      fc.property(codeArb, labelArb, labelArb, (code, programName, intakeName) => {
        const guidance = resolveAssignmentRecovery({ code, programName, intakeName })
        expect(guidance.actions.length).toBeGreaterThan(0)
        // The two always-available recovery routes.
        expect(guidance.actions).toContain('change-intake')
        expect(guidance.actions).toContain('contact-admissions')
        // Title and message are always meaningful (never empty → never a blank dead-end).
        expect(guidance.title.trim().length).toBeGreaterThan(0)
        expect(guidance.message.trim().length).toBeGreaterThan(0)
        // No duplicate actions.
        expect(new Set(guidance.actions).size).toBe(guidance.actions.length)
      }),
      { numRuns: 100, seed: 0 },
    )
  })

  it('preserves the originating code for stable-code failures', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ASSIGNMENT_FAILURE_CODES), (code) => {
        expect(resolveAssignmentRecovery({ code }).code).toBe(code)
      }),
      { numRuns: 100, seed: 0 },
    )
  })
})
