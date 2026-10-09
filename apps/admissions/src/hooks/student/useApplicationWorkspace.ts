/**
 * The student application workspace's server reads and commands (admissions-v2
 * task 12.1, MAINT-01).
 *
 * Lifted **verbatim** out of `pages/student/ApplicationStatus.tsx`: four
 * `useQuery` reads, four `useMutation` commands, and the local state each command
 * owns. Every cache key, every `enabled` predicate, every `staleTime`, every
 * invalidation and every toast is the one that was there. The page renders the
 * result; it no longer also fetches, mutates, validates and holds dialog state
 * around it — which is the specific mixing MAINT-01 names.
 *
 * It follows task 9.4's shape for the same problem on the admin side
 * (`hooks/admin/useReviewWorkspace.ts`): one hook per workspace, consuming domain
 * service modules, returning data plus commands. No generic repository, no new
 * state library — R14.3 and the task's own "do not add generic repositories"
 * constraint.
 */
import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { CACHE_CONFIG } from '@/hooks/queries/useQueryConfig'
import { useToastStore } from '@/hooks/useToast'
import { isValidEmail, isValidPhoneNumber } from '@/lib/utils'
import { applicationService, type StudentCondition } from '@/services/applications'
import { AuthenticationError } from '@/services/client'
import { toApplicationHistoryRows } from '@/components/student/applicationStatus/ApplicationHistory'
import type { ApplicationWithDetails } from '@/types/database'

/** Statuses in which the student may request an amendment to their own details. */
export const AMENDABLE_STATUSES = new Set(['submitted', 'under_review', 'waitlisted'])

