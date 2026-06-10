import { Building2, FileCheck2, Mail, Phone, Globe, Receipt } from 'lucide-react'

import { animateClasses } from '@/lib/animations'
import { useOptimizedAnimation } from '@/hooks/useOptimizedAnimation'

import type { AssignmentPreview } from '@/services/catalog'
import AssignmentRecoveryPanel from './AssignmentRecoveryPanel'
import type { AssignmentRecoveryGuidance } from '../lib/assignmentRecovery'

interface AssignedSchoolStepProps {
  title: string
  preview: AssignmentPreview | null
  isLoading: boolean
  error?: string | null
  /** Recoverable guidance + ordered actions for an assignment failure (R10.4). */
  recovery?: AssignmentRecoveryGuidance | null
  /** Re-run the assignment preview (e.g. after a transient failure). */
  onRetry?: () => void
  /** Return to the programme + intake step to choose a different option (R10.4). */
  onChangeSelection?: () => void
  /** Record interest client-side so the student can be notified of an opening. */
  onJoinInterestList?: () => void
  /** Whether interest has already been recorded for this program + intake. */
  interestRecorded?: boolean
  /** `mailto:` URL for admissions, when an address is known. */
  contactMailto?: string | null
}

function formatFee(fee: AssignmentPreview['fee']): string | null {
  if (!fee) return null
  const amount = Number(fee.amount)
  const display = Number.isFinite(amount) ? amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : fee.amount
  return `${fee.currency} ${display}`
}

/**
 * Step 2 of the program-first wizard (R10.1, R10.2): show the school assigned
 * by the backend for the chosen programme + intake, the resolved fee, the
 * required documents, and the school contact — all before payment. Payment is
 * gated on this step resolving successfully (R10.3).
 *
 * On assignment failure this renders a recoverable path rather than a dead-end
 * (R10.4, R2.6): the student can choose another intake, join the interest list,
 * or contact admissions. For a transient/unknown failure a retry is also
 * offered. The same recoverable guidance is reused for submit-time
 * re-assignment failures (R2.7).
 */
const AssignedSchoolStep = ({
  title,
  preview,
  isLoading,
  error,
  recovery,
  onRetry,
  onChangeSelection,
  onJoinInterestList,
  interestRecorded,
  contactMailto,
}: AssignedSchoolStepProps) => {
  const { shouldAnimate } = useOptimizedAnimation()
  const feeLabel = preview ? formatFee(preview.fee) : null
  const requiredDocs = preview?.required_documents ?? []
  const contact = preview?.contact

  return (
    <div
      key="step-assigned-school"
      className={`overflow-visible bg-card rounded-lg shadow-sm ring-1 ring-border/50 p-5 sm:p-8 ${shouldAnimate ? animateClasses.fadeIn : ''}`}
      data-testid="assigned-school-step"
    >
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Confirm the school assigned to you, the application fee, and the documents you will need before you pay.
        </p>
      </div>

      {isLoading && (
        <div
          className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/40 px-4 py-6 text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary/40 border-t-primary" aria-hidden="true" />
          <span>Finding the school assigned to your programme…</span>
        </div>
      )}

      {!isLoading && (error || recovery) && (
        <AssignmentRecoveryPanel
          guidance={
            recovery ?? {
              code: null,
              title: "We couldn't confirm your school yet",
              message:
                error ||
                'We could not confirm your assigned school for this programme and intake. You can try again, choose another intake, or contact admissions for help.',
              actions: ['change-intake', 'contact-admissions'],
            }
          }
          onChangeIntake={onChangeSelection ?? (() => {})}
          onRetry={(!recovery?.code && onRetry) ? onRetry : undefined}
          onJoinInterestList={onJoinInterestList}
          interestRecorded={interestRecorded}
          contactMailto={contactMailto}
        />
      )}

      {!isLoading && !error && !recovery && preview && (
        <div className="space-y-5">
          {/* Assigned school */}
          <section
            aria-labelledby="assigned-school-heading"
            className="rounded-lg border border-primary/20 bg-primary/5 p-4 sm:p-5"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Building2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Assigned school</p>
                <h3 id="assigned-school-heading" className="text-base font-semibold text-foreground">
                  {preview.assigned_school.full_name || preview.assigned_school.name}
                </h3>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {preview.program_name} — {preview.intake_name}
                </p>
              </div>
            </div>
          </section>

          {/* Application fee */}
          <section aria-labelledby="assigned-fee-heading" className="rounded-lg border border-border/60 p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
                <Receipt className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h3 id="assigned-fee-heading" className="text-sm font-medium text-foreground">Application fee</h3>
                {feeLabel ? (
                  <p className="font-mono text-base font-semibold text-foreground">{feeLabel}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    The fee will be confirmed at the payment step.
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Required documents */}
          <section aria-labelledby="assigned-docs-heading" className="rounded-lg border border-border/60 p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2">
              <FileCheck2 className="h-5 w-5 text-foreground" aria-hidden="true" />
              <h3 id="assigned-docs-heading" className="text-sm font-medium text-foreground">Required documents</h3>
            </div>
            {requiredDocs.length > 0 ? (
              <ul className="space-y-2">
                {requiredDocs.map((doc, index) => (
                  <li key={`${doc.document_type}-${index}`} className="flex items-start gap-2 text-sm text-foreground">
                    <FileCheck2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" aria-hidden="true" />
                    <span>
                      {doc.label}
                      {!doc.required && <span className="ml-1 text-xs text-muted-foreground">(optional)</span>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Standard documents apply: your result slip and an NRC or passport.
              </p>
            )}
          </section>

          {/* School contact */}
          {contact && (contact.email || contact.phone || contact.website) && (
            <section aria-labelledby="assigned-contact-heading" className="rounded-lg border border-border/60 p-4 sm:p-5">
              <h3 id="assigned-contact-heading" className="mb-3 text-sm font-medium text-foreground">School contact</h3>
              <ul className="space-y-2 text-sm">
                {contact.email && (
                  <li className="flex items-center gap-2">
                    <Mail className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
                    <a href={`mailto:${contact.email}`} className="text-primary hover:underline break-all">{contact.email}</a>
                  </li>
                )}
                {contact.phone && (
                  <li className="flex items-center gap-2">
                    <Phone className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
                    <a href={`tel:${contact.phone}`} className="text-primary hover:underline">{contact.phone}</a>
                  </li>
                )}
                {contact.website && (
                  <li className="flex items-center gap-2">
                    <Globe className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="break-all text-foreground">{contact.website}</span>
                  </li>
                )}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

export default AssignedSchoolStep
