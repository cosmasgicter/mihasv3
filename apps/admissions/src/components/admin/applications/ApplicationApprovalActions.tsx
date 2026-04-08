import React, { useState, useCallback, useMemo } from 'react'
import { CheckCircle, XCircle, Clock, RotateCcw } from 'lucide-react'
import { ButtonSpinner } from '@/components/ui/ButtonSpinner'
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
  currentPaymentStatus: string
  onStatusUpdate: (id: string, status: string) => Promise<void>
  onPaymentStatusUpdate: (id: string, status: string, verificationNotes?: string) => Promise<void>
  disabled?: boolean
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

  const paymentReviewCopy = useMemo(() => {
    if (pendingPaymentStatus === 'verified') {
      return {
        title: 'Verify Payment',
        description: 'Confirm that the uploaded proof is valid and the application fee has been received.',
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
    
    // Prevent approval without verified payment (accept both 'verified' and 'paid')
    if (newStatus === 'approved' && currentPaymentStatus !== 'verified' && currentPaymentStatus !== 'paid') {
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
  }, [applicationId, currentPaymentStatus, disabled, updatingStatus, onStatusUpdate, confirmDialog])

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
      await confirmDialog.confirm({
        title: 'Update Failed',
        message: error instanceof Error ? error.message : 'Failed to update payment status. Please try again.',
        confirmText: 'OK',
        variant: 'danger'
      })
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
          {currentStatus === 'submitted' && (
            <button
              onClick={() => handleStatusUpdate('under_review')}
              disabled={updatingStatus || disabled}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1"
            >
              {updatingStatus ? (
                <ButtonSpinner size="sm" />
              ) : (
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
                disabled={updatingStatus || disabled || (currentPaymentStatus !== 'verified' && currentPaymentStatus !== 'paid')}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1"
                title={(currentPaymentStatus !== 'verified' && currentPaymentStatus !== 'paid') ? 'Payment must be verified first' : 'Approve application'}
              >
                {updatingStatus ? (
                  <ButtonSpinner size="sm" />
                ) : (
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
                {updatingStatus ? (
                  <ButtonSpinner size="sm" />
                ) : (
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
          {currentPaymentStatus === 'pending_review' && (
            <>
              <button
                onClick={() => openPaymentReviewDialog('verified')}
                disabled={updatingPayment || disabled}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1"
              >
                {updatingPayment ? (
                  <ButtonSpinner size="sm" />
                ) : (
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
                {updatingPayment ? (
                  <ButtonSpinner size="sm" />
                ) : (
                  <>
                    <XCircle className="h-3 w-3" />
                    Reject
                  </>
                )}
              </button>
            </>
          )}

          {currentPaymentStatus === 'rejected' && (
            <button
              onClick={() => openPaymentReviewDialog('pending_review')}
              disabled={updatingPayment || disabled}
              className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1"
            >
              {updatingPayment ? (
                <ButtonSpinner size="sm" />
              ) : (
                <>
                  <RotateCcw className="h-3 w-3" />
                  Reopen Review
                </>
              )}
            </button>
          )}
          
          {(currentPaymentStatus === 'verified' || currentPaymentStatus === 'rejected') && (
            <div className="flex-1 text-center py-2">
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                currentPaymentStatus === 'verified' 
                  ? 'bg-green-100 text-green-800 border border-green-300' 
                  : 'bg-red-100 text-red-800 border border-red-300'
              }`}>
                {currentPaymentStatus === 'verified' ? (
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
