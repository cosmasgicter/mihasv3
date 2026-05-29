import React, { useState, useCallback, useMemo } from 'react'
import { CheckCircle, XCircle, Clock, RotateCcw } from 'lucide-react'
import { ConfirmAlertDialog } from '@/components/ui/alert-dialog'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { logApiError } from '@/lib/apiErrorLogger'
import { formatApplicationStatus } from '@/types/applicationStatus'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Textarea,
} from '@/components/ui'
import { toError } from '@/lib/toError'

interface ApplicationApprovalActionsProps {
  applicationId: string
  currentStatus: string
  currentPaymentStatus?: string | null
  onStatusUpdate: (id: string, status: string) => Promise<void>
  onPaymentStatusUpdate: (id: string, status: string, verificationNotes?: string) => Promise<void>
  disabled?: boolean
}

const normalizePaymentStatusForActions = (status?: string | null) => {
  switch (status) {
    case 'pending':
    case 'pending_review':
      return 'pending_review'
    case 'verified':
    case 'paid':
    case 'successful':
    case 'force_approved':
      return 'verified'
    case 'failed':
    case 'rejected':
      return 'rejected'
    case 'deferred':
      return 'deferred'
    default:
      return 'not_paid'
  }
}

export function ApplicationApprovalActions({
  applicationId,
  currentStatus,
  currentPaymentStatus,
  onStatusUpdate,
  onPaymentStatusUpdate,
  disabled = false
}: ApplicationApprovalActionsProps) {
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [updatingPayment, setUpdatingPayment] = useState(false)
  const [paymentReviewDialogOpen, setPaymentReviewDialogOpen] = useState(false)
  const [pendingPaymentStatus, setPendingPaymentStatus] = useState<string | null>(null)
  const [paymentReviewNotes, setPaymentReviewNotes] = useState('')
  const [paymentReviewError, setPaymentReviewError] = useState<string | null>(null)
  const confirmDialog = useConfirmDialog()
  const normalizedPaymentStatus = normalizePaymentStatusForActions(currentPaymentStatus)
  const isPaymentVerified = normalizedPaymentStatus === 'verified'

  const paymentReviewCopy = useMemo(() => {
    if (pendingPaymentStatus === 'verified') {
      return {
        title: 'Verify Payment',
        description: 'Confirm that the application fee has been received before marking this payment as verified.',
        confirmText: 'Verify payment',
        notesLabel: 'Verification note',
        notesPlaceholder: 'Optional context for this verification decision.',
        notesRequired: false,
      }
    }

    if (pendingPaymentStatus === 'rejected') {
      return {
        title: 'Reject Payment',
        description: 'Explain why the proof was rejected so the student can correct and resubmit it.',
        confirmText: 'Reject payment',
        notesLabel: 'Rejection reason',
        notesPlaceholder: 'State what is wrong with the submitted proof or payment details.',
        notesRequired: true,
      }
    }

    if (pendingPaymentStatus === 'deferred') {
      return {
        title: 'Defer Payment',
        description: 'Defer payment collection for this application. The student will be contacted to arrange payment.',
        confirmText: 'Defer payment',
        notesLabel: 'Deferral reason',
        notesPlaceholder: 'Explain why payment is being deferred (e.g. financial hardship, instalment arrangement).',
        notesRequired: true,
      }
    }

    return {
      title: 'Return Payment To Review',
      description: 'Reopen this payment for review so the applicant can continue the payment process.',
      confirmText: 'Return to review',
      notesLabel: 'Review note',
      notesPlaceholder: 'Optional context for why the payment is being reopened.',
      notesRequired: false,
    }
  }, [pendingPaymentStatus])

  const handleStatusUpdate = useCallback(async (newStatus: string) => {
    if (updatingStatus || disabled) return
    
    // Prevent approval without verified payment.
    if (newStatus === 'approved' && !isPaymentVerified) {
      await confirmDialog.confirm({
        title: 'Payment Not Verified',
        message: 'This application cannot be approved because payment has not been verified. Please verify payment first.',
        confirmText: 'OK',
        variant: 'danger'
      })
      return
    }
    
    // Confirm critical actions
    if (newStatus === 'rejected') {
      const confirmed = await confirmDialog.confirm({
        title: 'Reject Application',
        message: 'This application will be rejected. The applicant will be notified.',
        confirmText: 'Reject',
        variant: 'danger'
      })
      if (!confirmed) return
    }
    
    if (newStatus === 'approved') {
      const confirmed = await confirmDialog.confirm({
        title: 'Approve Application',
        message: 'The applicant will be notified of approval. This action cannot be undone.',
        confirmText: 'Approve',
        variant: 'info'
      })
      if (!confirmed) return
    }
    
    try {
      setUpdatingStatus(true)
      await onStatusUpdate(applicationId, newStatus)
      // Success - state will be updated by parent component
    } catch (error) {
      logApiError('admin-approval-actions', `/applications/${applicationId}/review/`, error)
      // Show error to user
      await confirmDialog.confirm({
        title: 'Update Failed',
        message: toError(error).message || 'Failed to update application status. Please try again.',
        confirmText: 'OK',
        variant: 'danger'
      })
    } finally {
      setUpdatingStatus(false)
    }
  }, [applicationId, disabled, isPaymentVerified, updatingStatus, onStatusUpdate, confirmDialog])

  const openPaymentReviewDialog = useCallback((newStatus: string) => {
    if (updatingPayment || disabled) return
    setPendingPaymentStatus(newStatus)
    setPaymentReviewNotes('')
    setPaymentReviewError(null)
    setPaymentReviewDialogOpen(true)
  }, [disabled, updatingPayment])

  const handlePaymentDialogOpenChange = useCallback((open: boolean) => {
    setPaymentReviewDialogOpen(open)
    if (!open) {
      setPendingPaymentStatus(null)
      setPaymentReviewNotes('')
      setPaymentReviewError(null)
    }
  }, [])

  const handlePaymentUpdate = useCallback(async () => {
    if (!pendingPaymentStatus || updatingPayment || disabled) return

    const normalizedNotes = paymentReviewNotes.trim()

    if (paymentReviewCopy.notesRequired && !normalizedNotes) {
      setPaymentReviewError('A rejection reason is required.')
      return
    }

    try {
      setUpdatingPayment(true)
      await onPaymentStatusUpdate(applicationId, pendingPaymentStatus, normalizedNotes || undefined)
      handlePaymentDialogOpenChange(false)
    } catch (error) {
      logApiError('admin-approval-actions', `/applications/${applicationId}/review/`, error)
      const errorMessage = toError(error).message
      const isNoPaymentRecord = errorMessage.includes('PAYMENT_RECORD_REQUIRED') || errorMessage.toLowerCase().includes('no payment record')
      await confirmDialog.confirm({
        title: isNoPaymentRecord ? 'No Payment Record' : 'Update Failed',
        message: isNoPaymentRecord
          ? 'No payment record found — the student must initiate payment first.'
          : errorMessage || 'Failed to update payment status. Please try again.',
        confirmText: 'OK',
        variant: 'danger'
      })
      handlePaymentDialogOpenChange(false)
    } finally {
      setUpdatingPayment(false)
    }
  }, [
    applicationId,
    confirmDialog,
    disabled,
    handlePaymentDialogOpenChange,
    onPaymentStatusUpdate,
    paymentReviewCopy.notesRequired,
    paymentReviewNotes,
    pendingPaymentStatus,
    updatingPayment,
  ])

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-border/80 bg-muted/90 px-3 py-3">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Application</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{formatApplicationStatus(currentStatus)}</p>
        </div>
        <div className="rounded-lg border border-border/80 bg-muted/90 px-3 py-3">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Payment</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{normalizedPaymentStatus.replace(/_/g, ' ')}</p>
        </div>
      </div>

      {/* Application Status Controls */}
      <div>
        <label className="mb-2 block text-xs font-medium text-foreground">
          Application Status
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          {currentStatus === 'draft' && (
            <>
              <div className="flex-1 rounded-lg border border-border bg-muted py-3 text-center">
                <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-600 border border-gray-300">
                  Draft — not yet submitted
                </span>
              </div>
              <Button
                onClick={() => handleStatusUpdate('submitted')}
                disabled={updatingStatus || disabled}
                className="w-full"
              >
                {updatingStatus ? 'Updating...' : 'Force Submit'}
              </Button>
            </>
          )}

          {currentStatus === 'submitted' && (
            <Button
              onClick={() => handleStatusUpdate('under_review')}
              disabled={updatingStatus || disabled}
              className="sm:col-span-2"
            >
              {updatingStatus ? 'Updating...' : (
                <>
                  <Clock className="h-3 w-3" />
                  Review
                </>
              )}
            </Button>
          )}
          
          {currentStatus === 'under_review' && (
            <>
              <Button
                variant="success"
                onClick={() => handleStatusUpdate('approved')}
                disabled={updatingStatus || disabled || !isPaymentVerified}
                className="w-full"
                title={!isPaymentVerified ? 'Payment must be verified first' : 'Approve application'}
              >
                {updatingStatus ? 'Updating...' : (
                  <>
                    <CheckCircle className="h-3 w-3" />
                    Approve
                  </>
                )}
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleStatusUpdate('rejected')}
                disabled={updatingStatus || disabled}
                className="w-full"
              >
                {updatingStatus ? 'Updating...' : (
                  <>
                    <XCircle className="h-3 w-3" />
                    Reject
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleStatusUpdate('conditionally_approved')}
                disabled={updatingStatus || disabled}
                className="w-full border-blue-300 text-blue-700 hover:bg-blue-50"
              >
                {updatingStatus ? 'Updating...' : (
                  <>
                    <Clock className="h-3 w-3" />
                    Conditional
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleStatusUpdate('waitlisted')}
                disabled={updatingStatus || disabled}
                className="w-full border-amber-300 text-amber-700 hover:bg-amber-50"
              >
                {updatingStatus ? 'Updating...' : (
                  <>
                    <Clock className="h-3 w-3" />
                    Waitlist
                  </>
                )}
              </Button>
            </>
          )}
          
          {(currentStatus === 'approved' || currentStatus === 'rejected') && (
            <div className="sm:col-span-2 text-center py-2">
              <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${
                currentStatus === 'approved' 
                  ? 'bg-green-100 text-green-800 border border-green-300' 
                  : 'bg-red-100 text-red-800 border border-red-300'
              }`}>
                {currentStatus === 'approved' ? (
                  <>
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Approved
                  </>
                ) : (
                  <>
                    <XCircle className="h-3 w-3 mr-1" />
                    Rejected
                  </>
                )}
              </span>
            </div>
          )}

          {currentStatus === 'conditionally_approved' && (
            <>
              <div className="sm:col-span-2 text-center py-2">
                <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800 border border-blue-300">
                  <Clock className="h-3 w-3 mr-1" />
                  Conditionally Approved
                </span>
              </div>
              <Button
                variant="success"
                onClick={() => handleStatusUpdate('approved')}
                disabled={updatingStatus || disabled || !isPaymentVerified}
                className="w-full"
                title={!isPaymentVerified ? 'Payment must be verified first' : 'Approve application'}
              >
                {updatingStatus ? 'Updating...' : (
                  <>
                    <CheckCircle className="h-3 w-3" />
                    Approve
                  </>
                )}
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleStatusUpdate('rejected')}
                disabled={updatingStatus || disabled}
                className="w-full"
              >
                {updatingStatus ? 'Updating...' : (
                  <>
                    <XCircle className="h-3 w-3" />
                    Reject
                  </>
                )}
              </Button>
            </>
          )}

          {currentStatus === 'waitlisted' && (
            <>
              <div className="sm:col-span-2 text-center py-2">
                <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-amber-100 text-amber-800 border border-amber-300">
                  <Clock className="h-3 w-3 mr-1" />
                  Waitlisted
                </span>
              </div>
              <Button
                variant="success"
                onClick={() => handleStatusUpdate('approved')}
                disabled={updatingStatus || disabled || !isPaymentVerified}
                className="w-full"
                title={!isPaymentVerified ? 'Payment must be verified first' : 'Approve application'}
              >
                {updatingStatus ? 'Updating...' : (
                  <>
                    <CheckCircle className="h-3 w-3" />
                    Approve
                  </>
                )}
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleStatusUpdate('rejected')}
                disabled={updatingStatus || disabled}
                className="w-full"
              >
                {updatingStatus ? 'Updating...' : (
                  <>
                    <XCircle className="h-3 w-3" />
                    Reject
                  </>
                )}
              </Button>
            </>
          )}

          {currentStatus === 'enrolled' && (
            <div className="sm:col-span-2 text-center py-2">
              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-green-100 text-green-800 border border-green-300">
                <CheckCircle className="h-3 w-3 mr-1" />
                Enrolled
              </span>
            </div>
          )}

          {currentStatus === 'withdrawn' && (
            <div className="sm:col-span-2 text-center py-2">
              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-600 border border-gray-300">
                <XCircle className="h-3 w-3 mr-1" />
                Withdrawn
              </span>
            </div>
          )}

          {currentStatus === 'expired' && (
            <div className="sm:col-span-2 text-center py-2">
              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-red-100 text-red-800 border border-red-300">
                <XCircle className="h-3 w-3 mr-1" />
                Expired
              </span>
            </div>
          )}

          {currentStatus === 'enrollment_expired' && (
            <div className="sm:col-span-2 text-center py-2">
              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-amber-100 text-amber-800 border border-amber-300">
                <Clock className="h-3 w-3 mr-1" />
                Enrollment Expired
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Payment Status Controls */}
      <div>
        <label className="mb-2 block text-xs font-medium text-foreground">
          Payment Status
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          {normalizedPaymentStatus === 'not_paid' && (
            <div className="sm:col-span-2 grid gap-2">
            <div className="text-center py-2 space-y-1 rounded-lg border border-amber-200 bg-amber-50">
              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-amber-100 text-amber-700 border border-amber-300">
                Awaiting Payment
              </span>
            </div>
              <Button
                variant="outline"
                onClick={() => openPaymentReviewDialog('verified')}
                disabled={updatingPayment || disabled}
                className="w-full border-green-600 text-green-700 hover:bg-green-50"
              >
                {updatingPayment ? 'Updating...' : (
                  <>
                    <CheckCircle className="h-3 w-3" />
                    Mark as Paid
                  </>
                )}
              </Button>
            </div>
          )}

          {normalizedPaymentStatus === 'pending_review' && (
            <>
              <Button
                variant="outline"
                onClick={() => openPaymentReviewDialog('verified')}
                disabled={updatingPayment || disabled}
                className="border-green-600 text-green-700 hover:bg-green-50"
              >
                {updatingPayment ? 'Updating...' : (
                  <>
                    <CheckCircle className="h-3 w-3" />
                    Verify
                  </>
                )}
              </Button>
              <Button
                variant="destructive"
                onClick={() => openPaymentReviewDialog('rejected')}
                disabled={updatingPayment || disabled}
                className="w-full"
              >
                {updatingPayment ? 'Updating...' : (
                  <>
                    <XCircle className="h-3 w-3" />
                    Reject
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => openPaymentReviewDialog('deferred')}
                disabled={updatingPayment || disabled}
                className="border-amber-500 text-amber-700 hover:bg-amber-50 sm:col-span-2"
              >
                {updatingPayment ? 'Updating...' : (
                  <>
                    <Clock className="h-3 w-3" />
                    Defer
                  </>
                )}
              </Button>
            </>
          )}

          {normalizedPaymentStatus === 'rejected' && (
            <Button
              variant="warning"
              onClick={() => openPaymentReviewDialog('pending_review')}
              disabled={updatingPayment || disabled}
              className="sm:col-span-2"
            >
              {updatingPayment ? 'Updating...' : (
                <>
                  <RotateCcw className="h-3 w-3" />
                  Reopen Review
                </>
              )}
            </Button>
          )}

          {normalizedPaymentStatus === 'deferred' && (
            <>
              <div className="text-center py-3 rounded-lg border border-amber-200 bg-amber-50">
                <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-amber-100 text-amber-800 border border-amber-300">
                  <Clock className="h-3 w-3 mr-1" />
                  Deferred
                </span>
              </div>
              <Button
                variant="warning"
                onClick={() => openPaymentReviewDialog('pending_review')}
                disabled={updatingPayment || disabled}
                className="w-full"
              >
                {updatingPayment ? 'Updating...' : (
                  <>
                    <RotateCcw className="h-3 w-3" />
                    Reopen Review
                  </>
                )}
              </Button>
            </>
          )}
          
          {(normalizedPaymentStatus === 'verified' || normalizedPaymentStatus === 'rejected') && (
            <div className="sm:col-span-2 text-center py-2">
              <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${
                normalizedPaymentStatus === 'verified'
                  ? 'bg-green-100 text-green-800 border border-green-300' 
                  : 'bg-red-100 text-red-800 border border-red-300'
              }`}>
                {normalizedPaymentStatus === 'verified' ? (
                  <>
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Verified
                  </>
                ) : (
                  <>
                    <XCircle className="h-3 w-3 mr-1" />
                    Rejected
                  </>
                )}
              </span>
            </div>
          )}
        </div>
      </div>
      <ConfirmAlertDialog
        isOpen={confirmDialog.isOpen}
        onClose={confirmDialog.handleCancel}
        onConfirm={confirmDialog.handleConfirm}
        title={confirmDialog.options.title}
        message={confirmDialog.options.message}
        confirmText={confirmDialog.options.confirmText}
        cancelText={confirmDialog.options.cancelText}
        variant={confirmDialog.options.variant}
      />
      <Dialog open={paymentReviewDialogOpen} onOpenChange={handlePaymentDialogOpenChange}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{paymentReviewCopy.title}</DialogTitle>
            <DialogDescription>{paymentReviewCopy.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              label={paymentReviewCopy.notesLabel}
              value={paymentReviewNotes}
              onChange={(event) => {
                setPaymentReviewNotes(event.target.value)
                if (paymentReviewError) {
                  setPaymentReviewError(null)
                }
              }}
              placeholder={paymentReviewCopy.notesPlaceholder}
              error={paymentReviewError ?? undefined}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handlePaymentDialogOpenChange(false)}
              disabled={updatingPayment}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                void handlePaymentUpdate()
              }}
              disabled={updatingPayment}
            >
              {updatingPayment ? 'Saving...' : paymentReviewCopy.confirmText}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
