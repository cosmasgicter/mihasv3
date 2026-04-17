import React, { useState, useCallback, useMemo } from 'react'
import { CheckCircle, XCircle, Clock, RotateCcw } from 'lucide-react'
import { ConfirmAlertDialog } from '@/components/ui/alert-dialog'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { logApiError } from '@/lib/apiErrorLogger'
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
        message: error instanceof Error ? error.message : 'Failed to update application status. Please try again.',
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
      const errorMessage = error instanceof Error ? error.message : String(error)
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
      {/* Application Status Controls */}
      <div>
        <label className="text-xs font-medium text-foreground mb-1 block">
          Application Status
        </label>
        <div className="flex gap-1">
          {currentStatus === 'draft' && (
            <>
              <div className="flex-1 text-center py-2">
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-300">
                  Draft — not yet submitted
                </span>
              </div>
              <button
                onClick={() => handleStatusUpdate('submitted')}
                disabled={updatingStatus || disabled}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1"
              >
                {updatingStatus ? 'Updating...' : 'Force Submit'}
              </button>
            </>
          )}

          {currentStatus === 'submitted' && (
            <button
              onClick={() => handleStatusUpdate('under_review')}
              disabled={updatingStatus || disabled}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1"
            >
              {updatingStatus ? 'Updating...' : (
                <>
                  <Clock className="h-3 w-3" />
                  Review
                </>
              )}
            </button>
          )}
          
          {currentStatus === 'under_review' && (
            <>
              <button
                onClick={() => handleStatusUpdate('approved')}
                disabled={updatingStatus || disabled || !isPaymentVerified}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1"
                title={!isPaymentVerified ? 'Payment must be verified first' : 'Approve application'}
              >
                {updatingStatus ? 'Updating...' : (
                  <>
                    <CheckCircle className="h-3 w-3" />
                    Approve
                  </>
                )}
              </button>
              <button
                onClick={() => handleStatusUpdate('rejected')}
                disabled={updatingStatus || disabled}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1"
              >
                {updatingStatus ? 'Updating...' : (
                  <>
                    <XCircle className="h-3 w-3" />
                    Reject
                  </>
                )}
              </button>
            </>
          )}
          
          {(currentStatus === 'approved' || currentStatus === 'rejected') && (
            <div className="flex-1 text-center py-2">
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
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
        </div>
      </div>

      {/* Payment Status Controls */}
      <div>
        <label className="text-xs font-medium text-foreground mb-1 block">
          Payment Status
        </label>
        <div className="flex gap-1">
          {normalizedPaymentStatus === 'not_paid' && (
            <div className="flex-1 text-center py-2 space-y-1">
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-300">
                Awaiting Payment
              </span>
              <button
                onClick={() => openPaymentReviewDialog('verified')}
                disabled={updatingPayment || disabled}
                className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1"
              >
                {updatingPayment ? 'Updating...' : (
                  <>
                    <CheckCircle className="h-3 w-3" />
                    Mark as Paid
                  </>
                )}
              </button>
            </div>
          )}

          {normalizedPaymentStatus === 'pending_review' && (
            <>
              <button
                onClick={() => openPaymentReviewDialog('verified')}
                disabled={updatingPayment || disabled}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1"
              >
                {updatingPayment ? 'Updating...' : (
                  <>
                    <CheckCircle className="h-3 w-3" />
                    Verify
                  </>
                )}
              </button>
              <button
                onClick={() => openPaymentReviewDialog('rejected')}
                disabled={updatingPayment || disabled}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1"
              >
                {updatingPayment ? 'Updating...' : (
                  <>
                    <XCircle className="h-3 w-3" />
                    Reject
                  </>
                )}
              </button>
            </>
          )}

          {normalizedPaymentStatus === 'rejected' && (
            <button
              onClick={() => openPaymentReviewDialog('pending_review')}
              disabled={updatingPayment || disabled}
              className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1"
            >
              {updatingPayment ? 'Updating...' : (
                <>
                  <RotateCcw className="h-3 w-3" />
                  Reopen Review
                </>
              )}
            </button>
          )}
          
          {(normalizedPaymentStatus === 'verified' || normalizedPaymentStatus === 'rejected') && (
            <div className="flex-1 text-center py-2">
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
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
