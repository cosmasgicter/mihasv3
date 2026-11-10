import React, { useCallback, useState } from 'react'
import { FileText, Clock, CheckCircle, XCircle, AlertTriangle, User, Calendar, Phone, Mail, GraduationCap, Building } from 'lucide-react'
import { ApplicationApprovalActions } from './ApplicationApprovalActions'
import { DraftBadge } from './DraftBadge'
import { AdminRecordActions } from '@/components/admin/AdminRecordActions'
import { applicationDecisionCommandCount } from '@/lib/adminApplicationCommands'
import type { AdminRecordCommand } from '@/lib/adminRecordCommands'
import { useToastStore } from '@/hooks/useToast'
import { CommunicationModal, type CommunicationData } from '@/components/admin/CommunicationModal'
import { applicationService } from '@/services/applications'
import { notificationService } from '@/services/notifications'
import { getPaymentStatusLabel, normalizePaymentStatus } from '@/lib/paymentStatus'
import { formatDate } from '@/lib/dateFormat'
import { StatusPill } from '@/components/ui/StatusPill'
import type { ApplicationSummary } from '@/hooks/admin/useApplicationsData'
import type { StatusCommandOptions } from '@/types/statusCommand'

export type { ApplicationSummary } from '@/hooks/admin/useApplicationsData'

// Institution display name resolver.
// Beanola is a multi-school platform (R9): the backend supplies the canonical
// institution display value on each application row, so there is no hard-coded
// client fallback map here. Unknown/empty values fall through to a neutral
// placeholder rather than a default school identity.
export const getInstitutionName = (name?: string): string => {
  const trimmed = name?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : 'Not specified'
}

export interface ApplicationCardProps {
  application: ApplicationSummary
  onStatusUpdate: (id: string, status: string, options?: StatusCommandOptions) => void | Promise<void>
  onPaymentStatusUpdate: (id: string, status: string, verificationNotes?: string) => void | Promise<void>
  onViewDetails: (id: string) => void
  updatingStatus: boolean
  updatingPayment: boolean
  isSelected?: boolean
  onSelect?: (id: string, selected: boolean) => void
}

function areApplicationCardPropsEqual(
  prev: ApplicationCardProps,
  next: ApplicationCardProps
): boolean {
  return (
    prev.application.id === next.application.id &&
    prev.application.status === next.application.status &&
    prev.application.payment_status === next.application.payment_status &&
    prev.application.submitted_at === next.application.submitted_at &&
    prev.application.updated_at === next.application.updated_at &&
    prev.application.created_at === next.application.created_at &&
    prev.application.lastUpdated === next.application.lastUpdated &&
    prev.application.completionPercentage === next.application.completionPercentage &&
    prev.application.points === next.application.points &&
    prev.application.last_payment_audit_notes === next.application.last_payment_audit_notes &&
    prev.updatingStatus === next.updatingStatus &&
    prev.updatingPayment === next.updatingPayment &&
    prev.isSelected === next.isSelected &&
    prev.onStatusUpdate === next.onStatusUpdate &&
    prev.onPaymentStatusUpdate === next.onPaymentStatusUpdate &&
    prev.onViewDetails === next.onViewDetails &&
    prev.onSelect === next.onSelect
  )
}

