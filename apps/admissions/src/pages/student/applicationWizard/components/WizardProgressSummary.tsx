/**
 * One progress row (tasks 11.2, 25.1, 25.5).
 *
 * "Step 4 of 6 · 62%", where the draft came from as plain text, and one bar. The
 * heading and the instruction are the page's (`PageShell`), and the platform's
 * blockers are in `WizardStillNeeded`, so this row says where the student is and
 * nothing else.
 *
 * The step count and the percentage describe *this form*, not the platform's
 * decision, so a student on a train with no signal still sees where they are. The
 * percentage is `Math.floor(completedItems / totalItems * 100)` of the wizard's one
 * readiness, passed in; this component computes nothing.
 */
export interface WizardProgressSummaryProps {
  stepNumber: number
  totalSteps: number
  /** Where the draft came from, as plain text in the progress row (task 25.1). */
  modeLabel?: string
  modeDescription?: string
  /** Local form completion across every step. A view number, never a gate. */
  percentComplete: number
}


export function WizardProgressSummary({
  stepNumber,
  totalSteps,
  modeLabel,
  modeDescription,
  percentComplete,
}: WizardProgressSummaryProps) {

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
    </section>
  )
}
