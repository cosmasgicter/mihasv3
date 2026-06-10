import { AlertTriangle, ArrowLeft, BellRing, Check, Mail, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/Button'

import type {
  AssignmentRecoveryActionKey,
  AssignmentRecoveryGuidance,
} from '../lib/assignmentRecovery'

export interface AssignmentRecoveryPanelProps {
  guidance: AssignmentRecoveryGuidance
  /** Return to the programme + intake step to choose a different option (R10.4). */
  onChangeIntake: () => void
  /** Re-run the assignment preview. Only shown for transient/unknown failures. */
  onRetry?: () => void
  /** Record interest client-side so the student can be notified of an opening. */
  onJoinInterestList?: () => void
  /** Whether interest has already been recorded for this program + intake. */
  interestRecorded?: boolean
  /** `mailto:` URL for the assigned-school / admissions contact, when available. */
  contactMailto?: string | null
  /** In-app fallback contact route used when no admissions email is known. */
  contactHref?: string
}

/**
 * Recoverable assignment-failure UI (R10.4, R2.6, R2.7).
 *
 * Renders the failure guidance plus an ordered, never-empty set of recovery
 * actions — choose another intake, join the interest list, contact admissions —
 * so the student is never dead-ended. Used both at the assigned-school
 * checkpoint (preview `NO_ELIGIBLE_OFFERING`) and after a submit-time
 * re-assignment failure (`OFFERING_NO_LONGER_AVAILABLE` / `OFFERING_CAPACITY_FULL`).
 */
const AssignmentRecoveryPanel = ({
  guidance,
  onChangeIntake,
  onRetry,
  onJoinInterestList,
  interestRecorded = false,
  contactMailto,
  contactHref = '/contact',
}: AssignmentRecoveryPanelProps) => {
  const renderAction = (action: AssignmentRecoveryActionKey) => {
    switch (action) {
      case 'change-intake':
        return (
          <Button
            key="change-intake"
            type="button"
            variant="primary"
            size="md"
            onClick={onChangeIntake}
            className="w-full justify-start sm:w-auto"
          >
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            Choose another intake
          </Button>
        )
      case 'interest-list':
        if (!onJoinInterestList) return null
        return interestRecorded ? (
          <p
            key="interest-list"
            className="inline-flex items-center gap-2 text-sm font-medium text-success"
            role="status"
          >
            <Check className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            You&apos;re on the interest list — we&apos;ll be in touch if a place opens.
          </p>
        ) : (
          <Button
            key="interest-list"
            type="button"
            variant="outline"
            size="md"
            onClick={onJoinInterestList}
            className="w-full justify-start sm:w-auto"
          >
            <BellRing className="mr-2 h-4 w-4" aria-hidden="true" />
            Join the interest list
          </Button>
        )
      case 'contact-admissions':
        return (
          <Button key="contact-admissions" asChild variant="ghost" size="md" className="w-full justify-start sm:w-auto">
            <a href={contactMailto || contactHref}>
              <Mail className="mr-2 h-4 w-4" aria-hidden="true" />
              Contact admissions
            </a>
          </Button>
        )
      default:
        return null
    }
  }

  return (
    <section
      role="alert"
      aria-live="assertive"
      aria-labelledby="assignment-recovery-heading"
      data-testid="assignment-recovery-panel"
      data-failure-code={guidance.code ?? 'UNKNOWN'}
      className="rounded-lg border border-warning/30 bg-warning/5 p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 space-y-1.5">
          <h3 id="assignment-recovery-heading" className="text-base font-semibold text-foreground">
            {guidance.title}
          </h3>
          <p className="text-sm text-muted-foreground">{guidance.message}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-col flex-wrap gap-3 sm:flex-row sm:items-center">
        {onRetry && (
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={onRetry}
            className="w-full justify-start sm:w-auto"
          >
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Try again
          </Button>
        )}
        {guidance.actions.map(renderAction)}
      </div>
    </section>
  )
}

export default AssignmentRecoveryPanel
