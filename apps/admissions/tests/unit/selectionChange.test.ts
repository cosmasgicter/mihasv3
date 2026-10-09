/**
 * Unit tests — reroute decision + recovery guidance (pure module).
 *
 * Spec: .kiro/specs/admissions-v2-canonical-rebuild/ — task 6.4.
 * Requirements: R7.2, R10.5 · Findings: STU-01, DATA-01.
 * Design: design.md §7.2 (assignment immutable except through one reroute
 * command; payment activity makes assignment immutable).
 *
 * `resolveSelectionChangeIntent` is the client-side gate that decides whether a
 * page advance must send the reroute command at all — it must never send one for
 * an unchanged selection (which would 409 a paid application) and must always
 * send one when the student's canonical choice actually moved (closing the
 * STU-01 split identity).
 *
 * `resolveSelectionChangeRecovery` guarantees every stable rejection code maps
 * to a recoverable, non-empty next step — the "clear recovery path" of task 6.4.
 *
 * Validates: Requirements R7.2, R10.5
 */
import { describe, expect, it } from 'vitest'

import {
  SELECTION_CHANGE_CODES,
  getSelectionChangeCode,
  resolveSelectionChangeIntent,
  resolveSelectionChangeRecovery,
} from '@/pages/student/applicationWizard/lib/selectionChange'

const target = {
  programId: 'prog-b',
  intakeId: 'intake-b',
  programName: 'Diploma in Pharmacy',
  intakeName: 'July 2027',
}

describe('resolveSelectionChangeIntent', () => {
  it('is a no-op when the draft already holds the target canonical selection', () => {
    expect(
      resolveSelectionChangeIntent({
        persisted: { programId: 'prog-b', intakeId: 'intake-b' },
        target,
      }),
    ).toEqual({ kind: 'noop' })
  })

  it('sends the reroute when the canonical programme changed', () => {
    expect(
      resolveSelectionChangeIntent({
        persisted: { programId: 'prog-a', intakeId: 'intake-b' },
        target,
      }),
    ).toEqual({ kind: 'change', programId: 'prog-b', intakeId: 'intake-b' })
  })

  it('sends the reroute when the canonical intake changed', () => {
    expect(
      resolveSelectionChangeIntent({
        persisted: { programId: 'prog-b', intakeId: 'intake-a' },
        target,
      }),
    ).toEqual({ kind: 'change', programId: 'prog-b', intakeId: 'intake-b' })
  })

  it('forwards the persisted assignment version as the optimistic guard', () => {
    expect(
      resolveSelectionChangeIntent({
        persisted: { programId: 'prog-a', intakeId: 'intake-a', assignmentVersion: 4 },
        target,
      }),
    ).toEqual({
      kind: 'change',
      programId: 'prog-b',
      intakeId: 'intake-b',
      assignmentVersion: 4,
    })
  })

  it('treats a legacy draft with matching display labels as a no-op (server repairs it)', () => {
    expect(
      resolveSelectionChangeIntent({
        persisted: {
          programId: null,
          intakeId: null,
          programName: '  diploma in PHARMACY ',
          intakeName: 'July 2027',
        },
        target,
      }),
    ).toEqual({ kind: 'noop' })
  })

  it('sends the reroute for a legacy draft whose display selection changed', () => {
    expect(
      resolveSelectionChangeIntent({
        persisted: {
          programId: null,
          intakeId: null,
          programName: 'Diploma in Nursing',
          intakeName: 'January 2027',
        },
        target,
      }),
    ).toEqual({ kind: 'change', programId: 'prog-b', intakeId: 'intake-b' })
  })

  it('sends the reroute for a draft with no identity at all', () => {
    expect(resolveSelectionChangeIntent({ persisted: {}, target })).toEqual({
      kind: 'change',
      programId: 'prog-b',
      intakeId: 'intake-b',
    })
  })

  it('never sends a command without a complete canonical target', () => {
    expect(
      resolveSelectionChangeIntent({
        persisted: { programId: 'prog-a', intakeId: 'intake-a' },
        target: { programId: '', intakeId: 'intake-b' },
      }),
    ).toEqual({ kind: 'noop' })
    expect(
      resolveSelectionChangeIntent({
        persisted: { programId: 'prog-a', intakeId: 'intake-a' },
        target: { programId: 'prog-b', intakeId: '' },
      }),
    ).toEqual({ kind: 'noop' })
  })

  it('treats a half-canonical draft as needing the reroute (no split identity)', () => {
    expect(
      resolveSelectionChangeIntent({
        persisted: { programId: 'prog-b', intakeId: null, programName: 'Diploma in Pharmacy' },
        target,
      }),
    ).toEqual({ kind: 'change', programId: 'prog-b', intakeId: 'intake-b' })
  })
})

