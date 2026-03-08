import { CheckCircle, Download, Mail, Send, X } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { animateClasses } from '@/lib/animations'

import type { SubmittedApplicationSummary } from '../hooks/useApplicationSlip'

// Institution code to name mapping
const INSTITUTION_NAMES: Record<string, string> = {
  'KATC': 'Kalulushi Training Centre',
  'katc': 'Kalulushi Training Centre',
  'MIHAS': 'Mukuba Institute of Health and Allied Sciences',
  'mihas': 'Mukuba Institute of Health and Allied Sciences'
}

const getInstitutionName = (code?: string) => {
  if (!code) return 'Not specified'
  return INSTITUTION_NAMES[code] || code
}

interface SubmissionSuccessProps {
  submittedApplication: SubmittedApplicationSummary
  persistingSlip: boolean
  slipLoading: boolean
  emailLoading: boolean
  onDownload: () => Promise<void>
  onEmail: () => Promise<void>
  onDismissSlipProgress?: () => void
}

const formatPaymentStatusLabel = (status?: string | null) => {
  if (!status) return 'Pending Payment'
  return status
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

const getPaymentStatusStyles = (status?: string | null) => {
  switch (status) {
    case 'verified':
      return 'bg-success/10 text-success border-success/30'
    case 'rejected':
      return 'bg-destructive/10 text-destructive border-destructive/30'
    case null:
    case undefined:
      return 'bg-info/10 text-info border-info/30'
    case 'pending_review':
    default:
      return 'bg-warning/10 text-warning border-warning/30'
  }
}

const getPaymentStatusDescription = (status?: string | null) => {
  switch (status) {
    case 'verified':
      return 'Payment verified — you are all set.'
    case 'rejected':
      return 'Payment issue detected — please contact support.'
    case null:
    case undefined:
      return 'Payment is still pending — complete it later from the student payment page.'
    case 'pending_review':
    default:
      return 'Payment submitted — awaiting verification by admissions.'
  }
}

const SubmissionSuccess = ({
  submittedApplication,
  persistingSlip,
  slipLoading,
  emailLoading,
  onDownload,
  onEmail,
  onDismissSlipProgress
}: SubmissionSuccessProps) => (
  <div className="min-h-screen bg-muted flex items-center justify-center py-6 sm:py-12 px-4">
    <div className="max-w-lg w-full">
      {/* Dismissible slip generation overlay */}
      {(persistingSlip || slipLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="relative bg-card rounded-lg shadow-xl p-6 max-w-sm w-full mx-4 text-center">
            <button
              type="button"
              onClick={onDismissSlipProgress}
              className="absolute top-3 right-3 p-1 rounded-sm hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Close slip progress"
            >
              <X className="h-4 w-4 text-foreground" />
            </button>
            <LoadingSpinner />
            <p className="mt-4 text-sm font-medium text-foreground">
              {persistingSlip ? 'Generating application slip...' : 'Preparing your slip...'}
            </p>
            <p className="mt-1 text-xs text-caption">
              You can close this and download the slip later.
            </p>
          </div>
        </div>
      )}
      <div
        className={`bg-card rounded-lg shadow-lg p-4 sm:p-8 text-center ${animateClasses.scaleIn}`}
      >
        <div className={animateClasses.scaleIn}>
          <CheckCircle className="h-16 w-16 text-accent mx-auto mb-6" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-4">Application Submitted Successfully!</h2>



        <div
          className={`bg-accent/10 border border-accent/30 rounded-lg p-4 mb-6 ${animateClasses.slideUp}`}
        >
          <h3 className="font-semibold text-accent-foreground mb-3">Application Details</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-warning-strong">Application Number:</span>
              <span className="font-mono font-bold text-accent-foreground">{submittedApplication.applicationNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-warning-strong">Tracking Code:</span>
              <span className="font-mono font-bold text-accent-foreground">{submittedApplication.trackingCode}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-warning-strong">Program:</span>
              <span className="font-semibold text-accent-foreground">{submittedApplication.program}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-warning-strong">Institution:</span>
              <span className="font-semibold text-accent-foreground">{getInstitutionName(submittedApplication.institution ?? undefined)}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <span className="text-accent flex items-center justify-between sm:justify-start">
                <Send className="h-4 w-4 mr-2" />
                Payment Status:
              </span>
              <span
                className={`inline-flex items-center px-2 py-1 mt-2 sm:mt-0 rounded-full border text-xs font-semibold ${getPaymentStatusStyles(submittedApplication.paymentStatus)}`}
              >
                {formatPaymentStatusLabel(submittedApplication.paymentStatus)}
              </span>
            </div>
            <p className="text-left text-xs text-warning-strong">{getPaymentStatusDescription(submittedApplication.paymentStatus)}</p>
          </div>
        </div>

        <p className="text-foreground mb-6">
          {submittedApplication.paymentStatus == null
            ? 'Your application has been submitted. Complete payment later from your dashboard when you are ready.'
            : 'Your application is now under review. You will receive notifications about status updates.'}
        </p>

        <div className="space-y-3 mb-6">
          <Button onClick={onDownload} loading={slipLoading} className="w-full bg-success hover:bg-success/90">
            <Download className="h-5 w-5 mr-2" />
            Download Application Slip
          </Button>
          <Button variant="outline" onClick={onEmail} loading={emailLoading} className="w-full">
            <Mail className="h-5 w-5 mr-2" />
            Email Me the Slip
          </Button>
        </div>

        <div className="space-y-3">
          {submittedApplication.paymentStatus == null && (
            <Link to="/student/payment">
              <Button variant="outline" className="w-full">Complete Payment Later</Button>
            </Link>
          )}
          <Link to="/student/dashboard">
            <Button className="w-full bg-primary hover:bg-primary">Go to Dashboard</Button>
          </Link>
          <Link to="/track-application">
            <Button variant="outline" className="w-full">Track Application Status</Button>
          </Link>
        </div>
      </div>
    </div>
  </div>
)

export default SubmissionSuccess
