import { CheckCircle, XCircle, Clock } from 'lucide-react'
import { ConfirmAlertDialog } from '@/components/ui/alert-dialog'
import { formatApplicationStatus } from '@/types/applicationStatus'
import { isPaymentResolvedForApproval, normalizePaymentStatus } from '@/lib/paymentStatus'
import type { StatusCommandOptions } from '@/types/statusCommand'
import { ConditionsDialog } from '@/components/admin/applications/ConditionsDialog'
import { useState } from 'react'
import { Button, StatusBadge } from '@/components/ui'
/*
  Task 12.1 (R14.3-R14.5, R17.5; finding MAINT-01): this file was 689 lines that
  held the tone tokens, the dialog copy map, both commands, both branch trees and
  two dialogs. Four of those moved:

    - `approvalActionTokens.ts`        — the tone vocabulary (task 11.5's, verbatim).
    - `paymentReviewCopy.ts`           — the dialog copy map, and the one
                                         client-side rule in the block: a rejection
                                         must carry a reason.
    - `useApprovalActionCommands.ts`   — both commands and the dialog state.
    - `PaymentDecisionControls.tsx`    — the payment branch tree and its dialog.

  What deliberately stayed is the **application-status** branch tree. Task 11.4
  declined to split this file because two other lanes read its source text —
  `approvalFlowPreservation.property.test.ts` asserts a `currentStatus === '<status>'`
  branch for each of five statuses in *this* file, and `handleStatusUpdate('approved')`
  / `('rejected')` within 1,200 characters of the `under_review` branch. Keeping that
  half here keeps those claims literally true, so no pin needed repointing. The
  dispatch allowed either; the smaller change is the honest one.
*/
import {
  OUTLINE_INFO,
  OUTLINE_WARNING,
} from '@/components/admin/applications/approvalActionTokens'
import { PaymentDecisionControls } from '@/components/admin/applications/PaymentDecisionControls'
import { useApprovalActionCommands } from '@/hooks/admin/useApprovalActionCommands'

interface ApplicationApprovalActionsProps {
  applicationId: string
  currentStatus: string
  currentPaymentStatus?: string | null
  onStatusUpdate: (id: string, status: string, options?: StatusCommandOptions) => Promise<void>
  onPaymentStatusUpdate: (id: string, status: string, verificationNotes?: string) => Promise<void>
  /**
   * Whether this actor holds `tenant.payment.verify` for this application's
   * school (task 9.4, AUTH-02). The backend is the boundary — it re-enforces the
   * capability on every payment decision — but a control an actor cannot use
   * should not be offered, so the answer comes from the server's own published
   * command matrix rather than a role tier.
   *
   * Defaults to `true` for the roster card, whose payment control predates this
   * matrix and is gated by the endpoint alone.
   */
  canVerifyPayment?: boolean
  /**
   * Whether this block renders its own Application/Payment status pair
   * (admissions-v2 task 11.4).
   *
   * The review workspace wants them: the block is the footer of a sheet whose
   * header is scrolled away. The roster row does **not** — it already renders the
   * application's status badge and its payment badge above, and the block now
   * lives inside that row's counted disclosure, so its copy of the pair would be
   * a third statement of the same two facts and it would be inside a collapsed
   * panel. R16.5 calls two controls for one action a duplicate affordance; the
   * same reasoning applies to two renderings of one status.
   */
  showStatusSummary?: boolean
  disabled?: boolean
}

