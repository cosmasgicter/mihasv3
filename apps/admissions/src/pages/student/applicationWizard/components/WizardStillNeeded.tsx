/**
 * The one "Still needed" list (task 25.2, R15.3).
 *
 * Replaces four rails that said overlapping things: Step Checklist, Application
 * Preview, Step notes and "Your applications". What is left is what the student
 * can act on:
 *
 * - the current step's failing readiness items, each with a "Go to field" link;
 * - the platform's own check of the whole application, in the platform's words
 *   (task 6.5's blockers; the same evaluator submit re-runs), kept apart from the
 *   step list because it is a different question and a different authority;
 * - "Switch application" and "Start a new application".
 *
 * On a phone it is a collapsed disclosure below the form, labelled with the count.
 * From `lg` it is one card in the right rail. One instance either way, so a screen
 * reader meets it once. The application preview's contents are not repeated: the
 * review step shows them.
 *
 * This component derives no requirement of its own. The step items come from the
 * wizard's one readiness (`buildWizardReadiness`); the platform's blockers come from
 * `useWizardReadiness`.
 */
import { useId, useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronDown, ClipboardList, FilePlus2, FileText, HelpCircle, Loader2 } from 'lucide-react'
import { useResponsive } from '@/hooks/useResponsive'
import { cn } from '@/lib/utils'
import type { ReadinessBlocker } from '@/types/database'
import type { WizardReadinessItem } from '../lib/wizardReadiness'

export interface WizardStillNeededProps {
  /** The current step's failing readiness items. */
  items: Array<Pick<WizardReadinessItem, 'field' | 'label' | 'message'>>
  onGoToField: (field: string) => void
  onSwitchApplication: () => void
  onStartNew: () => void
  /** The platform's blockers, in the platform's order. */
  blockers: ReadinessBlocker[]
  readinessLoading: boolean
  /** True when there is a draft but the platform did not answer. */
  readinessUnavailable: boolean
  /** The platform's own can-submit, or `null` when unknown. */
  canSubmit: boolean | null
  /** True before an online draft exists, when there is nothing to evaluate yet. */
  notEvaluatedYet: boolean
  onRetryReadiness: () => void
}

/** How many platform blockers to name before summarising the rest. */
const NAMED_BLOCKERS = 2

const linkButton =
  'inline-flex min-h-touch shrink-0 items-center rounded-lg px-2 text-base sm:text-sm font-medium text-primary hover:bg-primary/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring'

function PlatformCheck({
  blockers,
  readinessLoading,
  readinessUnavailable,
  canSubmit,
  notEvaluatedYet,
  onRetryReadiness,
}: Pick<
  WizardStillNeededProps,
  'blockers' | 'readinessLoading' | 'readinessUnavailable' | 'canSubmit' | 'notEvaluatedYet' | 'onRetryReadiness'
>) {
  const named = blockers.slice(0, NAMED_BLOCKERS)
  const remaining = Math.max(blockers.length - named.length, 0)
  // Before a draft exists there is nothing to check, and the step's own instruction
  // already says what to do (task 26.5, R14.8): render nothing.
  if (notEvaluatedYet) return null
  return (
    <div data-testid="wizard-current-blockers">
      <h3 className="text-base sm:text-sm font-semibold text-foreground">Whole application</h3>
      <div className="mt-2">
        {readinessLoading ? (
          <p className="flex items-start gap-2 text-base sm:text-sm text-muted-foreground" aria-live="polite">
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            <span className="min-w-0 break-words">Checking what is still needed…</span>
          </p>
        ) : readinessUnavailable ? (
          <div className="flex flex-col gap-2">
            <p className="flex items-start gap-2 text-base sm:text-sm text-foreground">
              <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="break-words">
                We could not check your application just now. Everything you have entered is saved.
              </span>
            </p>
            <button
              type="button"
              onClick={onRetryReadiness}
              className="inline-flex min-h-touch w-fit items-center rounded-lg border border-border px-3 text-base sm:text-sm font-medium text-primary hover:bg-primary/5"
            >
              Check again
            </button>
          </div>
        ) : blockers.length === 0 ? (
          <p
            className="flex items-start gap-2 text-base sm:text-sm font-medium text-foreground"
            data-testid="wizard-no-blockers"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
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
              <p className="mt-1.5 text-base sm:text-sm text-muted-foreground">and {remaining} more.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function WizardStillNeeded({
  items,
  onGoToField,
  onSwitchApplication,
  onStartNew,
  ...platform
}: WizardStillNeededProps) {
  const { isMobile } = useResponsive()
  const [openOnMobile, setOpenOnMobile] = useState(false)
  const idBase = useId()
  const expanded = !isMobile || openOnMobile
  const count = items.length
  const heading = count === 0 ? 'Nothing still needed on this step' : `${count} still needed`

  const body = (
    <div
      id="wizard-context-region"
      data-testid="wizard-context-region"
      className={cn('space-y-4', isMobile && 'mt-3')}
    >
      {count === 0 ? (
        <p className="flex items-start gap-2 text-base sm:text-sm text-foreground">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          <span>This step is complete.</span>
        </p>
      ) : (
        <ul className="space-y-1" data-testid="wizard-step-needed">
          {items.map(item => {
            const labelId = `${idBase}-${item.field}`
            return (
              <li key={item.field} className="flex items-center justify-between gap-3">
                <span id={labelId} className="min-w-0 break-words text-base sm:text-sm text-foreground">
                  {item.label}
                </span>
                <button
                  type="button"
                  className={linkButton}
                  aria-describedby={labelId}
                  onClick={() => onGoToField(item.field)}
                >
                  Go to field
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <PlatformCheck {...platform} />
      <div className="flex flex-col gap-1 border-t border-border pt-3">
        <button type="button" className={cn(linkButton, 'w-full justify-start')} onClick={onSwitchApplication}>
          <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
          Switch application
        </button>
        <button type="button" className={cn(linkButton, 'w-full justify-start')} onClick={onStartNew}>
          <FilePlus2 className="mr-2 h-4 w-4" aria-hidden="true" />
          Start a new application
        </button>
      </div>
    </div>
  )

  return (
    <section
      data-testid="wizard-context-panel"
      aria-labelledby="wizard-still-needed-heading"
      className={cn(!isMobile && 'rounded-lg border border-border bg-card p-4 sm:p-5')}
    >
      <h2
        id="wizard-still-needed-heading"
        className={cn(isMobile ? 'sr-only' : 'mb-3 text-lg font-semibold text-foreground')}
      >
        Still needed
      </h2>
      {isMobile && (
        <button
          type="button"
          onClick={() => setOpenOnMobile(open => !open)}
          aria-expanded={openOnMobile}
          aria-controls="wizard-context-region"
          data-testid="wizard-context-toggle"
          className="flex min-h-touch w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left text-base sm:text-sm font-semibold text-foreground hover:bg-accent"
        >
          <span className="flex min-w-0 items-center gap-2">
            <ClipboardList className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="break-words">{heading}</span>
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none',
              openOnMobile && 'rotate-180',
            )}
            aria-hidden="true"
          />
        </button>
      )}
      {expanded && body}
    </section>
  )
}