export const ApplicationCard = React.memo<ApplicationCardProps>(function ApplicationCard({
  application: app,
  onStatusUpdate,
  onPaymentStatusUpdate,
  onViewDetails,
  updatingStatus,
  updatingPayment,
  isSelected = false,
  onSelect
}) {
  const [showCommunicationModal, setShowCommunicationModal] = useState(false)
  const { success: showSuccess } = useToastStore()

  // Internalized getStatusBadge function with useCallback
  const getStatusBadge = useCallback((status: string) => {
    return <StatusPill status={status} size="sm" />
  }, [])

  // Internalized getPaymentBadge function with useCallback
  const getPaymentBadge = useCallback((paymentStatus: string) => {
    const normalizedStatus = normalizePaymentStatus(paymentStatus)
    const paymentConfig = {
      not_paid: { color: 'bg-muted/80 text-muted-foreground', icon: Clock },
      pending_review: { color: 'bg-warning/10 text-warning', icon: Clock },
      verified: { color: 'bg-success/10 text-success', icon: CheckCircle },
      rejected: { color: 'bg-destructive/10 text-destructive', icon: XCircle },
      deferred: { color: 'bg-warning/10 text-warning', icon: AlertTriangle }
    }

    const config = paymentConfig[normalizedStatus]
    const Icon = config.icon

    return (
      <span className={`inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium leading-tight ${config.color}`}>
        <Icon className="h-3 w-3 shrink-0" />
        <span className="min-w-0 break-words">{getPaymentStatusLabel(normalizedStatus)}</span>
      </span>
    )
  }, [])

  const handleSendMessage = async (data: CommunicationData) => {
    try {
      const title = data.subject?.trim() || (
        data.channel === 'in-app'
            ? 'Portal update from Beanola Admissions'
            : 'Message from Beanola Admissions'
      )

      if (data.channel === 'email') {
        const sent = await notificationService.sendEmail({
          recipientEmail: app.email,
          subject: title,
          body: data.message,
        })

        if (!sent) {
          throw new Error('Email delivery request was rejected by the backend')
        }
      } else if (data.channel === 'in-app') {
        await applicationService.sendNotification(app.id, {
          title,
          message: data.message,
        })
      } else {
        throw new Error('SMS delivery is not available yet')
      }

      showSuccess('Message sent', 'Your message has been sent successfully')
    } catch {
      throw new Error('Failed to send message')
    }
  }

  const getPointsColor = (points: number) => {
    if (points <= 15) return 'text-success' // Lower is better
    if (points <= 25) return 'text-warning'
    return 'text-error'
  }

  const documentsCount = [app.result_slip_url, app.extra_kyc_url].filter(Boolean).length

  /**
   * How many commands the decision block contributes to this row's disclosure
   * (task 11.4). Enumerated by `adminApplicationCommands`, which is a mirror of
   * `ApplicationApprovalActions` and is drift-guarded against it, so the label on
   * the trigger states a number the panel really holds.
   */
  const decisionCommandCount = applicationDecisionCommandCount({
    status: app.status,
    paymentStatus: app.payment_status,
  })

  /**
   * The row's own commands, as data.
   *
   * "Open review" opens the review workspace. It is deliberately **not** labelled
   * "Review": the decision block's transition out of `submitted` already carries
   * that exact word, and once both live on one row a sheet with two differently
   * behaving "Review" buttons is an ambiguous accessible name (R16.2) — one opens
   * a surface, the other records a state change.
   */
  const commands: AdminRecordCommand[] = [
    {
      id: 'review',
      label: 'Open review',
      prominence: 'primary',
      onSelect: () => onViewDetails(app.id),
    },
    ...(app.isDraft
      ? [
          {
            id: 'contact',
            label: 'Contact applicant',
            prominence: 'overflow' as const,
            onSelect: () => setShowCommunicationModal(true),
          },
        ]
      : []),
  ]

  return (
    <article className={`relative min-w-0 rounded-lg border bg-card p-4 shadow-sm transition-colors duration-200 sm:p-5 ${
      isSelected ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20' : 'border-border/60 hover:border-primary/20'
    }`}>
      {/* Selection Checkbox */}
      {onSelect && (
        <div className="absolute right-4 top-4">
          <input
            aria-label={`Select application ${app.application_number}`}
            type="checkbox"
            checked={isSelected}
            onChange={(e) => onSelect(app.id, e.target.checked)}
            className="h-4 w-4 rounded-md border-2 border-input text-primary checked:bg-primary checked:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-colors"
          />
        </div>
      )}
      {/* Header */}
      <div className={onSelect ? 'mb-4 flex min-w-0 items-start justify-between gap-3 pr-8 sm:gap-4' : 'mb-4 flex min-w-0 items-start justify-between gap-3 sm:gap-4'}>
        <div className="flex-1 min-w-0">
          <div className="mb-1 flex min-w-0 items-start gap-2">
            <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <h3 className="min-w-0 break-words text-base font-semibold leading-snug text-foreground">{app.full_name}</h3>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="min-w-0 break-all font-mono">#{app.application_number}</span>
            <span>•</span>
            <Calendar className="h-3 w-3 shrink-0" />
            <span className="min-w-0 break-words">{formatDate(app.submitted_at || app.updated_at || app.created_at)}</span>
          </div>
        </div>
        <div className="flex max-w-[48%] min-w-0 flex-col items-end gap-2 sm:max-w-[52%]">
          {app.isDraft ? (
            <DraftBadge
              completionPercentage={app.completionPercentage}
              lastUpdated={app.lastUpdated}
            />
          ) : (
            getStatusBadge(app.status)
          )}
        </div>
      </div>

      {/*
        Draft status banner. Design tokens, not raw palette steps (admissions-v2
        task 11.5, R16.4 — task 11.4 §11 named `bg-yellow-50` / `text-yellow-800`
        here). `warning` is the semantic role this banner has always had, and it
        is the token the rest of the roster row already uses.
      */}
      {app.isDraft && (
        <div className="mb-4 rounded-lg border border-warning/30 bg-warning/5 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              <span className="min-w-0 break-words text-sm font-medium text-warning">Draft application</span>
            </div>
            <div className="min-w-0 break-words text-xs text-muted-foreground">
              Last updated: {formatDate(app.lastUpdated)}
            </div>
          </div>
          {/*
            The progress bar appears only when the server told us how complete
            the draft is. A bar drawn at 0% for an unknown would read as "this
            applicant has done nothing" (task 9.1, R8.6).
          */}
          {typeof app.completionPercentage === 'number' && (
            <div className="mt-2">
              <div
                className="h-2 w-full rounded-full bg-warning/15"
                role="progressbar"
                aria-valuenow={app.completionPercentage}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Draft ${app.completionPercentage}% complete`}
              >
                <div
                  className="h-2 rounded-full bg-warning transition-all duration-300 motion-reduce:transition-none"
                  style={{ width: `${app.completionPercentage}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Contact Info */}
      <div className="mb-4 space-y-1.5">
        <div className="flex min-w-0 items-start gap-2 text-xs text-muted-foreground">
          <Mail className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="min-w-0 break-all">{app.email}</span>
        </div>
        {app.phone && (
          <div className="flex min-w-0 items-start gap-2 text-xs text-muted-foreground">
            <Phone className="mt-0.5 h-3 w-3 shrink-0" />
            <span className="min-w-0 break-words">{app.phone}</span>
          </div>
        )}
      </div>

      {/*
        Program info — a *section* of this card, not a card inside it
        (admissions-v2 task 11.5, R16.4; PRODUCT.md "one container deep").

        This block was `rounded-lg border border-border bg-muted/40 p-3`: a second
        bordered, filled, rounded surface drawn inside a surface that already has
        a border, a fill and a shadow. Task 11.4 §11 named it as the roster card's
        remaining inherited nesting and left it here. It is a rule separating the
        applicant's contact details above from the payment/grades grid below now —
        the same grouping, one container fewer.
      */}
      <div className="mb-4 border-t border-border/45 pt-3">
        <div className="mb-1 flex min-w-0 items-start gap-2">
          <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 break-words text-sm font-medium text-foreground">{app.program}</span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <Building className="h-3 w-3 shrink-0" />
          <span className="min-w-0 break-words">{getInstitutionName(app.institution)}</span>
          <span>•</span>
          <span className="min-w-0 break-words">{app.intake}</span>
        </div>
      </div>


      {/* Payment & Grades */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <div className="text-xs text-muted-foreground mb-1">Payment status</div>
          {getPaymentBadge(app.payment_status)}
          {/*
            The amounts are printed only when the server sent them. The scoped
            roster contract (task 9.1) does not carry money — `application_fee`
            and `paid_amount` are `null` on a roster row and the review workspace
            fetches them for the one application an operator opened — so this line
            used to render the string `K0 / Knull` on every row at every width. A
            `null` interpolated into a currency string is not a number, and task
            9.1's own rule for this contract is that unknown means "not on this
            surface" and renders nothing, never a zero that reads as a fact.
          */}
          {app.application_fee !== null && app.application_fee !== undefined && (
            <div className="mt-1 min-w-0 break-words text-sm font-medium text-foreground">
              {app.payment_currency && app.payment_currency !== 'ZMW'
                ? `${app.payment_currency} ${app.paid_amount ?? 0} / ${app.payment_currency} ${app.application_fee}`
                : `K${app.paid_amount ?? 0} / K${app.application_fee}`}
            </div>
          )}
          {normalizePaymentStatus(app.payment_status) === 'deferred' && (
            <div className="mt-1 flex items-center gap-1 text-xs text-warning">
              <Phone className="h-3 w-3" />
              <span>Contact student</span>
            </div>
          )}
        </div>
        
        {/*
          Grades are detail data, not triage data: the scoped roster contract
          (task 9.1) does not carry them, and the review workspace fetches them
          for the one application an operator opened. `null` therefore means "not
          on this surface" and renders nothing — never "0 subjects".
        */}
        {typeof app.total_subjects === 'number' && app.total_subjects > 0 && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">Academic</div>
            <div className="text-sm">
              <span className="text-foreground">{app.total_subjects} subjects</span>
              {typeof app.points === 'number' && app.points > 0 && (
                <div className={`font-medium ${getPointsColor(app.points)}`}>
                  Points: {app.points}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {app.last_payment_audit_notes && (
        <div className="mb-4 rounded-lg border border-warning/30 bg-warning/5 p-3">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-warning">
            Latest payment review note
          </div>
          <div className="text-sm text-foreground break-words">
            {app.last_payment_audit_notes}
          </div>
        </div>
      )}

      {app.grades_summary && (
        <div className="mb-4 rounded-lg border border-border bg-muted p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-foreground mb-2">
            Grades summary
          </div>
          <div className="text-sm text-foreground whitespace-pre-line break-words">
            {app.grades_summary}
          </div>
        </div>
      )}

      {/* Documents */}
      {documentsCount > 0 && (
        <div className="mb-4 flex min-w-0 items-center gap-2 rounded-lg border border-primary/15 bg-primary/5 p-2">
          <FileText className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 break-words text-sm text-info-strong">{documentsCount} document{documentsCount > 1 ? 's' : ''} uploaded</span>
        </div>
      )}

      {/*
        One primary command and one counted disclosure for every remaining one
        (task 11.4, R16.1-R16.2 — the roster half of ADM-01).

        What this row used to end in, at 320 px: the decision block's own four
        status buttons and up to three payment buttons, then a full-width "View
        Details", then "Contact", then a third control whose only behaviour was
        `onViewDetails` again under a document icon — up to ten equally prominent
        targets, repeated per application, so the applicant scrolled off the
        screen under the row's own controls.

        "Review" is the primary because the review workspace is where a decision
        is actually defensible: it carries the server's `allowed_transitions`, its
        published capability matrix, the evidence, the payment ledger and the
        history. Every other command is one tap away in a sheet whose label counts
        them — the same trade task 11.3 made for the student's secondary
        documents, and the count is drift-guarded against what the decision block
        really renders.
      */}
      <div className="mt-4 border-t border-border/40 pt-4">
        <AdminRecordActions
          testId="application-record-actions"
          recordLabel={`application ${app.application_number}`}
          commands={commands}
          additionalOverflowCount={decisionCommandCount}
          announcement={
            updatingStatus || updatingPayment
              ? `Updating application ${app.application_number}…`
              : ''
          }
          overflowContent={
            decisionCommandCount > 0 ? (
              <ApplicationApprovalActions
                applicationId={app.id}
                currentStatus={app.status}
                currentPaymentStatus={app.payment_status}
                onStatusUpdate={async (id, status, options) => {
                  await (options ? onStatusUpdate(id, status, options) : onStatusUpdate(id, status))
                }}
                onPaymentStatusUpdate={async (id, status, verificationNotes) => {
                  await onPaymentStatusUpdate(id, status, verificationNotes)
                }}
                showStatusSummary={false}
                disabled={updatingStatus || updatingPayment}
              />
            ) : null
          }
        />
      </div>

      {/* Communication Modal */}
      <CommunicationModal
        open={showCommunicationModal}
        onOpenChange={setShowCommunicationModal}
        applicant={{
          id: app.id,
          full_name: app.full_name,
          email: app.email,
          phone: app.phone,
          application_id: app.application_number
        }}
        onSend={handleSendMessage}
      />

      {/* Loading Overlays */}
      {(updatingStatus || updatingPayment) && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-card/80 ">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <div className="h-2.5 w-2.5 rounded-full bg-primary animate-pulse" aria-hidden="true" />
            <span>Updating…</span>
          </div>
        </div>
      )}
    </article>
  )
}, areApplicationCardPropsEqual)

ApplicationCard.displayName = 'ApplicationCard'