export function ApplicationApprovalActions({
  applicationId,
  currentStatus,
  currentPaymentStatus,
  onStatusUpdate,
  onPaymentStatusUpdate,
  canVerifyPayment = true,
  showStatusSummary = true,
  disabled = false
}: ApplicationApprovalActionsProps) {
  const normalizedPaymentStatus = normalizePaymentStatus(currentPaymentStatus)
  const isPaymentResolved = isPaymentResolvedForApproval(currentPaymentStatus)
  const [conditionsOpen, setConditionsOpen] = useState(false)

  const commands = useApprovalActionCommands({
    applicationId,
    disabled,
    isPaymentResolved,
    onStatusUpdate,
    onPaymentStatusUpdate,
  })
  const { confirmDialog, updatingStatus, handleStatusUpdate } = commands

  /**
   * Whether this block is *listed* inside a record's disclosure rather than
   * owning its surface (admissions-v2 task 11.4).
   *
   * When it is, the row already has one primary control, so the block's two
   * default-variant commands ("Force Submit", "Review") step down to `outline`:
   * two identically-filled primary buttons on one 390 px card is a second primary,
   * which is the thing 11.3's pattern exists to prevent. The semantic tones
   * (`success` / `destructive` / `warning`) do **not** step down — those carry
   * decision meaning, are paired with a word and an icon, and are the same in the
   * review workspace.
   */
  const listed = !showStatusSummary
  const advanceVariant = listed ? 'outline' : 'default'

  return (
    <div className="space-y-3">
      {showStatusSummary && (
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
      )}

      {/* Application Status Controls */}
      <div>
        <label className="mb-2 block text-xs font-medium text-foreground">
          Application status
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          {currentStatus === 'draft' && (
            <>
              {/*
                Status-only, so it is suppressed when the block is listed inside a
                record whose card already publishes the same status above it — a
                third rendering of one fact, inside a collapsed panel (task 11.4).
              */}
              {showStatusSummary && (
              <div className="flex-1 rounded-lg border border-border bg-muted py-3 text-center">
                <StatusBadge tone="neutral" label="Draft: not yet submitted" />
              </div>
              )}
              <Button
                variant={advanceVariant}
                onClick={() => handleStatusUpdate('submitted')}
                disabled={updatingStatus || disabled}
                className="w-full"
              >
                {updatingStatus ? 'Updating…' : 'Force submit'}
              </Button>
            </>
          )}

          {currentStatus === 'submitted' && (
            <Button
              variant={advanceVariant}
              onClick={() => handleStatusUpdate('under_review')}
              disabled={updatingStatus || disabled}
              className="sm:col-span-2"
            >
              {updatingStatus ? 'Updating…' : (
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
                disabled={updatingStatus || disabled || !isPaymentResolved}
                className="w-full"
                title={!isPaymentResolved ? 'Payment must be paid or deferred first' : 'Approve application'}
              >
                {updatingStatus ? 'Updating…' : (
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
                {updatingStatus ? 'Updating…' : (
                  <>
                    <XCircle className="h-3 w-3" />
                    Reject
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setConditionsOpen(true)}
                disabled={updatingStatus || disabled}
                className={`w-full ${OUTLINE_INFO}`}
              >
                {updatingStatus ? 'Updating…' : (
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
                className={`w-full ${OUTLINE_WARNING}`}
              >
                {updatingStatus ? 'Updating…' : (
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
              {currentStatus === 'approved' ? (
                <StatusBadge tone="success" icon={CheckCircle} label="Approved" />
              ) : (
                <StatusBadge tone="destructive" icon={XCircle} label="Rejected" />
              )}
            </div>
          )}

          {currentStatus === 'conditionally_approved' && (
            <>
              {showStatusSummary && (
              <div className="sm:col-span-2 text-center py-2">
                <StatusBadge tone="info" icon={Clock} label="Conditionally approved" />
              </div>
              )}
              <Button
                variant="success"
                onClick={() => handleStatusUpdate('approved')}
                disabled={updatingStatus || disabled || !isPaymentResolved}
                className="w-full"
                title={!isPaymentResolved ? 'Payment must be paid or deferred first' : 'Approve application'}
              >
                {updatingStatus ? 'Updating…' : (
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
                {updatingStatus ? 'Updating…' : (
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
              {showStatusSummary && (
              <div className="sm:col-span-2 text-center py-2">
                <StatusBadge tone="warning" icon={Clock} label="Waitlisted" />
              </div>
              )}
              <Button
                variant="success"
                onClick={() => handleStatusUpdate('approved')}
                disabled={updatingStatus || disabled || !isPaymentResolved}
                className="w-full"
                title={!isPaymentResolved ? 'Payment must be paid or deferred first' : 'Approve application'}
              >
                {updatingStatus ? 'Updating…' : (
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
                {updatingStatus ? 'Updating…' : (
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
              <StatusBadge tone="success" icon={CheckCircle} label="Enrolled" />
            </div>
          )}

          {currentStatus === 'withdrawn' && (
            <div className="sm:col-span-2 text-center py-2">
              <StatusBadge tone="neutral" icon={XCircle} label="Withdrawn" />
            </div>
          )}

          {currentStatus === 'expired' && (
            <div className="sm:col-span-2 text-center py-2">
              <StatusBadge tone="destructive" icon={XCircle} label="Expired" />
            </div>
          )}

          {currentStatus === 'enrollment_expired' && (
            <div className="sm:col-span-2 text-center py-2">
              <StatusBadge tone="warning" icon={Clock} label="Enrollment expired" />
            </div>
          )}
        </div>
      </div>

      <PaymentDecisionControls
        normalizedPaymentStatus={normalizedPaymentStatus}
        canVerifyPayment={canVerifyPayment}
        showStatusSummary={showStatusSummary}
        disabled={disabled}
        updatingPayment={commands.updatingPayment}
        paymentReviewDialogOpen={commands.paymentReviewDialogOpen}
        paymentReviewCopy={commands.paymentReviewCopy}
        paymentReviewNotes={commands.paymentReviewNotes}
        paymentReviewError={commands.paymentReviewError}
        onNotesChange={(value) => {
          commands.setPaymentReviewNotes(value)
          if (commands.paymentReviewError) {
            commands.setPaymentReviewError(null)
          }
        }}
        onOpenReviewDialog={commands.openPaymentReviewDialog}
        onDialogOpenChange={commands.handlePaymentDialogOpenChange}
        onSubmitDecision={() => {
          void commands.handlePaymentUpdate()
        }}
      />
      <ConditionsDialog
        open={conditionsOpen}
        onOpenChange={setConditionsOpen}
        submitting={updatingStatus}
        onConfirm={async (conditions) => {
          if (await handleStatusUpdate('conditionally_approved', { conditions })) {
            setConditionsOpen(false)
          }
        }}
      />
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
    </div>
  )
}
