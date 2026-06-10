/**
 * Exploration — Property P17: program-first wizard reaches the assigned-school
 * checkpoint before payment.
 *
 * Spec: .kiro/specs/multi-tenant-beanola-admissions (Phase 0, task 1.11;
 * scaffold from task 1.2).
 * Design Testing Strategy P17 / Correctness Property 12:
 *   "UI: program-first → assigned-school checkpoint before payment"
 *   "Payment is unreachable before the assigned-school checkpoint."
 *   → apps/admissions/tests/property/programFirstWizard.property.test.ts
 *
 * Phase 0 is an exploration baseline: each property either PASSES against the
 * CURRENT wizard implementation, or FAILS with a minimised counter-example
 * that guides the implementing phase. Genuine divergences are recorded
 * durably with `it.fails(...)` — the frontend mirror of the backend
 * `@pytest.mark.xfail(strict=True)` convention: `it.fails` passes while the
 * body throws (divergence present) and auto-alerts (the test itself fails)
 * the moment the body starts passing, i.e. once Phase 5 task 21.x lands the
 * assigned-school checkpoint step.
 *
 * Property-based assertions are wrapped in
 * `fc.assert(..., { numRuns: 100, seed: 0 })` per the design.
 *
 * **Validates: Requirements R10.3, R14.8** (and R10.1 via P17 / Property 12)
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

import {
  wizardSteps,
  getStepIndexById,
  isStepReachable,
  isPaymentReachable,
  ASSIGNED_SCHOOL_STEP_INDEX,
  PAYMENT_STEP_INDEX,
  type StepGateState,
  type WizardStepConfig,
} from '@/pages/student/applicationWizard/steps/config'

// ── Arbitraries ─────────────────────────────────────────────────────────

/** A valid current-step index over the real wizard step count. */
const stepIndexArb = fc.integer({ min: 0, max: wizardSteps.length - 1 })

/** Any reachable gate state — assignment resolved or not. */
const gateArb: fc.Arbitrary<StepGateState> = fc.record({
  assignmentResolved: fc.boolean(),
})

/**
 * A target step index strictly AFTER the assigned-school checkpoint
 * (personal, education, payment, submit). These are the steps gated on a
 * resolved assignment.
 */
const postCheckpointStepIndexArb = fc.integer({
  min: ASSIGNED_SCHOOL_STEP_INDEX + 1,
  max: wizardSteps.length - 1,
})

/**
 * A target step index AT OR BEFORE the assigned-school checkpoint
 * (program+intake, assigned-school review). These are always reachable.
 */
const preCheckpointStepIndexArb = fc.integer({
  min: 0,
  max: ASSIGNED_SCHOOL_STEP_INDEX,
})

// ── Detector: design-mandated "assigned school review" checkpoint ─────────

/**
 * R10.1 mandates the wizard order: (1) program+intake, (2) **assigned school
 * review**, (3) personal details, (4) education+documents, (5) payment,
 * (6) review+submit. The checkpoint is the assigned-school review step.
 *
 * This detector is intentionally naming-agnostic so the property flips to a
 * hard pass under whatever reasonable key/title Phase 5 (task 21.1) gives the
 * new step — matching on `assigned` / `school` / `offering` in the step's
 * key, progress title, or title, while never matching the payment step.
 */
const isAssignedSchoolCheckpoint = (step: WizardStepConfig): boolean => {
  const haystack = `${step.key} ${step.progressTitle} ${step.title}`.toLowerCase()
  if (haystack.includes('payment')) return false
  return /assigned|school|offering/.test(haystack)
}

// ── Baseline: assertions over CURRENT wizard step ordering (PASS) ─────────

describe('P17 (exploration baseline): program-first wizard step ordering', () => {
  it('exposes a stable, non-empty ordered step list', () => {
    expect(wizardSteps.length).toBeGreaterThan(0)
    // ids are 1-based and strictly increasing in declaration order
    wizardSteps.forEach((step, index) => {
      expect(step.id).toBe(index + 1)
    })
  })

  it('orders the payment step strictly after the program (program+intake) step', () => {
    // R10.1: program + intake are captured on the first `program` step;
    // payment must never precede it.
    const personalIndex = wizardSteps.findIndex((s) => s.key === 'program')
    const paymentIndex = wizardSteps.findIndex((s) => s.key === 'payment')
    expect(personalIndex).toBeGreaterThanOrEqual(0)
    expect(paymentIndex).toBeGreaterThan(personalIndex)
  })

  it('orders submit/review as the final step, strictly after payment', () => {
    const paymentIndex = wizardSteps.findIndex((s) => s.key === 'payment')
    const submitIndex = wizardSteps.findIndex((s) => s.key === 'submit')
    expect(submitIndex).toBe(wizardSteps.length - 1)
    expect(submitIndex).toBeGreaterThan(paymentIndex)
  })

  it('property: payment is never the first step for any generated current index', () => {
    const paymentIndex = wizardSteps.findIndex((s) => s.key === 'payment')
    fc.assert(
      fc.property(stepIndexArb, (currentIndex) => {
        // A student starting the wizard always lands on step 0 (program+intake),
        // never the payment step. This holds for the entire generated index space.
        expect(wizardSteps[0]!.key).not.toBe('payment')
        // The payment step index is invariant and strictly positive.
        expect(paymentIndex).toBeGreaterThan(0)
        // getStepIndexById round-trips for the generated step.
        const id = wizardSteps[currentIndex]!.id
        expect(getStepIndexById(id)).toBe(currentIndex)
      }),
      { numRuns: 100, seed: 0 },
    )
  })
})

