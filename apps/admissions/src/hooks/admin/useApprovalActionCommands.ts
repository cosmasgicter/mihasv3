/**
 * The decision block's two commands and the state they own (admissions-v2 task
 * 12.1, MAINT-01).
 *
 * Lifted **verbatim** out of `ApplicationApprovalActions.tsx`: `handleStatusUpdate`
 * with its three confirmation gates, the payment dialog's open/close/notes state,
 * and `handlePaymentUpdate` with its `PAYMENT_RECORD_REQUIRED` reading. Every
 * dialog title, message, `confirmText`, `variant` and error branch is the one that
 * was there, and both commands still call the callbacks the caller supplies —
 * nothing here talks to the network.
 *
 * The backend remains the only boundary. These gates are usability: the server
 * re-enforces the payment precondition and the capability on every decision. The
 * pre-approval "payment not verified" dialog exists so an operator is told why a
 * control is refused rather than watching a request fail.
 *
 * Follows task 9.4's `hooks/admin/useReviewWorkspace.ts` shape — one hook per
 * bounded workflow, no generic abstraction.
 */
import { useCallback, useState } from 'react'

import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { logApiError } from '@/lib/apiErrorLogger'
import { toError } from '@/lib/toError'
import { resolvePaymentReviewCopy } from '@/components/admin/applications/paymentReviewCopy'

interface UseApprovalActionCommandsInput {
  applicationId: string
  disabled: boolean
  isPaymentVerified: boolean
  onStatusUpdate: (id: string, status: string) => Promise<void>
  onPaymentStatusUpdate: (id: string, status: string, verificationNotes?: string) => Promise<void>
}

export function useApprovalActionCommands({
  applicationId,
  disabled,
  isPaymentVerified,
  onStatusUpdate,
  onPaymentStatusUpdate,
}: UseApprovalActionCommandsInput) {
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [updatingPayment, setUpdatingPayment] = useState(false)
  const [paymentReviewDialogOpen, setPaymentReviewDialogOpen] = useState(false)
  const [pendingPaymentStatus, setPendingPaymentStatus] = useState<string | null>(null)
  const [paymentReviewNotes, setPaymentReviewNotes] = useState('')
  const [paymentReviewError, setPaymentReviewError] = useState<string | null>(null)
  const confirmDialog = useConfirmDialog()

  const paymentReviewCopy = resolvePaymentReviewCopy(pendingPaymentStatus)

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

  return {
    confirmDialog,
    updatingStatus,
    updatingPayment,
    handleStatusUpdate,
    paymentReviewDialogOpen,
    paymentReviewCopy,
    paymentReviewNotes,
    setPaymentReviewNotes,
    paymentReviewError,
    setPaymentReviewError,
    openPaymentReviewDialog,
    handlePaymentDialogOpenChange,
    handlePaymentUpdate,
  }
}
