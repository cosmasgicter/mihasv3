/**
 * The admin review workspace's one read, its versioned commands, and the state
 * those commands own (admissions-v2 task **12.1**, MAINT-01).
 *
 * Lifted **verbatim** out of `ApplicationDetailModal.tsx`. Task 9.4 moved the
 * *fetching* out (`services/admin/reviewWorkspace.ts`, `useReviewWorkspace.ts`,
 * `workspaceAdapters.ts`) and recorded in its §15 that rendering had stayed and
 * grown, so MAINT-01 was not claimed done for that file. This is the layer between
 * the two: the projections of the one payload, the conflict-aware `runCommand`
 * wrapper, and the eleven decision handlers.
 *
 * Nothing about the contract changed. Every command still sends the `version` the
 * read returned; a stale command is still refused with 409 `VERSION_CONFLICT` and
 * still reported as "someone else decided first" rather than as a generic failure;
 * capabilities still come from `workspace.capabilities` and fail closed to
 * `NO_WORKSPACE_CAPABILITIES`; and the backend still re-enforces every check —
 * hiding a control was never the boundary.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'

import { useToastStore } from '@/hooks/useToast'
import { toError } from '@/lib/toError'
import {
  NO_WORKSPACE_CAPABILITIES,
  reviewWorkspaceService,
} from '@/services/admin/reviewWorkspace'
import {
  useRefreshReviewWorkspace,
  useReviewCommand,
  useReviewWorkspace,
} from '@/hooks/admin/useReviewWorkspace'
import {
  toApplicationWithDetails,
  toCurrentInterview,
  toDocumentItems,
  toGrades,
  toPaymentRecords,
  toStatusHistory,
} from '@/components/admin/applications/workspaceAdapters'
import type { ApplicationWithDetails } from '@/components/admin/applications/applicationDetailTypes'

interface UseReviewWorkspaceSessionInput {
  application: ApplicationWithDetails | null
  show: boolean
  onUpdateStatus: (
    id: string,
    status: string,
    options?: { notes?: string; force?: boolean },
  ) => Promise<unknown>
}

export function useReviewWorkspaceSession({
  application,
  show,
  onUpdateStatus,
}: UseReviewWorkspaceSessionInput) {
  // Command-owned state. `isClient`, `activeTab`, the notification modal and the
  // focus trap stay with the component: they are about the sheet, not the record.
  const [adminFeedback, setAdminFeedback] = useState('')
  const [savingFeedback, setSavingFeedback] = useState(false)
  const [paymentWarning, setPaymentWarning] = useState<{ applicationId: string; status: string } | null>(null)
  const [feeWaiverOpen, setFeeWaiverOpen] = useState(false)
  const { success: showSuccess, error: showError, info: showInfo } = useToastStore()

  const applicationId = application?.id ?? null
  const {
    data: workspace,
    isLoading,
    isError,
    error: workspaceError,
  } = useReviewWorkspace(applicationId, { enabled: show })
  const command = useReviewCommand(applicationId)
  const refreshWorkspace = useRefreshReviewWorkspace(applicationId)

  const resetCommandState = command.reset
  useEffect(() => {
    resetCommandState()
  }, [applicationId, show, resetCommandState])

  // The feedback textarea is seeded from the server's answer, once per read.
  useEffect(() => {
    setAdminFeedback(workspace?.communication.admin_feedback ?? '')
  }, [workspace?.communication.admin_feedback])

  // Every panel below reads one projection of the one server payload. No merge,
  // no `??` chain across two payloads — that was API-02's shape.
  const detail = useMemo(
    () => (workspace ? toApplicationWithDetails(workspace) : application),
    [workspace, application],
  )
  const documents = useMemo(() => (workspace ? toDocumentItems(workspace) : []), [workspace])
  const grades = useMemo(() => (workspace ? toGrades(workspace) : []), [workspace])
  const statusHistory = useMemo(() => (workspace ? toStatusHistory(workspace) : []), [workspace])
  const paymentRecords = useMemo(() => (workspace ? toPaymentRecords(workspace) : []), [workspace])
  const currentInterview = useMemo(
    () => (workspace ? toCurrentInterview(workspace) : null),
    [workspace],
  )
  // Fail closed in the browser too: no capability until the server names one.
  const can = workspace?.capabilities ?? NO_WORKSPACE_CAPABILITIES

  const reportCommandOutcome = useCallback(
    (label: string, error: unknown) => {
      if (!error) {
        showSuccess(label, 'The change has been recorded.')
        return
      }
      if (command.conflicted) {
        // Not the reviewer's error: someone else decided first. Say so, and the
        // hook has already refetched so the newer decision is on screen.
        showInfo(
          'This application changed',
          'Another reviewer recorded a decision while this was open. The latest state is now shown.',
        )
        return
      }
      showError(label, toError(error).message || 'The change could not be recorded.')
    },
    [command.conflicted, showError, showInfo, showSuccess],
  )

  const runCommand = useCallback(
    async (label: string, issue: (version: number) => Promise<unknown>) => {
      try {
        await command.run(issue as (version: number) => Promise<Record<string, unknown>>)
        reportCommandOutcome(label, null)
        return true
      } catch (error) {
        reportCommandOutcome(label, error)
        return false
      }
    },
    [command, reportCommandOutcome],
  )

  const handleSaveFeedback = async () => {
    if (!applicationId || !adminFeedback.trim()) return
    setSavingFeedback(true)
    try {
      // Reviewer feedback rides the decision command's own notes: it is a record
      // *about* a review, and the platform has one writer for that.
      await runCommand('Feedback saved', (version) =>
        reviewWorkspaceService.decide(applicationId, {
          new_status: workspace?.status ?? '',
          notes: adminFeedback.trim(),
          expected_version: version,
        }),
      )
    } finally {
      setSavingFeedback(false)
    }
  }

  const handleApplyFeeWaiver = async (form: {
    waiver_type: string
    reason_code: string
    discount_percentage: number
  }) => {
    if (!applicationId) return
    const ok = await runCommand('Fee waiver applied', (version) =>
      reviewWorkspaceService.grantFeeWaiver(applicationId, { ...form, expected_version: version }),
    )
    if (ok) setFeeWaiverOpen(false)
  }

  const handleAmendmentDecision = (amendmentId: string, status: 'approved' | 'rejected') => {
    if (!applicationId) return
    void runCommand(`Amendment ${status}`, (version) =>
      reviewWorkspaceService.reviewAmendment(applicationId, amendmentId, {
        status,
        expected_version: version,
      }),
    )
  }

  /*
    Task 10.6 (R13.9, R13.13, findings STU-23 / STU-16): the canonical
    three-outcome condition command.

    This called the two-outcome `/verify/` route, so `changes_required` — the one
    outcome a reviewer actually needs when evidence is wrong rather than absent —
    was unreachable from the only place a reviewer works. `reason` is required by
    the server for `changes_required` and `waived`, and it is the sentence the
    student reads.
  */
  const handleConditionReview = (
    conditionId: string,
    outcome: 'met' | 'changes_required' | 'waived',
    reason?: string,
  ) => {
    if (!applicationId) return
    void runCommand(`Condition ${outcome.replace(/_/g, ' ')}`, (version) =>
      reviewWorkspaceService.reviewCondition(applicationId, conditionId, {
        outcome,
        ...(reason ? { reason } : {}),
        expected_version: version,
      }),
    )
  }

  // Evidence verification is a workspace command, not a component's own fetch
  // (AUTH-02, R8.4). It used to be issued inside ApplicationDetailDocuments with
  // no authority check on this side and no version, so a verification recorded
  // from a stale view could land on top of a newer one.
  const handleDocumentVerify = (documentId: string, docStatus: 'verified' | 'rejected') => {
    if (!applicationId) return
    void runCommand(docStatus === 'verified' ? 'Document verified' : 'Document rejected', (version) =>
      reviewWorkspaceService.verifyDocument(applicationId, {
        documentId,
        status: docStatus,
        expected_version: version,
      }),
    )
  }

  // The payment decision used to travel out of the modal, through the roster
  // page, into the unversioned legacy `updatePaymentStatus`. It is now the same
  // versioned command as every other decision, gated on the server's own
  // `tenant.payment.verify` answer.
  const handlePaymentDecision = useCallback(
    async (_id: string, paymentStatus: string, verificationNotes?: string) => {
      if (!applicationId) return
      await runCommand('Payment updated', (version) =>
        reviewWorkspaceService.reviewPayment(applicationId, {
          payment_status: paymentStatus,
          notes: verificationNotes,
          expected_version: version,
        }),
      )
    },
    [applicationId, runCommand],
  )

  const handleInterviewSchedule = useCallback(
    (input: { scheduled_at: string; mode: string; location?: string; notes?: string }) => {
      if (!applicationId) return Promise.resolve(false)
      return runCommand('Interview scheduled', (version) =>
        reviewWorkspaceService.scheduleInterview(applicationId, {
          ...input,
          expected_version: version,
        }),
      )
    },
    [applicationId, runCommand],
  )

  const handleInterviewUpdate = useCallback(
    (input: { scheduled_at: string; mode: string; location?: string; notes?: string }) => {
      if (!applicationId) return Promise.resolve(false)
      return runCommand('Interview updated', (version) =>
        reviewWorkspaceService.updateInterview(applicationId, {
          ...input,
          expected_version: version,
        }),
      )
    },
    [applicationId, runCommand],
  )

  const handleInterviewCancel = useCallback(
    (input: { notes?: string }) => {
      if (!applicationId) return Promise.resolve(false)
      return runCommand('Interview cancelled', (version) =>
        reviewWorkspaceService.cancelInterview(applicationId, {
          ...input,
          expected_version: version,
        }),
      )
    },
    [applicationId, runCommand],
  )

  const handleStatusWithWarning = async (appId: string, newStatus: string) => {
    const result = await onUpdateStatus(appId, newStatus)
    if (result && typeof result === 'object' && 'warning' in result && result.warning === true) {
      setPaymentWarning({ applicationId: appId, status: newStatus })
      return
    }
    window.dispatchEvent(new CustomEvent('applicationUpdated', { detail: { applicationId: appId } }))
    refreshWorkspace()
  }

  const handlePaymentWarningConfirm = async () => {
    if (!paymentWarning) return
    try {
      await onUpdateStatus(paymentWarning.applicationId, paymentWarning.status, { force: true })
      window.dispatchEvent(
        new CustomEvent('applicationUpdated', {
          detail: { applicationId: paymentWarning.applicationId },
        }),
      )
      refreshWorkspace()
    } finally {
      setPaymentWarning(null)
    }
  }
  return {
    applicationId,
    workspace,
    isLoading,
    isError,
    workspaceError,
    command,
    resetCommandState,
    refreshWorkspace,

    detail,
    documents,
    grades,
    statusHistory,
    paymentRecords,
    currentInterview,
    can,

    adminFeedback,
    setAdminFeedback,
    savingFeedback,
    handleSaveFeedback,

    feeWaiverOpen,
    setFeeWaiverOpen,
    handleApplyFeeWaiver,

    handleAmendmentDecision,
    handleConditionReview,
    handleDocumentVerify,
    handlePaymentDecision,
    handleInterviewSchedule,
    handleInterviewUpdate,
    handleInterviewCancel,

    paymentWarning,
    setPaymentWarning,
    handleStatusWithWarning,
    handlePaymentWarningConfirm,
  }
}
