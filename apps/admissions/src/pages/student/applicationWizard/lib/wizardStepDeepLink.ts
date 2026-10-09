/**
 * Deep-linking a wizard step (admissions-v2 task 11.2, R10.2/R16.1).
 *
 * Task **11.1** deferred this here, and said why:
 *
 * > The table is deliberately *not* deep-linked into a wizard step. The wizard
 * > only honours `?step=` on history navigation; deep-linking it is task 11.2's
 * > lane, and a link that silently lands on the wrong step is worse than one that
 * > lands where the student left off.
 *
 * Both halves of that sentence are respected here. The wizard now honours `?step=`
 * on a **first** load, so the platform's own next action can address the step that
 * clears it; and it never lands on a step the student has not earned, because
 * every resolution is passed through `steps/config`'s existing reachability gate
 * (R10.3: nothing after the assigned-school checkpoint is reachable until the
 * backend has resolved the assignment and the fee). An out-of-reach request is
 * **explained and not followed**, rather than followed or silently dropped.
 *
 * The step vocabulary is the server's. Task 6.5's readiness publishes a `step` on
 * every `allowed_next_actions` entry (`program`, `personal`, `education`,
 * `payment`, `submit`), which is exactly this wizard's `StepKey` minus
 * `assignedSchool` — the checkpoint is this app's own gate, not a piece of work the
 * platform asks for. `wizardStepKeyFromServerStep` is therefore total over what the
 * server publishes, and `wizardServerStepDrift.test.ts` parses
 * `readiness_service.py` to keep it that way. Same shape, and the same reason, as
 * task 8.2's payment-phase mirror guard and 11.1's route-table guard: a mirror
 * that is not mechanically compared is a mirror that drifts.
 */
import {
  getStepIndexByKey,
  isStepReachable,
  wizardSteps,
  type StepGateState,
  type StepKey,
} from '../steps/config'

/** The query parameter the wizard already writes on every step change. */
export const WIZARD_STEP_PARAM = 'step'

/** Every step key the wizard can be addressed by. */
const STEP_KEYS = new Set<string>(wizardSteps.map(step => step.key))

/**
 * The step a server-published action belongs to.
 *
 * `null` means the server named something this wizard does not own — which is a
 * routing decision for the caller (11.1's table sends those to the workspace),
 * never a reason to guess a step.
 */
export function wizardStepKeyFromServerStep(serverStep: unknown): StepKey | null {
  if (typeof serverStep !== 'string') return null
  const trimmed = serverStep.trim()
  return STEP_KEYS.has(trimmed) ? (trimmed as StepKey) : null
}

export interface DeepLinkResolution {
  /**
   * The step index to open, or `null` when the wizard should stay where the
   * draft-resume machine put it — either because the URL asked for nothing, or
   * because what it asked for is not reachable yet.
   */
  index: number | null
  /**
   * True when the request named a real step the student has not earned yet. The
   * wizard **does not move**: wherever the resume machine landed is a legal place
   * to be, and jumping to the checkpoint instead would drop a student with nothing
   * selected onto an assignment review, or push one who was three steps in
   * backwards. So the link is explained rather than followed.
   */
  deferred: boolean
  /** The step the URL asked for, whether or not it was reachable. */
  requested: StepKey | null
}

/**
 * Resolve `?step=<key>` against the wizard's own gate.
 *
 * - no `step`, or an unknown one → `{ index: null }`: the caller keeps whatever
 *   the draft-resume machine decided, which is the behaviour that existed before
 *   deep-linking and remains the default.
 * - a reachable step → that step.
 * - a real but unreachable step → `{ index: null, deferred: true }`: stay put and
 *   explain. The first version of this module clamped to the assigned-school
 *   checkpoint instead, and the browser run showed why that is wrong — a link
 *   followed before the assignment had resolved dragged a student *backwards* out
 *   of the step they were already working in.
 */
export function resolveWizardDeepLinkStep(
  locationSearch: string,
  gate: StepGateState,
): DeepLinkResolution {
  let raw: string | null = null
  try {
    raw = new URLSearchParams(locationSearch).get(WIZARD_STEP_PARAM)
  } catch {
    raw = null
  }

  const requested = wizardStepKeyFromServerStep(raw)
  if (!requested) return { index: null, deferred: false, requested: null }

  const requestedIndex = getStepIndexByKey(requested)
  if (requestedIndex < 0) return { index: null, deferred: false, requested: null }

  if (isStepReachable(requestedIndex, gate)) {
    return { index: requestedIndex, deferred: false, requested }
  }
  return { index: null, deferred: true, requested }
}

/**
 * The path that opens one draft at the step a server action names.
 *
 * Kept here rather than in `routeRegistry` because the *step* vocabulary belongs
 * to the wizard: the registry knows the wizard's path, this module knows which of
 * its steps exist. 11.1's route table composes the two.
 */
export function wizardStepQuery(stepKey: StepKey | null): string {
  return stepKey ? `&${WIZARD_STEP_PARAM}=${encodeURIComponent(stepKey)}` : ''
}
