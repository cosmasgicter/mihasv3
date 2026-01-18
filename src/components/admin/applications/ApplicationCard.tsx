import React, { useCallback, useMemo, useState } from 'react'
import { sanitizeHtml } from '@/lib/sanitizer'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Eye, FileText, CreditCard, Clock, CheckCircle, XCircle, AlertTriangle, User, Calendar, Phone, Mail, GraduationCap, Building, MessageSquare } from 'lucide-react'
import { ApplicationApprovalActions } from './ApplicationApprovalActions'
import { DraftBadge } from './DraftBadge'
import { useToastStore } from '@/components/ui/Toast'
import { CommunicationModal } from '@/components/admin/CommunicationModal'
import { sendToApplicant, type CommunicationRequest } from '@/services/communicationService'

// Institution code to name mapping
export const INSTITUTION_NAMES: Record<string, string> = {
  'KATC': 'Kalulushi Training Centre',
  'katc': 'Kalulushi Training Centre',
  'MIHAS': 'Mukuba Institute of Health and Allied Sciences',
  'mihas': 'Mukuba Institute of Health and Allied Sciences'
}

export const getInstitutionName = (code?: string): string => {
  if (!code) return 'Not specified'
  return INSTITUTION_NAMES[code] || code
}

export interface ApplicationSummary {
  id: string
  application_number: string
  full_name: string
  email: string
  phone: string
  program: string
  intake: string
  institution: string
  status: string
  payment_status: string
  payment_verified_at: string | null
  payment_verified_by: string | null
  payment_verified_by_name: string | null
  payment_verified_by_email: string | null
  last_payment_audit_id: number | null
  last_payment_audit_at: string | null
  last_payment_audit_by_name: string | null
  last_payment_audit_by_email: string | null
  last_payment_audit_notes: string | null
  last_payment_reference: string | null
  application_fee: number
  paid_amount: number
  submitted_at: string
  created_at: string
  result_slip_url: string
  extra_kyc_url: string
  pop_url: string
  grades_summary: string
  total_subjects: number
  points: number
  days_since_submission: number
  // Draft-specific fields
  isDraft: boolean
  completionPercentage: number
  lastUpdated: string
}


export interface ApplicationCardProps {
  application: ApplicationSummary
  onStatusUpdate: (id: string, status: string) => void | Promise<void>
  onPaymentStatusUpdate: (id: string, status: string) => void | Promise<void>
  onViewDetails: (id: string) => void
  updatingStatus: boolean
  updatingPayment: boolean
  isSelected?: boolean
  onSelect?: (id: string, selected: boolean) => void
}