/** Amendment fields validated as phone numbers rather than free text. */
const PHONE_AMENDMENT_FIELDS = new Set(['phone', 'next_of_kin_phone'])

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function useApplicationWorkspace(id: string | undefined, enabled: boolean) {
  const queryClient = useQueryClient()

  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false)
  const [withdrawalReason, setWithdrawalReason] = useState('')
  const [showEnrollDialog, setShowEnrollDialog] = useState(false)
  const [amendField, setAmendField] = useState('')
  const [amendValue, setAmendValue] = useState('')
  const [amendReason, setAmendReason] = useState('')
  const [amendError, setAmendError] = useState('')
  const [amendSuccess, setAmendSuccess] = useState('')
  const [conditionErrors, setConditionErrors] = useState<Record<string, string>>({})

  /*
    Task 10.6 (R13.13, STU-23): **one** detail read for the whole workspace.
    Before that task the same `getById` ran twice under two cache keys —
    `['application-status', id]` here and `['application-detail', id]` on the
    retired second workspace — so two pages could hold two different answers
    about one application at the same moment, which is what STU-23's "duplicate
    payment, document, interview, and timeline logic" costs in practice.

    `include: ['statusHistory']` is the only addition to the request: it adds the
    server's own `ApplicationStatusHistory` rows (`GET …/summary/`), which is the
    canonical history R13.2 asks the workspace to show. No new endpoint and no
    second contract — the include already existed and no student surface used it.
  */
  const {
    data: detail = null,
    isLoading: loading,
    error: queryError,
    refetch: loadApplicationDetails,
  } = useQuery({
    queryKey: ['application-workspace', id],
    queryFn: async () => {
      try {
        const response = await applicationService.getById(id!, { include: ['statusHistory'] })
        if (!response.application) {
          throw new Error('Application not found or access denied')
        }
        return {
          application: response.application as ApplicationWithDetails,
          statusHistory: toApplicationHistoryRows(response.statusHistory),
        }
      } catch (error) {
        if (error instanceof AuthenticationError) {
          throw error
        }
        throw new Error('Application not found or access denied')
      }
    },
    enabled: !!id && enabled,
    ...CACHE_CONFIG.applications,
  })

  const application = detail?.application ?? null
  const statusHistory = detail?.statusHistory ?? []
  const error = queryError ? messageOf(queryError, 'Failed to load application') : ''

  const withdrawMutation = useMutation({
    mutationFn: async (reason: string) => {
      await applicationService.withdraw(id!, reason)
    },
    onSuccess: () => {
      setShowWithdrawDialog(false)
      setWithdrawalReason('')
      queryClient.invalidateQueries({ queryKey: ['application-workspace', id] })
      useToastStore.getState().addToast('success', 'Application withdrawn successfully')
    },
  })

  const { data: conditions = [] } = useQuery<StudentCondition[]>({
    queryKey: ['application-conditions', id],
    queryFn: async () => {
      const res = await applicationService.getConditions(id!)
      return (res ?? []) as StudentCondition[]
    },
    enabled: !!id && application?.status === 'conditionally_approved',
    staleTime: 60_000,
  })

  // Task 10.2 (R13.9, STU-16): submitting or replacing one condition's evidence.
  // The server decides whether either is allowed (`allowed_actions`); this only
  // carries the file and the note, and re-reads the conditions afterwards so the
  // new state and the new version come from the platform rather than being
  // guessed locally.
  const conditionEvidenceMutation = useMutation({
    mutationFn: async (input: { conditionId: string; file: File; comment: string }) => {
      await applicationService.submitConditionEvidence(id!, input.conditionId, {
        file: input.file,
        comment: input.comment,
      })
      return input.conditionId
    },
    onSuccess: () => {
      setConditionErrors({})
      queryClient.invalidateQueries({ queryKey: ['application-conditions', id] })
      useToastStore.getState().addToast('success', 'Evidence sent for review')
    },
    onError: (err: Error, input) => {
      setConditionErrors((current) => ({
        ...current,
        [input.conditionId]: err.message || 'That file could not be sent. Please try again.',
      }))
    },
  })

  // Task 10.2 (R13.9-R13.10, STU-17): the student's own amendment history.
  const { data: amendmentPage, isLoading: amendmentsLoading } = useQuery({
    queryKey: ['application-amendments', id],
    queryFn: async () => applicationService.listAmendments(id!, { pageSize: 20 }),
    enabled: !!id && !!application && AMENDABLE_STATUSES.has(application.status),
    staleTime: 30_000,
  })

  const { data: waitlistPosition } = useQuery<{ position: number; total: number }>({
    queryKey: ['waitlist-position', id],
    queryFn: async () => {
      const res = await applicationService.getWaitlistPosition(id!)
      return res ?? { position: 0, total: 0 }
    },
    enabled: !!id && application?.status === 'waitlisted',
    staleTime: 60_000,
  })

  const confirmEnrollmentMutation = useMutation({
    mutationFn: async () => {
      await applicationService.confirmEnrollment(id!)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['application-workspace', id] })
      useToastStore.getState().addToast('success', 'Enrollment confirmed successfully')
    },
  })

  const amendMutation = useMutation({
    mutationFn: async (data: { field_name: string; new_value: string; reason: string }) => {
      await applicationService.submitAmendment(id!, data)
    },
    onSuccess: () => {
      setAmendField('')
      setAmendValue('')
      setAmendReason('')
      setAmendError('')
      setAmendSuccess('Amendment request submitted successfully.')
      setTimeout(() => setAmendSuccess(''), 5000)
      // Task 10.2: a new request appears in the student's own history straight
      // away, so "did that go through?" is answered on the page rather than by
      // submitting it again.
      queryClient.invalidateQueries({ queryKey: ['application-amendments', id] })
    },
    onError: (err: Error) => {
      setAmendError(err.message || 'Failed to submit amendment request.')
    },
  })

  const handleWithdraw = () => {
    if (withdrawalReason.trim().length < 10) return
    withdrawMutation.mutate(withdrawalReason.trim())
  }

  const handleAmendSubmit = (e: FormEvent) => {
    e.preventDefault()
    setAmendError('')
    setAmendSuccess('')
    const normalizedValue = amendValue.trim()
    const normalizedReason = amendReason.trim()

    if (!amendField || !normalizedValue || !normalizedReason) {
      setAmendError('All fields are required.')
      return
    }
    if (amendField === 'email' && !isValidEmail(normalizedValue)) {
      setAmendError('Enter a valid email address.')
      return
    }
    if (PHONE_AMENDMENT_FIELDS.has(amendField) && !isValidPhoneNumber(normalizedValue)) {
      setAmendError('Enter a valid phone number with digits only, optionally prefixed with +.')
      return
    }
    amendMutation.mutate({ field_name: amendField, new_value: normalizedValue, reason: normalizedReason })
  }

  return {
    application,
    statusHistory,
    loading,
    error,
    loadApplicationDetails,

    conditions,
    amendmentPage,
    amendmentsLoading,
    waitlistPosition,

    // Withdrawal
    showWithdrawDialog,
    setShowWithdrawDialog,
    withdrawalReason,
    setWithdrawalReason,
    handleWithdraw,
    withdrawPending: withdrawMutation.isPending,
    withdrawError: withdrawMutation.isError
      ? messageOf(withdrawMutation.error, 'Failed to withdraw application.')
      : null,

    // Enrollment
    showEnrollDialog,
    setShowEnrollDialog,
    confirmEnrollment: confirmEnrollmentMutation.mutate,
    enrollPending: confirmEnrollmentMutation.isPending,
    enrollError: confirmEnrollmentMutation.isError
      ? messageOf(confirmEnrollmentMutation.error, 'Failed to confirm enrollment')
      : null,
    enrollDialogError: confirmEnrollmentMutation.isError
      ? messageOf(confirmEnrollmentMutation.error, 'Failed to confirm enrollment.')
      : null,

    // Amendments
    amendField,
    setAmendField,
    amendValue,
    setAmendValue,
    amendReason,
    setAmendReason,
    amendError,
    setAmendError,
    amendSuccess,
    handleAmendSubmit,
    amendPending: amendMutation.isPending,

    // Conditions
    conditionErrors,
    submitConditionEvidence: conditionEvidenceMutation.mutate,
    pendingConditionId: conditionEvidenceMutation.isPending
      ? conditionEvidenceMutation.variables?.conditionId ?? null
      : null,
  }
}
