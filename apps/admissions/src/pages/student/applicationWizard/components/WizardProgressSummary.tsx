/**
 * Compact progress, and the platform's current blockers (task 11.2).
 *
 * Requirements: **R16.1** (320 px first), **R16.4** (restrained hierarchy, no
 * nested cards), **R16.5** (no redundant metrics), **R16.8** (status stays
 * understandable under zoom and offline). Findings: **STU-03**.
 *
 * What this replaces, and why each removal is a removal rather than a move:
 *
 * | Was | Why it is gone |
 * |---|---|
 * | four `PageShell` metric tiles ("Current step", "Completion", "Estimated time", "Draft status") | the shell renders `metrics` *above* the children, so on a phone the first viewport was four tiles and the work was below them. Three of the four are restated here in one line; "Estimated time" was a guess about the student's own pace |
 * | `Missing: Assigned school, NRC or passport +8 more` | a blocker list derived in the browser, which is exactly what 11.1 removed from the dashboard. The blockers are now the platform's, in the platform's words |
 * | a second progress percentage beside the bar, plus `completedItems/totalItems` | one number, once |
 *
 * The step count and the percentage are still local — they describe *this form*,
 * not the platform's decision, and a student on a train with no signal must still
 * see where they are. The **blockers** are the platform's, and when the platform
 * has not answered this says so rather than showing an empty list as success.
 */
import { AlertCircle, CheckCircle2, HelpCircle, Loader2 } from 'lucide-react'

import type { ReadinessBlocker } from '@/types/database'

export interface WizardProgressSummaryProps {
  stepNumber: number
  totalSteps: number
  /** Where the draft came from, as plain text in the progress row (task 25.1). */
  modeLabel?: string
  modeDescription?: string
  /** Local form completion across every step. A view number, never a gate. */
  percentComplete: number
  /** The platform's blockers, in the platform's order (task 6.5). */
  blockers: ReadinessBlocker[]
  /** True while the platform's readiness is still being read. */
  readinessLoading: boolean
  /** True when there is a draft but the platform did not answer. */
  readinessUnavailable: boolean
  /** The platform's own can-submit, or `null` when unknown. */
  canSubmit: boolean | null
  /** True before an online draft exists, when there is nothing to evaluate yet. */
  notEvaluatedYet: boolean
  onRetryReadiness: () => void
}

/** How many blockers to name before summarising the rest. */
const NAMED_BLOCKERS = 2

export function WizardProgressSummary({
  stepNumber,
  totalSteps,
  modeLabel,
  modeDescription,
  percentComplete,
  blockers,
  readinessLoading,
  readinessUnavailable,
  canSubmit,
  notEvaluatedYet,
  onRetryReadiness,
}: WizardProgressSummaryProps) {
  const named = blockers.slice(0, NAMED_BLOCKERS)
  const remaining = Math.max(blockers.length - named.length, 0)

  return (
    <section
      data-testid="wizard-progress-summary"
      aria-label="Your progress"
      className="rounded-lg border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="break-words text-base sm:text-sm font-semibold text-foreground">
          <span>Step {stepNumber} of {totalSteps}</span>
          <span aria-hidden="true"> · </span>
          <span data-testid="wizard-progress-percent">{percentComplete}%</span>
        </p>
        {modeLabel && (
          <p
            data-text-role="caption"
            className="text-sm sm:text-xs text-muted-foreground"
            role="status"
            aria-live="polite"
            data-testid="wizard-mode-summary"
            title={modeDescription}
          >
            {modeLabel}
          </p>
        )}
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Application progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentComplete}
      >
        <div
          className="h-2 w-full origin-left rounded-full bg-primary transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{ transform: `scaleX(${percentComplete / 100})` }}
        />
      </div>
      <div className="mt-3" data-testid="wizard-current-blockers">
        {notEvaluatedYet ? (
          <p className="flex items-start gap-2 text-base sm:text-sm text-muted-foreground">
            <HelpCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="break-words">
              Choose your programme and intake, and we will check what is still needed.
            </span>
          </p>
        ) : readinessLoading ? (
          <p className="flex items-start gap-2 text-base sm:text-sm text-muted-foreground" aria-live="polite">
            <Loader2
              className="mt-0.5 h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            <span className="min-w-0 break-words">Checking what is still needed…</span>
          </p>
        ) : readinessUnavailable ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <p className="flex items-start gap-2 text-base sm:text-sm text-foreground">
              <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="break-words">
                We could not check your application just now. Everything you have entered is saved.
              </span>
            </p>
            <button
              type="button"
              onClick={onRetryReadiness}
              className="inline-flex min-h-touch shrink-0 items-center rounded-lg border border-border px-3 text-base sm:text-sm font-medium text-primary hover:bg-primary/5"
            >
              Check again
            </button>
          </div>
        ) : blockers.length === 0 ? (
          <p
            className="flex items-start gap-2 text-base sm:text-sm font-medium text-success"
            data-testid="wizard-no-blockers"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="break-words">
              {canSubmit
                ? 'Everything we need is on file. You can submit your application.'
                : 'Nothing is outstanding on your application right now.'}
            </span>
          </p>
        ) : (
          <div>
            <p className="flex items-start gap-2 text-base sm:text-sm font-semibold text-foreground">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              <span className="min-w-0 break-words">
                {blockers.length === 1 ? '1 thing is still needed' : `${blockers.length} things are still needed`}
              </span>
            </p>
            <ul className="mt-2 space-y-1.5">
              {named.map(blocker => (
                <li
                  key={blocker.code}
                  className="break-words text-base sm:text-sm text-muted-foreground"
                  data-testid="wizard-blocker"
                  data-blocker-code={blocker.code}
                >
                  {blocker.message}
                </li>
              ))}
            </ul>
            {remaining > 0 && (
              <p className="mt-1.5 text-base sm:text-sm text-muted-foreground">
                and {remaining} more, listed in the requirements below.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
