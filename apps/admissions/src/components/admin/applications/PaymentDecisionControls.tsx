/**
 * The decision block's payment half (admissions-v2 task 12.1, MAINT-01).
 *
 * Lifted **verbatim** out of `ApplicationApprovalActions.tsx`: the read-only
 * explanation, the four `normalizedPaymentStatus` branches, their commands, their
 * badges, and the notes dialog. Every label, tone, `disabled` predicate and
 * `sm:col-span-2` is the one that was there.
 *
 * Why the payment half moves and the application-status half does not: two other
 * lanes' preservation tests read `ApplicationApprovalActions.tsx`'s **source text**
 * for `currentStatus === '<status>'` branches and for `handleStatusUpdate('approved')`
 * adjacent to the `under_review` branch (`approvalFlowPreservation.property.test.ts`).
 * Task 11.4 declined to split this file for exactly that reason. Moving the
 * payment branches keeps those claims literally true rather than repointing a pin
 * that did not need repointing — the smaller change is the honest one.
 *
 * `canVerifyPayment` is still the server's answer (task 9.4, AUTH-02), and the
 * backend still re-enforces the capability on every decision. Hiding a control an
 * actor cannot use is usability, never the boundary.
 */
import { CheckCircle, Clock, RotateCcw, XCircle } from 'lucide-react'

// Concrete module paths, not the `@/components/ui` barrel (task 12.1): the barrel
// re-exports the whole primitive set, so importing it puts a new module inside the
// pre-existing barrel import cycle. Same primitives, one fewer edge.
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge } from '@/components/ui/StatusBadge'
import {
  OUTLINE_SUCCESS,
  OUTLINE_WARNING,
  STATUS_CALLOUT,
} from '@/components/admin/applications/approvalActionTokens'
import type { PaymentReviewCopy } from '@/components/admin/applications/paymentReviewCopy'

interface PaymentDecisionControlsProps {
  normalizedPaymentStatus: string
  canVerifyPayment: boolean
  showStatusSummary: boolean
  disabled: boolean
  updatingPayment: boolean
  paymentReviewDialogOpen: boolean
  paymentReviewCopy: PaymentReviewCopy
  paymentReviewNotes: string
  paymentReviewError: string | null
  onNotesChange: (value: string) => void
  onOpenReviewDialog: (status: string) => void
  onDialogOpenChange: (open: boolean) => void
  onSubmitDecision: () => void
}

export function PaymentDecisionControls({
  normalizedPaymentStatus,
  canVerifyPayment,
  showStatusSummary,
  disabled,
  updatingPayment,
  paymentReviewDialogOpen,
  paymentReviewCopy,
  paymentReviewNotes,
  paymentReviewError,
  onNotesChange,
  onOpenReviewDialog,
  onDialogOpenChange,
  onSubmitDecision,
}: PaymentDecisionControlsProps) {
  return (
    <>
      <div>
        <label className="mb-2 block text-xs font-medium text-foreground">
          Payment status
        </label>
        {!canVerifyPayment ? (
          <p
            className="rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground"
            data-testid="payment-review-read-only"
          >
            Payment shows as {normalizedPaymentStatus.replace(/_/g, ' ')}. Recording a payment
            decision requires the payment verification permission for this school.
          </p>
        ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {normalizedPaymentStatus === 'not_paid' && (
            <div className="sm:col-span-2 grid gap-2">
            {showStatusSummary && (
            <div className={`text-center py-2 space-y-1 ${STATUS_CALLOUT}`}>
              <StatusBadge tone="warning" icon={Clock} label="Awaiting payment" />
            </div>
            )}
              <Button
                variant="outline"
                onClick={() => onOpenReviewDialog('verified')}
                disabled={updatingPayment || disabled}
                className={`w-full ${OUTLINE_SUCCESS}`}
              >
                {updatingPayment ? 'Updating…' : (
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
                onClick={() => onOpenReviewDialog('verified')}
                disabled={updatingPayment || disabled}
                className={OUTLINE_SUCCESS}
              >
                {updatingPayment ? 'Updating…' : (
                  <>
                    <CheckCircle className="h-3 w-3" />
                    Verify
                  </>
                )}
              </Button>
              <Button
                variant="destructive"
                onClick={() => onOpenReviewDialog('rejected')}
                disabled={updatingPayment || disabled}
                className="w-full"
              >
                {updatingPayment ? 'Updating…' : (
                  <>
                    <XCircle className="h-3 w-3" />
                    Reject
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => onOpenReviewDialog('deferred')}
                disabled={updatingPayment || disabled}
                className={`${OUTLINE_WARNING} sm:col-span-2`}
              >
                {updatingPayment ? 'Updating…' : (
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
              onClick={() => onOpenReviewDialog('pending_review')}
              disabled={updatingPayment || disabled}
              className="sm:col-span-2"
            >
              {updatingPayment ? 'Updating…' : (
                <>
                  <RotateCcw className="h-3 w-3" />
                  Reopen review
                </>
              )}
            </Button>
          )}

          {normalizedPaymentStatus === 'deferred' && (
            <>
              {showStatusSummary && (
              <div className={`text-center py-3 ${STATUS_CALLOUT}`}>
                <StatusBadge tone="warning" icon={Clock} label="Deferred" />
              </div>
              )}
              <Button
                variant="warning"
                onClick={() => onOpenReviewDialog('pending_review')}
                disabled={updatingPayment || disabled}
                className="w-full"
              >
                {updatingPayment ? 'Updating…' : (
                  <>
                    <RotateCcw className="h-3 w-3" />
                    Reopen review
                  </>
                )}
              </Button>
            </>
          )}

          {(normalizedPaymentStatus === 'verified' || normalizedPaymentStatus === 'rejected') && (
            <div className="sm:col-span-2 text-center py-2">
              {normalizedPaymentStatus === 'verified' ? (
                <StatusBadge tone="success" icon={CheckCircle} label="Verified" />
              ) : (
                <StatusBadge tone="destructive" icon={XCircle} label="Rejected" />
              )}
            </div>
          )}
        </div>
        )}
      </div>
      <Dialog open={paymentReviewDialogOpen} onOpenChange={onDialogOpenChange}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{paymentReviewCopy.title}</DialogTitle>
            <DialogDescription>{paymentReviewCopy.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              label={paymentReviewCopy.notesLabel}
              value={paymentReviewNotes}
              onChange={(event) => onNotesChange(event.target.value)}
              placeholder={paymentReviewCopy.notesPlaceholder}
              error={paymentReviewError ?? undefined}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onDialogOpenChange(false)}
              disabled={updatingPayment}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={onSubmitDecision}
              disabled={updatingPayment}
            >
              {updatingPayment ? 'Saving…' : paymentReviewCopy.confirmText}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
