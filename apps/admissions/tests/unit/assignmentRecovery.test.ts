/**
 * Recoverable assignment-failure guidance (R10.4, R2.6, R2.7).
 *
 * Verifies that every assignment-failure code (and the transient/unknown case)
 * maps to a recoverable path with a non-empty action set — the student is
 * never dead-ended. Also covers stable-code extraction from thrown API errors,
 * the admissions mailto builder, and the client-side interest-list affordance.
 */
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'

import {
  ASSIGNMENT_FAILURE_CODES,
  asAssignmentFailureCode,
  buildAdmissionsMailto,
  getAssignmentFailureCode,
  hasRecordedAssignmentInterest,
  recordAssignmentInterest,
  resolveAssignmentRecovery,
} from '@/pages/student/applicationWizard/lib/assignmentRecovery'

describe('asAssignmentFailureCode', () => {
  it('narrows known codes and rejects everything else', () => {
    expect(asAssignmentFailureCode('NO_ELIGIBLE_OFFERING')).toBe('NO_ELIGIBLE_OFFERING')
    expect(asAssignmentFailureCode('OFFERING_NO_LONGER_AVAILABLE')).toBe('OFFERING_NO_LONGER_AVAILABLE')
    expect(asAssignmentFailureCode('OFFERING_CAPACITY_FULL')).toBe('OFFERING_CAPACITY_FULL')
    expect(asAssignmentFailureCode('PAYMENT_REQUIRED')).toBeNull()
    expect(asAssignmentFailureCode(undefined)).toBeNull()
    expect(asAssignmentFailureCode(42)).toBeNull()
  })
})

describe('getAssignmentFailureCode', () => {
  it('extracts the stable code from error.data.code', () => {
    const error = Object.assign(new Error('Conflict'), {
      status: 409,
      data: { success: false, code: 'OFFERING_CAPACITY_FULL' },
    })
    expect(getAssignmentFailureCode(error)).toBe('OFFERING_CAPACITY_FULL')
  })

  it('extracts the stable code from a top-level error.code', () => {
    const error = Object.assign(new Error('Conflict'), { code: 'NO_ELIGIBLE_OFFERING' })
    expect(getAssignmentFailureCode(error)).toBe('NO_ELIGIBLE_OFFERING')
  })

  it('returns null for transient / unrelated errors', () => {
    expect(getAssignmentFailureCode(new Error('Network down'))).toBeNull()
    expect(getAssignmentFailureCode({ data: { code: 'IDEMPOTENCY_PENDING' } })).toBeNull()
    expect(getAssignmentFailureCode(null)).toBeNull()
  })
})

describe('resolveAssignmentRecovery', () => {
  it('never returns an empty action set for any known code (never dead-ends)', () => {
    for (const code of ASSIGNMENT_FAILURE_CODES) {
      const guidance = resolveAssignmentRecovery({ code, programName: 'Nursing', intakeName: 'July 2026' })
      expect(guidance.actions.length).toBeGreaterThan(0)
      expect(guidance.actions).toContain('change-intake')
      expect(guidance.actions).toContain('contact-admissions')
      expect(guidance.title).toBeTruthy()
      expect(guidance.message).toContain('Nursing')
    }
  })

  it('offers the interest list for NO_ELIGIBLE_OFFERING and capacity full', () => {
    expect(resolveAssignmentRecovery({ code: 'NO_ELIGIBLE_OFFERING' }).actions).toContain('interest-list')
    expect(resolveAssignmentRecovery({ code: 'OFFERING_CAPACITY_FULL' }).actions).toContain('interest-list')
  })

  it('falls back to a recoverable transient path when code is null', () => {
    const guidance = resolveAssignmentRecovery({ code: null })
    expect(guidance.code).toBeNull()
    expect(guidance.actions).toEqual(expect.arrayContaining(['change-intake', 'contact-admissions']))
  })

  it('uses safe placeholders when program/intake names are missing', () => {
    const guidance = resolveAssignmentRecovery({ code: 'NO_ELIGIBLE_OFFERING' })
    expect(guidance.message).toContain('this programme')
    expect(guidance.message).toContain('this intake')
  })
})

describe('buildAdmissionsMailto', () => {
  it('builds a mailto url with subject and body when an address is present', () => {
    const url = buildAdmissionsMailto({ email: 'admissions@example.edu', programName: 'Nursing', intakeName: 'July 2026' })
    expect(url).toContain('mailto:admissions@example.edu')
    expect(url).toContain('subject=')
    expect(url).toContain('body=')
    expect(decodeURIComponent(url!)).toContain('Nursing')
  })

  it('returns null when no address is known so the caller can use the contact page', () => {
    expect(buildAdmissionsMailto({ email: null })).toBeNull()
    expect(buildAdmissionsMailto({ email: '   ' })).toBeNull()
  })
})

describe('interest list (client-side affordance)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    window.localStorage.clear()
  })

  it('records and reads interest per program + intake', () => {
    expect(hasRecordedAssignmentInterest({ programId: 'p1', intakeId: 'i1' })).toBe(false)
    expect(recordAssignmentInterest({ programId: 'p1', intakeId: 'i1', code: 'NO_ELIGIBLE_OFFERING' })).toBe(true)
    expect(hasRecordedAssignmentInterest({ programId: 'p1', intakeId: 'i1' })).toBe(true)
    // Different intake is independent
    expect(hasRecordedAssignmentInterest({ programId: 'p1', intakeId: 'i2' })).toBe(false)
  })

  it('refuses to record without both ids', () => {
    expect(recordAssignmentInterest({ programId: 'p1', intakeId: '' })).toBe(false)
    expect(recordAssignmentInterest({ programId: null, intakeId: 'i1' })).toBe(false)
  })

  it('is idempotent for the same program + intake', () => {
    expect(recordAssignmentInterest({ programId: 'p1', intakeId: 'i1' })).toBe(true)
    expect(recordAssignmentInterest({ programId: 'p1', intakeId: 'i1' })).toBe(true)
    expect(hasRecordedAssignmentInterest({ programId: 'p1', intakeId: 'i1' })).toBe(true)
  })
})
