import { CheckCircle, Download, Mail, X } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { TrackingLinkAction } from '@/components/student/TrackingLinkAction'
import { animateClasses } from '@/lib/animations'

import type { SubmittedApplicationSummary } from '../hooks/useApplicationSlip'


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
  if (!status) return 'Pending payment'
  return status
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

const getPaymentStatusStyles = (status?: string | null) => {
  switch (status) {
    case 'verified':
    case 'paid':
    case 'successful':
      return 'bg-success/10 text-success border-success/30'
    case 'deferred':
      return 'bg-warning/10 text-warning border-warning/30'
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
    case 'paid':
    case 'successful':
      return 'Payment verified: you are all set.'
    case 'deferred':
      return 'Payment deferred: you can pay anytime from the payment page.'
    case 'rejected':
      return 'Payment issue detected: please contact support.'
    case null:
    case undefined:
      return 'Payment is still pending. Complete it later from the student payment page.'
    case 'pending_review':
    default:
      return 'Payment submitted: awaiting verification by admissions.'
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
}: SubmissionSuccessProps) => {
  const slipProgressOpen = persistingSlip || slipLoading
  useEscapeKey(Boolean(slipProgressOpen && onDismissSlipProgress), () => onDismissSlipProgress?.())

  return (
    <div className="min-h-screen bg-muted flex items-center justify-center py-6 sm:py-12 px-4">
    <div className="max-w-lg w-full">
      {/* Dismissible slip generation overlay */}
      {slipProgressOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/40 " role="dialog" aria-modal="true" aria-label="Application slip progress">
          <div className="relative bg-card rounded-lg shadow-md p-6 max-w-sm w-full mx-4 text-center">
            <button
              type="button"
              onClick={onDismissSlipProgress}
              autoFocus
              className="absolute top-3 right-3 p-1 rounded-sm hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Close slip progress"
            >
              <X className="h-4 w-4 text-foreground" />
            </button>
            <Skeleton className="mx-auto h-12 w-12 rounded-full" />
            <p className="mt-4 text-base sm:text-sm font-medium text-foreground">
              {persistingSlip ? 'Generating application slip…' : 'Preparing your slip…'}
            </p>
            <p className="mt-1 text-base sm:text-sm text-muted-foreground">
              You can close this and download the slip later.
            </p>
          </div>
        </div>
      )}
      <div
        className={`bg-card rounded-lg shadow-sm ring-1 ring-border/50 p-5 sm:p-8 ${animateClasses.scaleIn}`}
      >
        {/* Institution logo */}
        <img
          src="/images/logos/beanolalogo.webp"
          alt="Beanola Admissions"
          width={192}
          height={64}
          loading="eager"
          decoding="async"
          className="mx-auto mb-6 h-16 w-auto object-contain"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />

        {/* Success icon */}
        <div className="flex justify-center">
          <div className="relative w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
            <CheckCircle className="h-8 w-8 text-success" />
          </div>
        </div>

        <h2 className="text-2xl font-bold text-foreground mt-5 mb-1 text-center">Application submitted</h2>
        <p className="text-base sm:text-sm text-muted-foreground mb-6 text-center">Your application is now with the admissions team.</p>

        {/*
          admissions-v2 task 10.5 (R13.12, STU-22): this block used to print the
          legacy tracking code under "Save this code to check your application
          status anytime". That sentence stopped being true when public tracking
          moved to an issued secret — and the number it printed had a guessable
          stem. What is prominent now is the reference the admissions office asks
          for, with the real tracking credential offered as a command underneath.
        */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-4 mb-6">
          <span data-text-role="caption" className="block text-sm sm:text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">Application number</span>
          <span className="block font-mono text-xl font-bold text-foreground tracking-wide">{submittedApplication.applicationNumber}</span>
          <span data-text-role="caption" className="block text-sm sm:text-xs text-muted-foreground mt-1">Quote this when you contact the admissions office.</span>
          {submittedApplication.applicationId && (
            <TrackingLinkAction
              applicationId={submittedApplication.applicationId}
              className="mt-4 border-t border-primary/20 pt-4"
              description="Want to check your status without signing in, or share it with someone? Get a tracking link."
            />
          )}
        </div>

        {/* Application details */}
        <div className={`rounded-lg border border-border/70 bg-muted/30 p-4 mb-6 ${animateClasses.slideUp}`}>
          <h3 className="text-sm font-semibold text-foreground mb-3">Application details</h3>
          {/* The application number is the headline above; not repeated here. */}
          <dl className="space-y-2 text-base sm:text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Programme</dt>
              <dd className="font-semibold text-foreground">{submittedApplication.program}</dd>
            </div>
            {submittedApplication.institution?.trim() && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Institution</dt>
                <dd className="font-semibold text-foreground">{submittedApplication.institution.trim()}</dd>
              </div>
            )}
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Payment</dt>
              <dd>
                <span data-text-role="caption"
                  className={`inline-flex items-center px-2 py-0.5 rounded-full border text-sm sm:text-xs font-semibold ${getPaymentStatusStyles(submittedApplication.paymentStatus)}`}
                >
                  {formatPaymentStatusLabel(submittedApplication.paymentStatus)}
                </span>
              </dd>
            </div>
          </dl>
          <p className="text-base sm:text-sm text-muted-foreground mt-3">{getPaymentStatusDescription(submittedApplication.paymentStatus)}</p>
        </div>

        {/* Slip actions */}
        <div className="flex flex-col gap-2 mb-6 sm:flex-row">
          <Button onClick={onDownload} loading={slipLoading} className="flex-1 min-h-[48px] touch-manipulation bg-success hover:bg-success/90">
            <Download className="h-4 w-4 mr-2" />
            Download slip
          </Button>
          <Button variant="outline" onClick={onEmail} loading={emailLoading} className="flex-1 min-h-[48px] touch-manipulation">
            <Mail className="h-4 w-4 mr-2" />
            Email slip
          </Button>
        </div>

        {/* Next steps list */}
        <div className="rounded-lg border border-border/70 bg-muted/30 p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">What happens next</h3>
          <ol className="space-y-3 text-base sm:text-sm">
            <li className="flex items-start gap-3">
              <span data-text-role="caption" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm sm:text-xs font-semibold text-primary">1</span>
              <span className="text-foreground">A confirmation email will be sent to your registered address.</span>
            </li>
            {(submittedApplication.paymentStatus == null || submittedApplication.paymentStatus === 'deferred') && (
              <li className="flex items-start gap-3">
                <span data-text-role="caption" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-warning/10 text-sm sm:text-xs font-semibold text-warning">2</span>
                {/* Task 8.3 (R12.3): after submission the payment page owns the
                    fee, so the hand-off names that page rather than the wizard. */}
                <span className="text-foreground">Complete your payment on the payment page when you are ready.</span>
              </li>
            )}
            <li className="flex items-start gap-3">
              <span data-text-role="caption" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm sm:text-xs font-semibold text-primary">{submittedApplication.paymentStatus == null || submittedApplication.paymentStatus === 'deferred' ? '3' : '2'}</span>
              <span className="text-foreground">Track your application status by signing in, or with the tracking link above.</span>
            </li>
            <li className="flex items-start gap-3">
              <span data-text-role="caption" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm sm:text-xs font-semibold text-primary">{submittedApplication.paymentStatus == null || submittedApplication.paymentStatus === 'deferred' ? '4' : '3'}</span>
              <span className="text-foreground">The admissions team will review and notify you of the outcome.</span>
            </li>
          </ol>
        </div>

        {/* Navigation links */}
        <div className="mt-6 space-y-2">
          <Link to="/track-application">
            <Button variant="outline" className="w-full min-h-[48px] touch-manipulation">Track application status</Button>
          </Link>
          {(submittedApplication.paymentStatus == null || submittedApplication.paymentStatus === 'deferred') && (
            <Link to="/student/payment">
              <Button variant="outline" className="w-full min-h-[48px] touch-manipulation">Complete payment</Button>
            </Link>
          )}
          <Link to="/student/dashboard">
            <Button variant="primary" className="w-full min-h-[48px] touch-manipulation">Go to Dashboard</Button>
          </Link>
        </div>
      </div>
    </div>
  </div>
  )
}

export default SubmissionSuccess