export const ApplicationCard = React.memo<ApplicationCardProps>(({
  application: app,
  onStatusUpdate,
  onPaymentStatusUpdate,
  onViewDetails,
  updatingStatus,
  updatingPayment,
  isSelected = false,
  onSelect
}) => {
  const [showCommunicationModal, setShowCommunicationModal] = useState(false)
  const { success: showSuccess } = useToastStore()

  // Internalized getStatusBadge function with useCallback
  const getStatusBadge = useCallback((status: string) => {
    const statusConfig = {
      draft: { color: 'bg-gray-100 text-gray-800 border border-gray-300', icon: Clock },
      submitted: { color: 'bg-blue-100 text-blue-800 border border-blue-300', icon: AlertTriangle },
      under_review: { color: 'bg-yellow-100 text-yellow-800 border border-yellow-300', icon: Eye },
      approved: { color: 'bg-green-100 text-green-800 border border-green-300', icon: CheckCircle },
      rejected: { color: 'bg-red-100 text-red-800 border border-red-300', icon: XCircle }
    }

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft
    const Icon = config.icon

    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        <Icon className="h-3 w-3" />
        {status.replace('_', ' ').toUpperCase()}
      </span>
    )
  }, [])

  // Internalized getPaymentBadge function with useCallback
  const getPaymentBadge = useCallback((paymentStatus: string) => {
    const paymentConfig = {
      pending_review: { color: 'bg-orange-100 text-orange-800 border border-orange-300', icon: Clock },
      verified: { color: 'bg-emerald-100 text-emerald-800 border border-emerald-300', icon: CheckCircle },
      rejected: { color: 'bg-rose-100 text-rose-800 border border-rose-300', icon: XCircle }
    }

    const config = paymentConfig[paymentStatus as keyof typeof paymentConfig] || paymentConfig.pending_review
    const Icon = config.icon

    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        <Icon className="h-3 w-3" />
        {paymentStatus.replace('_', ' ').toUpperCase()}
      </span>
    )
  }, [])

  const sanitizedGradesSummary = useMemo(
    () => sanitizeHtml(app.grades_summary ?? ''),
    [app.grades_summary]
  )

  const handleSendMessage = async (data: CommunicationRequest) => {
    const result = await sendToApplicant(data)
    
    if (result.success) {
      showSuccess('Message Sent', 'Your message has been sent successfully')
    } else {
      throw new Error(result.error || 'Failed to send message')
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const getPointsColor = (points: number) => {
    if (points <= 15) return 'text-success' // Lower is better
    if (points <= 25) return 'text-warning'
    return 'text-error'
  }

  const documentsCount = [app.result_slip_url, app.extra_kyc_url, app.pop_url].filter(Boolean).length


  return (
    <div className={`relative bg-card rounded-xl border p-6 hover:shadow-lg transition-all duration-200 group ${
      isSelected ? 'border-primary bg-blue-50' : 'border-border hover:border-input'
    }`}>
      {/* Selection Checkbox */}
      {onSelect && (
        <div className="absolute top-4 right-4">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => onSelect(app.id, e.target.checked)}
            className="h-4 w-4 text-primary focus:ring-blue-500 border-input rounded"
          />
        </div>
      )}
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <User className="h-4 w-4 text-gray-900 flex-shrink-0" />
            <h3 className="font-semibold text-gray-900 truncate">{app.full_name}</h3>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-900">
            <span className="font-mono">#{app.application_number}</span>
            <span className="text-gray-900">•</span>
            <Calendar className="h-3 w-3" />
            <span>{formatDate(app.submitted_at || app.created_at)}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <span className="text-sm font-medium text-yellow-800">Draft Application</span>
            </div>
            <div className="text-xs text-yellow-700">
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
      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-2 text-sm text-gray-900">
          <Mail className="h-3 w-3 text-foreground" />
          <span className="truncate">{app.email}</span>
        </div>
        {app.phone && (
          <div className="flex items-center gap-2 text-sm text-gray-900">
            <Phone className="h-3 w-3 text-foreground" />
            <span>{app.phone}</span>
          </div>
        )}
      </div>

      {/* Program Info */}
      <div className="bg-muted rounded-lg p-3 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <GraduationCap className="h-4 w-4 text-primary" />
          <span className="font-medium text-gray-900 text-sm">{app.program}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-900">
          <Building className="h-3 w-3 text-foreground" />
          <span>{getInstitutionName(app.institution)}</span>
          <span className="text-gray-900">•</span>
          <span>{app.intake}</span>
        </div>
      </div>


      {/* Payment & Grades */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div className="text-xs text-gray-900 mb-1">Payment Status</div>
          {getPaymentBadge(app.payment_status)}
          <div className="text-sm font-medium text-gray-900 mt-1">
            K{app.paid_amount || 0} / K{app.application_fee}
          </div>
        </div>
        
        {app.total_subjects > 0 && (
          <div>
            <div className="text-xs text-gray-900 mb-1">Academic</div>
            <div className="text-sm">
              <span className="text-gray-900">{app.total_subjects} subjects</span>
              {app.points > 0 && (
                <div className={`font-medium ${getPointsColor(app.points)}`}>
                  Points: {app.points}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {app.grades_summary && (
        <div className="mb-4 rounded-lg border border-border bg-muted p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-900 mb-2">
            Grades Summary
          </div>
          <div
            className="prose prose-sm max-w-none text-gray-900 [&_p]:mb-2"
            dangerouslySetInnerHTML={{ __html: sanitizedGradesSummary }}
          />
        </div>
      )}

      {/* Documents */}
      {documentsCount > 0 && (
        <div className="flex items-center gap-2 mb-4 p-2 bg-blue-50 rounded-lg">
          <FileText className="h-4 w-4 text-primary" />
          <span className="text-sm text-info-strong">{documentsCount} document{documentsCount > 1 ? 's' : ''} uploaded</span>
        </div>
      )}

      {/* Status Controls */}
      <ApplicationApprovalActions
        applicationId={app.id}
        currentStatus={app.status}
        currentPaymentStatus={app.payment_status}
        onStatusUpdate={async (id, status) => { await onStatusUpdate(id, status) }}
        onPaymentStatusUpdate={async (id, status) => { await onPaymentStatusUpdate(id, status) }}
        disabled={updatingStatus || updatingPayment}
      />

      {/* Actions */}
      <div className="flex gap-2 mt-4 pt-4 border-t border-border">
        <button
          onClick={() => onViewDetails(app.id)}
          className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-sm py-2.5 px-4 rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 font-medium flex items-center justify-center gap-2 group-hover:shadow-md"
        >
          <Eye className="h-4 w-4" />
          View Details
        </button>
        
        {/* Contact Applicant Button - Show for draft applications */}
        {app.isDraft && (
          <button
            onClick={() => setShowCommunicationModal(true)}
            className="bg-secondary hover:bg-secondary/90 text-white text-sm py-2.5 px-4 rounded-lg transition-all duration-200 font-medium flex items-center justify-center gap-2"
            title="Contact Applicant"
          >
            <MessageSquare className="h-4 w-4" />
            Contact
          </button>
        )}
        
        {documentsCount > 0 && (
          <div className="flex gap-1">
            {app.result_slip_url && (
              <a
                href={app.result_slip_url}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-accent hover:bg-skeleton text-gray-900 p-2.5 rounded-lg transition-colors"
                title="Result Slip"
              >
                <FileText className="h-4 w-4" />
              </a>
            )}
            {app.pop_url && (
              <a
                href={app.pop_url}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-accent hover:bg-skeleton text-gray-900 p-2.5 rounded-lg transition-colors"
                title="Proof of Payment"
              >
                <CreditCard className="h-4 w-4" />
              </a>
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
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-card/80">
          <div className="flex items-center gap-2 text-sm text-gray-900">
            <LoadingSpinner size="sm" />
            <span>Updating...</span>
          </div>
        </div>
      )}
    </div>
  )
})

ApplicationCard.displayName = 'ApplicationCard'