describe('getSelectionChangeCode', () => {
  it('reads the stable code from an apiClient error body', () => {
    expect(getSelectionChangeCode({ data: { code: 'ASSIGNMENT_LOCKED_BY_PAYMENT' } })).toBe(
      'ASSIGNMENT_LOCKED_BY_PAYMENT',
    )
  })

  it('reads a top-level code', () => {
    expect(getSelectionChangeCode({ code: 'VERSION_CONFLICT' })).toBe('VERSION_CONFLICT')
  })

  it('returns null for unknown/transient failures', () => {
    expect(getSelectionChangeCode(new Error('network'))).toBeNull()
    expect(getSelectionChangeCode({ data: { code: 'SOMETHING_ELSE' } })).toBeNull()
    expect(getSelectionChangeCode(null)).toBeNull()
  })
})

describe('resolveSelectionChangeRecovery', () => {
  it('never returns an empty action list for any stable code', () => {
    for (const code of SELECTION_CHANGE_CODES) {
      const recovery = resolveSelectionChangeRecovery({ data: { code } })
      expect(recovery.code).toBe(code)
      expect(recovery.actions.length).toBeGreaterThan(0)
      expect(recovery.message.trim().length).toBeGreaterThan(0)
      expect(recovery.title.trim().length).toBeGreaterThan(0)
    }
  })

  it('never returns an empty action list for an unknown failure', () => {
    const recovery = resolveSelectionChangeRecovery(new Error('offline'))
    expect(recovery.code).toBeNull()
    expect(recovery.retryable).toBe(true)
    expect(recovery.actions.length).toBeGreaterThan(0)
  })

  it('uses the server-supplied recovery path for the payment lock', () => {
    const recovery = resolveSelectionChangeRecovery({
      status: 409,
      data: {
        code: 'ASSIGNMENT_LOCKED_BY_PAYMENT',
        error: 'This application already has payment activity, so its programme and intake can no longer be changed.',
        recovery: {
          reason: 'payment_activity',
          actions: [
            { action: 'continue-current', label: 'Continue this application', href: '/x' },
            { action: 'contact-admissions', label: 'Ask admissions', href: '/contact' },
          ],
        },
      },
    })
    expect(recovery.code).toBe('ASSIGNMENT_LOCKED_BY_PAYMENT')
    expect(recovery.retryable).toBe(false)
    expect(recovery.actions.map(a => a.action)).toEqual(['continue-current', 'contact-admissions'])
    expect(recovery.message).toContain('payment activity')
  })

  it('falls back to a local recovery path when the server omits one', () => {
    const recovery = resolveSelectionChangeRecovery({
      data: { code: 'ASSIGNMENT_LOCKED_BY_PAYMENT' },
    })
    expect(recovery.actions.map(a => a.action)).toContain('start-new-application')
    expect(recovery.actions.map(a => a.action)).toContain('contact-admissions')
  })

  it('offers the existing application when the target is a duplicate', () => {
    const recovery = resolveSelectionChangeRecovery(
      { data: { code: 'DUPLICATE_APPLICATION', existing_id: 'app-9' } },
      { programName: 'Diploma in Pharmacy', intakeName: 'July 2027' },
    )
    const continueExisting = recovery.actions.find(a => a.action === 'continue-existing')
    expect(continueExisting?.href).toBe('/student/application-wizard?mode=resume&draftId=app-9')
    expect(recovery.message).toContain('Diploma in Pharmacy')
  })

  it('marks only a configuration failure as retryable among the conflict codes', () => {
    expect(
      resolveSelectionChangeRecovery({ data: { code: 'CONFIGURATION_UNAVAILABLE' } }).retryable,
    ).toBe(true)
    expect(resolveSelectionChangeRecovery({ data: { code: 'VERSION_CONFLICT' } }).retryable).toBe(false)
    expect(
      resolveSelectionChangeRecovery({ data: { code: 'NO_ELIGIBLE_OFFERING' } }).retryable,
    ).toBe(false)
  })
})
