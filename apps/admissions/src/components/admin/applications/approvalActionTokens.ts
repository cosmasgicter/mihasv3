/**
 * The decision block's tone vocabulary (admissions-v2 task 12.1, MAINT-01).
 *
 * Lifted **verbatim** out of `ApplicationApprovalActions.tsx` so the block and the
 * payment controls task 12.1 extracted from it share one definition instead of
 * two copies. The values, and the measurements that justify them, are task 11.5's
 * and are unchanged.
 *
 * ---
 *
 * Token-based outline commands (admissions-v2 task **11.5**, R16.4).
 *
 * Task 11.4 §11 recorded that this block's status badges and its four
 * tone-carrying outline buttons were still written in raw Tailwind palette steps
 * (`bg-green-100`, `border-amber-500`, `text-blue-700`, …) and named it 11.5's
 * work. The tones themselves are correct — a conditional decision is
 * informational, a waitlist is a caution, a payment verification is a success —
 * so what changes is the vocabulary, not the meaning: every one now resolves
 * through the semantic tokens (`--color-success-rgb` 4 120 87, `--color-warning-rgb`
 * 180 83 9, `--color-info-rgb` 37 99 235), each of which is documented AA on the
 * card background, where `text-amber-700` on `bg-amber-100` was not.
 *
 * The badges themselves are the canonical `StatusBadge` primitive, which pairs
 * tone with an icon **and** a label at the type level — "never colour alone",
 * enforced by the component rather than restated per call site.
 *
 * The hover wash is `/5`, not `/10`: a tone-coloured label on a 10 % wash of its
 * own tone measures 4.37 : 1 for `warning` and 4.48 : 1 for `info`, which is
 * under AA. At `/5` they are 4.67 : 1 and 4.78 : 1, and the resting state (tone
 * on card white) is 4.99 : 1 / 4.52 : 1. A hover state is still text on a
 * background.
 */
export const OUTLINE_SUCCESS = 'border-success/50 text-success hover:bg-success/5'
export const OUTLINE_WARNING = 'border-warning/50 text-warning hover:bg-warning/5'
export const OUTLINE_INFO = 'border-info/50 text-info hover:bg-info/5'

/** A status-only callout: one container deep, no card treatment of its own. */
// Tint only: the callout sits inside the review's decision bar (task 31.3, R21.5).
export const STATUS_CALLOUT = 'rounded-lg bg-warning/10'