// ── Checkpoint now present (Phase 5 task 21.1): assigned-school gate ──────

describe('P17: assigned-school checkpoint gate before payment', () => {
  /**
   * Design Property 12 / R10.3: "THE wizard SHALL NOT make the payment step
   * reachable until assignment and fee are resolved", reviewed at a dedicated
   * assigned-school checkpoint (R10.1 step 2).
   *
   * Phase 5 task 21.1 inserted the assigned-school review checkpoint
   * (program+intake → **assigned-school review** → personal → education/docs →
   * payment → submit) and gates the payment step on resolved assignment+fee.
   * The exploration divergence has therefore been resolved — these assertions
   * now hold against the real step config. Task 21.3 expands this into the full
   * generated-flow property suite.
   */
  it('places the assigned-school checkpoint strictly before payment across generated flows (R10.1, R10.3)', () => {
    const paymentIndex = wizardSteps.findIndex((s) => s.key === 'payment')

    fc.assert(
      fc.property(stepIndexArb, (currentIndex) => {
        const checkpointIndex = wizardSteps.findIndex(isAssignedSchoolCheckpoint)

        // The assigned-school checkpoint must exist...
        expect(checkpointIndex).toBeGreaterThanOrEqual(0)
        // ...and sit strictly before payment.
        expect(checkpointIndex).toBeLessThan(paymentIndex)

        // A forward-only linear wizard can only be AT the payment step once
        // every earlier step (including the checkpoint) has been traversed.
        if (wizardSteps[currentIndex]?.key === 'payment') {
          expect(currentIndex).toBeGreaterThan(checkpointIndex)
        }
      }),
      { numRuns: 100, seed: 0 },
    )
  })
})

// ── Generated-flow gate properties over the pure guards (task 21.3) ───────

describe('P17 / Property 12: payment unreachable before the assigned-school checkpoint (R10.3)', () => {
  /**
   * R10.3 / Property 12: "Payment is unreachable before the assigned-school
   * checkpoint." Proven directly over the pure step-gating guards exported by
   * config.ts across generated gate states and step indices.
   *
   * **Validates: Requirements R10.3, R14.8**
   */

  it('payment is unreachable for any gate where assignment is unresolved', () => {
    fc.assert(
      fc.property(gateArb, (gate) => {
        if (gate.assignmentResolved === false) {
          // R10.3: with no resolved assignment, payment cannot be reached —
          // both via the dedicated guard and the generic reachability guard.
          expect(isPaymentReachable(gate)).toBe(false)
          expect(isStepReachable(PAYMENT_STEP_INDEX, gate)).toBe(false)
        }
      }),
      { numRuns: 100, seed: 0 },
    )
  })

  it('every post-checkpoint step (incl. payment) requires a resolved assignment', () => {
    fc.assert(
      fc.property(postCheckpointStepIndexArb, gateArb, (targetIndex, gate) => {
        // Reachability of any step strictly after the checkpoint is exactly
        // the assignment-resolved flag — the checkpoint is the sole gate.
        expect(isStepReachable(targetIndex, gate)).toBe(gate.assignmentResolved)
      }),
      { numRuns: 100, seed: 0 },
    )
  })

  it('steps at or before the assigned-school checkpoint are always reachable', () => {
    fc.assert(
      fc.property(preCheckpointStepIndexArb, gateArb, (targetIndex, gate) => {
        // Program+intake and the assigned-school review itself are reachable
        // regardless of gate state — the student must reach the checkpoint to
        // resolve the assignment in the first place.
        expect(isStepReachable(targetIndex, gate)).toBe(true)
      }),
      { numRuns: 100, seed: 0 },
    )
  })

  it('payment becomes reachable only once assignment is resolved', () => {
    fc.assert(
      fc.property(gateArb, (gate) => {
        // Bi-conditional: payment reachability tracks the assignment gate exactly.
        expect(isPaymentReachable(gate)).toBe(gate.assignmentResolved)
      }),
      { numRuns: 100, seed: 0 },
    )
  })

  it('the assigned-school checkpoint index is strictly before the payment index', () => {
    fc.assert(
      fc.property(stepIndexArb, () => {
        // Ordering invariant backing the gate: the checkpoint must precede
        // payment for "unreachable before the checkpoint" to be meaningful.
        expect(ASSIGNED_SCHOOL_STEP_INDEX).toBeGreaterThanOrEqual(0)
        expect(PAYMENT_STEP_INDEX).toBeGreaterThan(ASSIGNED_SCHOOL_STEP_INDEX)
      }),
      { numRuns: 100, seed: 0 },
    )
  })
})
