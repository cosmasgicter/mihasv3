import React, { useCallback, useState } from 'react'
import { Eye, FileText, Clock, CheckCircle, XCircle, AlertTriangle, User, Calendar, Phone, Mail, GraduationCap, Building, MessageSquare } from 'lucide-react'
import { ApplicationApprovalActions } from './ApplicationApprovalActions'
import { DraftBadge } from './DraftBadge'
import { useToastStore } from '@/hooks/useToast'
import { CommunicationModal, type CommunicationData } from '@/components/admin/CommunicationModal'
import { applicationService } from '@/services/applications'
import { notificationService } from '@/services/notifications'
import { getPaymentStatusLabel, normalizePaymentStatus } from '@/lib/paymentStatus'
import { formatDate } from '@/lib/dateFormat'
import { StatusPill } from '@/components/ui/StatusPill'
import type { ApplicationSummary } from '@/hooks/admin/useApplicationsData'

export type { ApplicationSummary } from '@/hooks/admin/useApplicationsData'

// Institution code to name mapping
export const INSTITUTION_NAMES: Record<string, string> = {
  'KATC': 'Kalulushi Training Centre',
  'katc': 'Kalulushi Training Centre',
  'MIHAS': 'Mukuba Institute of Health and Applied Sciences',
  'mihas': 'Mukuba Institute of Health and Applied Sciences'
}

export const getInstitutionName = (code?: string): string => {
  if (!code) return 'Not specified'
  return INSTITUTION_NAMES[code] || code
}

export interface ApplicationCardProps {
  application: ApplicationSummary
  onStatusUpdate: (id: string, status: string) => void | Promise<void>
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
      pending_review: { color: 'bg-amber-100/80 text-amber-700', icon: Clock },
      verified: { color: 'bg-emerald-100/80 text-emerald-700', icon: CheckCircle },
      rejected: { color: 'bg-red-100/80 text-red-700', icon: XCircle },
      deferred: { color: 'bg-amber-100/80 text-amber-700', icon: AlertTriangle }
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
            ? 'Portal update from MIHAS Admissions'
            : 'Message from MIHAS Admissions'
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

      showSuccess('Message Sent', 'Your message has been sent successfully')
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

      {/* Draft Status Banner */}
      {app.isDraft && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-600" />
              <span className="min-w-0 break-words text-sm font-medium text-yellow-800">Draft Application</span>
            </div>
            <div className="min-w-0 break-words text-xs text-yellow-700">
              Last updated: {formatDate(app.lastUpdated)}
            </div>
          </div>
          <div className="mt-2">
            <div className="w-full bg-yellow-100 rounded-full h-2">
              <div
                className="bg-yellow-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${app.completionPercentage}%` }}
              />
            </div>
          </div>
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

      {/* Program Info */}
      <div className="mb-4 rounded-lg border border-border bg-muted/40 p-3">
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
          <div className="text-xs text-muted-foreground mb-1">Payment Status</div>
          {getPaymentBadge(app.payment_status)}
          <div className="mt-1 min-w-0 break-words text-sm font-medium text-foreground">
            {app.payment_currency && app.payment_currency !== 'ZMW'
              ? `${app.payment_currency} ${app.paid_amount || 0} / ${app.payment_currency} ${app.application_fee}`
              : `K${app.paid_amount || 0} / K${app.application_fee}`}
          </div>
          {normalizePaymentStatus(app.payment_status) === 'deferred' && (
            <div className="flex items-center gap-1 mt-1 text-xs text-amber-700">
              <Phone className="h-3 w-3" />
              <span>Contact Student</span>
            </div>
          )}
        </div>
        
        {app.total_subjects > 0 && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">Academic</div>
            <div className="text-sm">
              <span className="text-foreground">{app.total_subjects} subjects</span>
              {app.points > 0 && (
                <div className={`font-medium ${getPointsColor(app.points)}`}>
                  Points: {app.points}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {app.last_payment_audit_notes && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-amber-900 mb-1">
            Latest Payment Review Note
          </div>
          <div className="text-sm text-foreground break-words">
            {app.last_payment_audit_notes}
          </div>
        </div>
      )}

      {app.grades_summary && (
        <div className="mb-4 rounded-lg border border-border bg-muted p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-foreground mb-2">
            Grades Summary
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

      {/* Status Controls */}
      <ApplicationApprovalActions
        applicationId={app.id}
        currentStatus={app.status}
        currentPaymentStatus={app.payment_status}
        onStatusUpdate={async (id, status) => { await onStatusUpdate(id, status) }}
        onPaymentStatusUpdate={async (id, status, verificationNotes) => {
          await onPaymentStatusUpdate(id, status, verificationNotes)
        }}
        disabled={updatingStatus || updatingPayment}
      />

      {/* Actions */}
      <div className="mt-4 flex flex-col gap-2 border-t border-border/40 pt-4 sm:flex-row">
        <button
          type="button"
          onClick={() => onViewDetails(app.id)}
          className="flex min-h-touch flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors duration-200 hover:bg-primary/90"
        >
          <Eye className="h-4 w-4" />
          View Details
        </button>
        
        {/* Contact Applicant Button - Show for draft applications */}
        {app.isDraft && (
          <button
            type="button"
            onClick={() => setShowCommunicationModal(true)}
            className="flex min-h-touch min-w-touch items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-2.5 text-sm font-medium text-secondary-foreground transition-colors duration-200 hover:bg-secondary/80"
            title="Contact Applicant"
          >
            <MessageSquare className="h-4 w-4" />
            Contact
          </button>
        )}
        
        {documentsCount > 0 && (
          <div className="flex gap-1">
            {app.result_slip_url && (
              <button
                type="button"
                onClick={() => onViewDetails(app.id)}
                className="flex min-h-touch min-w-touch items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Result Slip"
              >
                <FileText className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
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
            <span>Updating...</span>
          </div>
        </div>
      )}
    </article>
  )
}, areApplicationCardPropsEqual)

ApplicationCard.displayName = 'ApplicationCard'
