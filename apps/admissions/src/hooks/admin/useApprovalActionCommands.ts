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
import type { StatusCommandOptions } from '@/types/statusCommand'
import { resolvePaymentReviewCopy } from '@/components/admin/applications/paymentReviewCopy'

interface UseApprovalActionCommandsInput {
  applicationId: string
  disabled: boolean
  isPaymentResolved: boolean
  onStatusUpdate: (id: string, status: string, options?: StatusCommandOptions) => Promise<void>
  onPaymentStatusUpdate: (id: string, status: string, verificationNotes?: string) => Promise<void>
}

export function useApprovalActionCommands({
  applicationId,
  disabled,
  isPaymentResolved,
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

  const handleStatusUpdate = useCallback(async (newStatus: string, options?: StatusCommandOptions): Promise<boolean> => {
    if (updatingStatus || disabled) return false

    // Prevent approval without verified payment.
    if (newStatus === 'approved' && !isPaymentResolved) {
      await confirmDialog.confirm({
        title: 'Payment not settled',
        message: 'This application cannot be approved until the payment is paid or deferred. Please resolve payment first.',
        confirmText: 'OK',
        variant: 'danger'
      })
      return false
    }

    // Confirm critical actions
    if (newStatus === 'rejected') {
      const confirmed = await confirmDialog.confirm({
        title: 'Reject application',
        message: 'This application will be rejected. The applicant will be notified.',
        confirmText: 'Reject',
        variant: 'danger'
      })
      if (!confirmed) return false
    }

    if (newStatus === 'approved') {
      const confirmed = await confirmDialog.confirm({
        title: 'Approve application',
        message: 'The applicant will be notified of approval. This action cannot be undone.',
        confirmText: 'Approve',
        variant: 'info'
      })
      if (!confirmed) return false
    }

    try {
      setUpdatingStatus(true)
      await (options ? onStatusUpdate(applicationId, newStatus, options) : onStatusUpdate(applicationId, newStatus))
      // Success - state will be updated by parent component
      return true
    } catch (error) {
      logApiError('admin-approval-actions', `/applications/${applicationId}/review/`, error)
      // Show error to user
      await confirmDialog.confirm({
        title: 'Update failed',
        message: toError(error).message || 'Failed to update application status. Please try again.',
        confirmText: 'OK',
        variant: 'danger'
      })
      return false
    } finally {
      setUpdatingStatus(false)
    }
  }, [applicationId, disabled, isPaymentResolved, updatingStatus, onStatusUpdate, confirmDialog])

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
        title: isNoPaymentRecord ? 'No payment record' : 'Update failed',
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
