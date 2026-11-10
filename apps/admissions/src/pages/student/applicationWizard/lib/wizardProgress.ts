/**
 * Progress and step states from the wizard's one readiness (task 26.1, R14.1, R14.2).
 *
 * The percentage and the stepper used to come from two places that disagreed:
 * `useOverallProgress` rebuilt a readiness with defaults (no assignment, no document
 * contract), and the stepper marked every step before the current one complete
 * whether or not its items passed. Both now read `wizardReadiness`, the one
 * readiness the controller computes with the real assignment and document contract.
 */
import type { StepKey } from '../steps/config'
import type { WizardReadiness } from './wizardReadiness'

export type WizardStepState = 'complete' | 'incomplete' | 'current' | 'upcoming'

/** Passing items over total items, as a whole percent that never rounds up to 100. */
export function progressPercent(readiness: Pick<WizardReadiness, 'completedItems' | 'totalItems'>): number {
  if (readiness.totalItems <= 0) return 0
  return Math.floor((readiness.completedItems / readiness.totalItems) * 100)
}

/**
 * A step is `complete` exactly when every one of its items passes. The current step
 * is `current` until its items pass. A step the student has already reached and left
 * with items failing is `incomplete`; one not reached yet is `upcoming`.
 */
export function buildStepStates(
  readiness: Pick<WizardReadiness, 'stepProgressByKey'>,
  stepKeys: StepKey[],
  currentIndex: number,
  highestReachedIndex: number,
): Record<StepKey, WizardStepState> {
  const states = {} as Record<StepKey, WizardStepState>
  stepKeys.forEach((key, index) => {
    const progress = readiness.stepProgressByKey[key]
    const passes = Boolean(progress) && progress.completed === progress.total
    if (passes) states[key] = 'complete'
    else if (index === currentIndex) states[key] = 'current'
    else if (index <= Math.max(highestReachedIndex, currentIndex)) states[key] = 'incomplete'
    else states[key] = 'upcoming'
  })
  return states
}

/**
 * The "this step is still incomplete" alert belongs to a student who pressed Next
 * and was stopped, not to one who has only arrived (task 26.2, R14.4).
 */
export function recordContinueAttempt(
  attempted: ReadonlySet<StepKey>,
  step: StepKey,
  stepIsValid: boolean,
): ReadonlySet<StepKey> {
  if (stepIsValid || attempted.has(step)) return attempted
  return new Set(attempted).add(step)
}

export function shouldShowIncompleteAlert(
  attempted: ReadonlySet<StepKey>,
  step: StepKey,
  stepIsValid: boolean,
): boolean {
  return attempted.has(step) && !stepIsValid
}
