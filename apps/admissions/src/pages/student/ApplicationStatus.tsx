import React, { useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Seo } from '@/components/seo/Seo'
import { useAuth } from '@/contexts/AuthContext'
import type { ApplicationWithDetails } from '@/types/database'
import { Button } from '@/components/ui/Button'
import { Skeleton, SkeletonCard } from '@/components/ui'
import { formatDate, formatTimestamp } from '@/lib/dateFormat'
import { applicationService } from '@/services/applications'
import { AuthenticationError } from '@/services/client'
import { staggerChild, animateClasses } from '@/lib/animations'
import { DocumentButtons } from '@/components/student/DocumentButtons'
import {
  getPaymentStatusLabel,
  normalizePaymentStatus,
  requiresStudentPaymentAction,
} from '@/lib/paymentStatus'
import {
  ArrowLeft,
  FileText,
  Calendar,
  User,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  Download,
  Eye,
  Phone,
  CreditCard,
  LogOut,
  AlertTriangle,
  Edit3,
  Send
} from 'lucide-react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { SectionCard } from '@/components/ui/SectionCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { PageShell } from '@/components/ui/PageShell'
import { CACHE_CONFIG } from '@/hooks/queries/useQueryConfig'
import { useToastStore } from '@/hooks/useToast'
import { isValidEmail, isValidPhoneNumber } from '@/lib/utils'
import { canWithdraw } from '@/lib/withdrawalEligibility'

interface ApplicationTimeline {
  status: string
  date: string | undefined
  description: string
  completed: boolean
}

interface ApplicationCondition {
  id: string
  description: string
  deadline: string
  status: string
  condition_type: string
  met_at: string | null
}

const AMENDABLE_FIELDS = [
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'address_line_1', label: 'Address Line 1' },
  { key: 'address_line_2', label: 'Address Line 2' },
  { key: 'residence_town', label: 'Residence Town' },
  { key: 'next_of_kin_name', label: 'Next of Kin Name' },
  { key: 'next_of_kin_phone', label: 'Next of Kin Phone' },
] as const

const AMENDABLE_STATUSES = new Set(['submitted', 'under_review', 'waitlisted'])
const PHONE_AMENDMENT_FIELDS = new Set(['phone', 'next_of_kin_phone'])

function formatStatusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

function truncateValue(value: string | null | undefined, maxLength: number) {
  if (!value) {
    return null
  }

  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[minmax(0,9rem)_1fr] sm:items-start">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground break-words">{value}</dd>
    </div>
  )
}

export default function ApplicationStatus() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // Withdrawal state
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false)
  const [withdrawalReason, setWithdrawalReason] = useState('')

  // Enrollment confirmation state
  const [showEnrollDialog, setShowEnrollDialog] = useState(false)

  // Amendment state
  const [amendField, setAmendField] = useState('')
  const [amendValue, setAmendValue] = useState('')
  const [amendReason, setAmendReason] = useState('')
  const [amendError, setAmendError] = useState('')
  const [amendSuccess, setAmendSuccess] = useState('')

  const {
    data: application = null,
    isLoading: loading,
    error: queryError,
    refetch: loadApplicationDetails,
  } = useQuery<ApplicationWithDetails | null>({
    queryKey: ['application-status', id],
    queryFn: async () => {
      try {
        const response = await applicationService.getById(id!)

        if (!response.application) {
          throw new Error('Application not found or access denied')
        }

        return response.application as ApplicationWithDetails
      } catch (error) {
        // Re-throw AuthenticationError so the global auth redirect flow handles it
        if (error instanceof AuthenticationError) {
          throw error
        }
        throw new Error('Application not found or access denied')
      }
    },
    enabled: !!id && !!user,
    ...CACHE_CONFIG.applications,
  })

  const error = queryError ? (queryError instanceof Error ? queryError.message : 'Failed to load application') : ''

  // Withdrawal mutation
  const withdrawMutation = useMutation({
    mutationFn: async (reason: string) => {
      await applicationService.withdraw(id!, reason)
    },
    onSuccess: () => {
      setShowWithdrawDialog(false)
      setWithdrawalReason('')
      queryClient.invalidateQueries({ queryKey: ['application-status', id] })
      useToastStore.getState().addToast('success', 'Application withdrawn successfully')
    },
  })

  // Conditions query for conditionally_approved status
  const { data: conditions = [] } = useQuery<ApplicationCondition[]>({
    queryKey: ['application-conditions', id],
    queryFn: async () => {
      const res = await applicationService.getConditions(id!)
      return (res ?? []) as ApplicationCondition[]
    },
    enabled: !!id && application?.status === 'conditionally_approved',
    staleTime: 60_000,
  })

  // Waitlist position query
  const { data: waitlistPosition } = useQuery<{ position: number; total: number }>({
    queryKey: ['waitlist-position', id],
    queryFn: async () => {
      const res = await applicationService.getWaitlistPosition(id!)
      return res ?? { position: 0, total: 0 }
    },
    enabled: !!id && application?.status === 'waitlisted',
    staleTime: 60_000,
  })

  // Confirm enrollment mutation
  const confirmEnrollmentMutation = useMutation({
    mutationFn: async () => {
      await applicationService.confirmEnrollment(id!)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['application-status', id] })
      useToastStore.getState().addToast('success', 'Enrollment confirmed successfully')
    },
  })

  // Amendment mutation
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
    },
    onError: (err: Error) => {
      setAmendError(err.message || 'Failed to submit amendment request.')
    },
  })

  const handleWithdraw = () => {
    if (withdrawalReason.trim().length < 10) return
    withdrawMutation.mutate(withdrawalReason.trim())
  }

  const handleAmendSubmit = (e: React.FormEvent) => {
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
      case 'enrolled':
        return <CheckCircle className="h-5 w-5 text-success" />
      case 'conditionally_approved':
        return <AlertCircle className="h-5 w-5 text-amber-600" />
      case 'rejected':
        return <XCircle className="h-5 w-5 text-error" />
      case 'withdrawn':
      case 'expired':
      case 'enrollment_expired':
        return <XCircle className="h-5 w-5 text-muted-foreground" />
      case 'under_review':
        return <Clock className="h-5 w-5 text-primary" />
      case 'submitted':
        return <AlertCircle className="h-5 w-5 text-warning" />
      case 'waitlisted':
        return <Clock className="h-5 w-5 text-amber-600" />
      case 'interview_scheduled':
        return <Calendar className="h-5 w-5 text-primary" />
      case 'draft':
        return <Clock className="h-5 w-5 text-muted-foreground" />
      default:
        return <Clock className="h-5 w-5 text-secondary" />
    }
  }

  const formatInterviewDateTime = (value?: string | null) => {
    if (!value) return 'To be confirmed'
    const result = formatTimestamp(value)
    return result === 'Not available' ? 'To be confirmed' : result
  }

  const getTimeline = (): ApplicationTimeline[] => {
    if (!application) return []

    const timeline: ApplicationTimeline[] = [
      application.status === 'draft'
        ? {
            status: 'draft',
            date: application.created_at,
            description: 'Application draft started',
            completed: true
          }
        : {
            status: 'submitted',
            date: application.submitted_at || application.created_at,
            description: 'Application submitted successfully',
            completed: true
          }
    ]

    if (application.interview && application.interview.status !== 'cancelled') {
      timeline.push({
        status: 'interview_scheduled',
        date: application.interview.scheduled_at,
        description: `Interview scheduled for ${formatInterviewDateTime(application.interview.scheduled_at)}`,
        completed: application.interview.scheduled_at
          ? new Date(application.interview.scheduled_at) < new Date()
          : false
      })
    }

    if (
      application.status === 'under_review' ||
      application.status === 'approved' ||
      application.status === 'rejected' ||
      application.status === 'waitlisted' ||
      application.status === 'conditionally_approved' ||
      application.status === 'enrolled' ||
      application.status === 'enrollment_expired'
    ) {
      timeline.push({
        status: 'under_review',
        date: application.review_started_at || application.updated_at,
        description: 'Application currently under review by admissions',
        completed: application.status !== 'under_review'
      })
    }

    if (application.status === 'waitlisted') {
      timeline.push({
        status: 'waitlisted',
        date: application.updated_at,
        description: 'Application has been waitlisted — you will be notified if a spot opens',
        completed: true
      })
    }

    if (
      application.status === 'approved' ||
      application.status === 'rejected' ||
      application.status === 'conditionally_approved'
    ) {
      timeline.push({
        status: application.status,
        date: application.decision_date || application.updated_at,
        description:
          application.status === 'approved'
            ? 'Application approved'
            : application.status === 'conditionally_approved'
              ? 'Application conditionally approved'
              : 'Application not successful',
        completed: true
      })
    }

    if (application.status === 'enrolled') {
      timeline.push({
        status: 'approved',
        date: application.decision_date || application.updated_at,
        description: 'Application approved',
        completed: true
      })
      timeline.push({
        status: 'enrolled',
        date: application.updated_at,
        description: 'Enrollment confirmed',
        completed: true
      })
    }

    if (application.status === 'withdrawn') {
      timeline.push({
        status: 'withdrawn',
        date: application.updated_at,
        description: 'Application withdrawn',
        completed: true
      })
    }

    if (application.status === 'expired' || application.status === 'enrollment_expired') {
      timeline.push({
        status: application.status,
        date: application.updated_at,
        description: application.status === 'expired'
          ? 'Application expired'
          : 'Enrollment confirmation window expired',
        completed: true
      })
    }

    return timeline
  }

  if (loading) {
    return (
      <>
      <Seo
        title="Application Status | MIHAS-KATC Admissions"
        description="Track the status and progress of your MIHAS-KATC admissions application."
        path={`/student/application/${id}/status`}
        noindex
      />
      <PageShell title="Application Status" subtitle="Loading...">
          <div className="space-y-6 sm:space-y-8" role="status" aria-label="Loading application status">
            <Skeleton className="h-8 w-40 rounded-full" />
            <SkeletonCard />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
              <div className="lg:col-span-2 space-y-6">
                <SkeletonCard />
                <SkeletonCard />
              </div>
              <div className="space-y-6">
                <SkeletonCard />
                <SkeletonCard />
              </div>
            </div>
            <span className="sr-only">Loading application status</span>
          </div>
      </PageShell>
      </>
    )
  }

  if (error || !application) {
    return (
      <>
      <Seo
        title="Application Status | MIHAS-KATC Admissions"
        description="Track the status and progress of your MIHAS-KATC admissions application."
        path={`/student/application/${id}/status`}
        noindex
      />
      <PageShell title="Application Status">
          <ErrorDisplay
            variant="section"
            title="Application Not Found"
            message={error || 'Application not found or access denied'}
            onRetry={() => loadApplicationDetails()}
            className="max-w-2xl"
          />
      </PageShell>
      </>
    )
  }

  const timeline = getTimeline()
  const interview = application.interview
  const hasActiveInterview = Boolean(interview && interview.status !== 'cancelled')
  const statusLabel = formatStatusLabel(application.status).toUpperCase()
  const paymentReviewNote =
    typeof application.last_payment_audit_notes === 'string' && application.last_payment_audit_notes.trim().length > 0
      ? application.last_payment_audit_notes.trim()
      : null
  const needsPaymentAttention = requiresStudentPaymentAction(application.payment_status)
  const paymentStatusLabel = getPaymentStatusLabel(application.payment_status)
  const normalizedPaymentStatus = normalizePaymentStatus(application.payment_status)
  const paymentStatusDescription =
    normalizedPaymentStatus === 'verified'
      ? 'Your application fee has been verified and recorded successfully.'
      : normalizedPaymentStatus === 'pending_review'
        ? 'Your recent payment is awaiting review by the admissions team.'
        : normalizedPaymentStatus === 'rejected'
          ? 'Your recent payment needs attention before your application can continue.'
          : application.status === 'draft'
            ? 'Payment is completed in the wizard when you are ready to submit this draft.'
            : 'Payment still needs attention before review can continue.'
  const applicationTitle = application.application_number
    ? `Application #${application.application_number}`
    : 'Application status'
  const applicationSubtitlePrefix = application.status === 'draft' ? 'Started on' : 'Submitted on'
  const applicationSubtitleDate = formatDate(application.status === 'draft' ? application.created_at : application.submitted_at)
  const paymentAction =
    needsPaymentAttention
      ? {
          href: application.status === 'draft'
            ? '/student/application-wizard'
            : `/student/payment?applicationId=${encodeURIComponent(application.id)}`,
          label:
            application.status === 'draft'
              ? 'Continue draft in wizard'
              : normalizedPaymentStatus === 'rejected'
                ? 'Retry rejected payment'
                : 'Pay application fee',
        }
      : null

  return (
    <>
      <Seo
        title="Application Status | MIHAS-KATC Admissions"
        description="Track the status and progress of your MIHAS-KATC admissions application."
        path={`/student/application/${id}/status`}
        noindex
      />
    <PageShell
      title={applicationTitle}
      eyebrow="Application Status"
      subtitle={`${truncateValue(application.program, 40) || 'Programme pending'} • ${applicationSubtitlePrefix} ${applicationSubtitleDate}`}
      maxWidth="7xl"
      tone="student"
      metrics={[
        {
          label: 'Decision state',
          value: formatStatusLabel(application.status),
          helper: application.status === 'under_review' ? 'Admissions is actively reviewing this file' : 'Latest recorded application state',
        },
        {
          label: 'Payment',
          value: paymentStatusLabel,
          helper: paymentStatusDescription,
        },
        {
          label: 'Interview',
          value: hasActiveInterview ? 'Scheduled' : 'Not active',
          helper: hasActiveInterview ? formatInterviewDateTime(interview?.scheduled_at) : 'You will be notified if an interview is required',
        },
        {
          label: 'Next move',
          value: paymentAction ? paymentAction.label : application.status === 'approved' ? 'Confirm enrollment' : 'Monitor progress',
          helper: needsPaymentAttention ? 'There is still an action blocking forward movement' : 'No immediate blocker detected',
        },
      ]}
      actions={
        <div className="flex items-center gap-2">
          {getStatusIcon(application.status)}
          <span className="text-sm font-bold">{statusLabel}</span>
        </div>
      }
    >
        <div className="space-y-6 sm:space-y-8">
          <Link
            to="/student/dashboard"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.8fr)]">
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-center gap-2">
                {['Status clarity', 'Document access', 'Payment guidance'].map((item) => (
                  <span key={item} className="rounded-md border border-border bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground">
                    {item}
                  </span>
                ))}
              </div>
              <h2 className="mt-4 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                A single view of where your application stands and what happens next
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                This page is structured to reduce uncertainty. The latest admissions state, payment position, interview details, and supporting documents are all surfaced here in the order students usually need them.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6">
              <p className="text-xs font-semibold uppercase text-primary">Decision snapshot</p>
              <div className="mt-4 grid gap-3">
                <div className="rounded-lg border border-border bg-muted px-4 py-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Status</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{formatStatusLabel(application.status)}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted px-4 py-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Priority</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {needsPaymentAttention ? 'Resolve payment' : hasActiveInterview ? 'Prepare for interview' : application.status === 'approved' ? 'Confirm enrollment' : 'Watch review progress'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {hasActiveInterview && interview ? (
            <SectionCard
              title="Admissions interview"
              description="Your interview is scheduled—review the key details below."
              icon={<Calendar className="h-5 w-5" />}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-foreground">{formatInterviewDateTime(interview.scheduled_at)}</p>
                  <p className="text-sm text-foreground">{interview.mode?.replace('_', ' ') || 'Interview'}</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-info-strong">Location / Link</p>
                    <p className="text-sm text-foreground">
                      {interview.location || 'You will receive the meeting details shortly.'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-info-strong">Important notes</p>
                    <p className="text-sm text-foreground">
                      {interview.notes || 'Please arrive 10 minutes early and bring your identification.'}
                    </p>
                  </div>
                </div>
              </div>
            </SectionCard>
          ) : null}

          {!hasActiveInterview && (
            <SectionCard
              title="Interview status"
              description="Our admissions team will contact you if a new interview is required."
              icon={<Calendar className="h-5 w-5" />}
            >
              <p className="text-sm text-foreground">
                If you have questions, please reach out to admissions support.
              </p>
            </SectionCard>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
            <div className="lg:col-span-2 space-y-6 sm:space-y-8">
              <SectionCard
                title="Application progress"
                description="Track how far along your application is in the review process."
                icon={<CheckCircle className="h-5 w-5" />}
              >
                <div className="space-y-1">
                  {timeline.map((step, index) => {
                    const isActive = !step.completed && index === timeline.findIndex(s => !s.completed)
                    const isFuture = !step.completed && !isActive
                    return (
                    <div
                      key={`${step.status}-${index}`}
                      className={`flex items-start gap-4 rounded-lg border-l-2 px-3 py-3 ${
                        isActive
                          ? 'border-l-primary bg-primary/5'
                          : step.completed
                            ? 'border-l-success/40'
                            : 'border-l-border'
                      } ${animateClasses.slideUp}`}
                      style={staggerChild(index, 50)}
                    >
                      <div
                        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${
                          step.completed
                            ? 'bg-success/10 text-success'
                            : isActive
                              ? 'bg-primary/10 text-primary'
                              : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {step.completed ? <CheckCircle className="h-5 w-5" /> : getStatusIcon(step.status)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold ${isFuture ? 'text-muted-foreground' : 'text-foreground'}`}>
                          {step.description}
                        </p>
                        {step.date && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(step.date)}</p>
                        )}
                      </div>
                    </div>
                    )
                  })}
                </div>
              </SectionCard>

              <SectionCard
                title="Application details"
                description="Review the information you submitted with this application."
                icon={<FileText className="h-5 w-5" />}
              >
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="rounded-lg border border-border bg-muted px-5 py-4">
                    <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2"><User className="w-5 h-5" aria-hidden="true" /> Personal information</h3>
                    <dl className="space-y-2 text-sm">
                      <DetailRow label="Full name" value={application.full_name || 'Not provided'} />
                      <DetailRow label="Date of birth" value={application.date_of_birth || 'Not provided'} />
                      <DetailRow label="Sex" value={application.sex || 'Not provided'} />
                      <DetailRow label="Phone" value={application.phone || 'Not provided'} />
                      <DetailRow label="Email" value={application.email || 'Not provided'} />
                    </dl>
                  </div>
                  <div className="rounded-lg border border-border bg-muted px-5 py-4">
                    <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2"><Phone className="w-5 h-5" aria-hidden="true" /> Contact information</h3>
                    <dl className="space-y-2 text-sm">
                      <DetailRow label="Residence town" value={application.residence_town || 'Not provided'} />
                      <DetailRow label="NRC" value={application.nrc_number || 'Not provided'} />
                      <DetailRow label="Next of kin" value={application.next_of_kin_name || 'Not provided'} />
                      <DetailRow label="Next of kin phone" value={application.next_of_kin_phone || 'Not provided'} />
                    </dl>
                  </div>
                  <div className="rounded-lg border border-border bg-muted px-5 py-4 lg:col-span-2">
                    <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2"><CreditCard className="w-5 h-5" aria-hidden="true" /> Payment information</h3>
                    <dl className="grid gap-2 text-sm sm:grid-cols-2">
                      <DetailRow label="Payment status" value={paymentStatusLabel} />
                      <DetailRow
                        label="Application fee"
                        value={application.application_fee != null ? `K${application.application_fee}` : 'Resolved at payment step'}
                      />
                      <DetailRow label="Payment method" value="Lenco Payment Gateway" />
                      {application.payment_verified_at && (
                        <DetailRow label="Verified" value={formatDate(application.payment_verified_at)} />
                      )}
                    </dl>
                    <p className="mt-3 text-sm text-muted-foreground">{paymentStatusDescription}</p>
                  </div>
                </div>
              </SectionCard>

              <SectionCard
                title="Supporting documents"
                description="Access the files you uploaded with this application."
                icon={<Download className="h-5 w-5" />}
              >
                <div className="space-y-4">
                  {application.result_slip_url && (
                    <div
                      className={`flex items-center justify-between rounded-lg border border-border bg-muted px-4 py-3 ${animateClasses.fadeIn}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-primary/10 p-2">
                          <FileText className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">Result slip</p>
                          <p className="text-xs font-medium text-info-strong">✓ Uploaded</p>
                        </div>
                      </div>
                      {String(application.result_slip_url).includes('supabase') ? (
                        <span className="text-xs text-muted-foreground">File migrated — re-upload if needed</span>
                      ) : (
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={application.result_slip_url as string}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="View uploaded result slip"
                        >
                          <Eye className="mr-1 h-4 w-4" />
                          View
                        </a>
                      </Button>
                      )}
                    </div>
                  )}

                  {application.extra_kyc_url && (
                    <div
                      className={`flex items-center justify-between rounded-lg border border-border bg-muted px-4 py-3 ${animateClasses.fadeIn}`}
                      style={staggerChild(1, 100)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-accent/10 p-2">
                          <FileText className="h-5 w-5 text-accent" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">Identity document (NRC or Passport)</p>
                          <p className="text-xs font-medium text-warning-strong">✓ Uploaded</p>
                        </div>
                      </div>
                      {String(application.extra_kyc_url).includes('supabase') ? (
                        <span className="text-xs text-muted-foreground">File migrated — re-upload if needed</span>
                      ) : (
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={application.extra_kyc_url as string}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="View uploaded identity document"
                        >
                          <Eye className="mr-1 h-4 w-4" />
                          View
                        </a>
                      </Button>
                      )}
                    </div>
                  )}

                  {!application.result_slip_url && !application.extra_kyc_url && (
                    <EmptyState
                      icon={<FileText className="h-12 w-12" />}
                      heading="No supporting documents uploaded"
                      description="Uploaded documents will appear here once they are available for review."
                    />
                  )}
                </div>
              </SectionCard>

              {/* Conditions timeline for conditionally_approved (Req 5.9) */}
              {application.status === 'conditionally_approved' && conditions.length > 0 && (
                <SectionCard
                  title="Admission conditions"
                  description="You must fulfill these conditions to complete your admission."
                  icon={<AlertTriangle className="h-5 w-5" />}
                >
                  <div className="space-y-4">
                    {conditions.map((condition, index) => (
                      <div
                        key={condition.id}
                        className={`flex items-start gap-3 rounded-lg border p-3 ${
                          condition.status === 'met' || condition.status === 'waived'
                            ? 'border-success/30 bg-success/5'
                            : condition.status === 'expired'
                              ? 'border-destructive/30 bg-destructive/5'
                              : 'border-warning/30 bg-warning/5'
                        } ${animateClasses.slideUp}`}
                        style={staggerChild(index, 50)}
                      >
                        <div className="flex-shrink-0 mt-0.5">
                          {condition.status === 'met' || condition.status === 'waived' ? (
                            <CheckCircle className="h-5 w-5 text-success" />
                          ) : condition.status === 'expired' ? (
                            <XCircle className="h-5 w-5 text-destructive" />
                          ) : (
                            <Clock className="h-5 w-5 text-warning" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{condition.description}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Deadline: {formatDate(condition.deadline)}
                            {condition.met_at && ` • Fulfilled: ${formatDate(condition.met_at)}`}
                          </p>
                          <span className={`inline-block mt-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                            condition.status === 'met' || condition.status === 'waived'
                              ? 'bg-success/10 text-success'
                              : condition.status === 'expired'
                                ? 'bg-destructive/10 text-destructive'
                                : 'bg-warning/10 text-warning'
                          }`}>
                            {condition.status.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              )}

              {/* Amendment request form (Req 14.10) */}
              {AMENDABLE_STATUSES.has(application.status) && (
                <SectionCard
                  title="Request an amendment"
                  description="Request a change to your personal details. Amendments require admin approval."
                  icon={<Edit3 className="h-5 w-5" />}
                >
                  <form onSubmit={handleAmendSubmit} className="space-y-4">
                    <div>
                      <label htmlFor="amend-field" className="block text-sm font-medium text-foreground mb-1">Field to amend</label>
                      <select
                        id="amend-field"
                        value={amendField}
                        onChange={(e) => setAmendField(e.target.value)}
                        className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="">Select a field</option>
                        {AMENDABLE_FIELDS.map(f => (
                          <option key={f.key} value={f.key}>{f.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="amend-value" className="block text-sm font-medium text-foreground mb-1">New value</label>
                      <input
                        id="amend-value"
                        type={amendField === 'email' ? 'email' : 'text'}
                        inputMode={PHONE_AMENDMENT_FIELDS.has(amendField) ? 'tel' : amendField === 'email' ? 'email' : 'text'}
                        value={amendValue}
                        onChange={(e) => {
                          setAmendValue(e.target.value)
                          if (amendError) setAmendError('')
                        }}
                        className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        placeholder="Enter the corrected value"
                      />
                    </div>
                    <div>
                      <label htmlFor="amend-reason" className="block text-sm font-medium text-foreground mb-1">Reason for change</label>
                      <textarea
                        id="amend-reason"
                        value={amendReason}
                        onChange={(e) => setAmendReason(e.target.value)}
                        rows={2}
                        className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        placeholder="Explain why this change is needed"
                      />
                    </div>
                    {amendError && (
                      <p className="text-sm text-destructive" role="alert" aria-live="assertive">{amendError}</p>
                    )}
                    {amendSuccess && (
                      <p className="text-sm text-success" role="status" aria-live="polite">{amendSuccess}</p>
                    )}
                    <Button
                      type="submit"
                      variant="outline"
                      size="sm"
                      loading={amendMutation.isPending}
                      disabled={!amendField || !amendValue.trim() || !amendReason.trim()}
                    >
                      <Send className="mr-2 h-4 w-4" />
                      Submit amendment request
                    </Button>
                  </form>
                </SectionCard>
              )}
            </div>

            <div className="space-y-6">
              <SectionCard
                title="Documents and records"
                description="Download your application slip and other available documents."
                icon={<Download className="h-5 w-5" />}
              >
                <DocumentButtons
                  applicationId={application.id}
                  applicationNumber={application.application_number}
                  status={application.status}
                  paymentStatus={application.payment_status ?? null}
                />
              </SectionCard>

              {paymentReviewNote && (
                <SectionCard
                  title="Latest payment review note"
                  description="Use this guidance if you need to correct or complete payment."
                  icon={<CreditCard className="h-5 w-5" />}
                >
                  <p className="text-sm text-foreground">{paymentReviewNote}</p>
                </SectionCard>
              )}

              <SectionCard
                title="Quick information"
                description="Essential application details at a glance."
                icon={<User className="h-5 w-5" />}
              >
                <dl className="space-y-3 text-sm">
                  <DetailRow label="Application number" value={application.application_number ? `#${application.application_number}` : 'Not assigned'} />
                  <DetailRow label="Program" value={application.program || 'Not provided'} />
                  <DetailRow label="Intake" value={application.intake || 'Not provided'} />
                  <DetailRow label={application.status === 'draft' ? 'Started' : 'Submitted'} value={formatDate(application.status === 'draft' ? application.created_at : application.submitted_at)} />
                  <DetailRow label="Last updated" value={formatDate(application.updated_at)} />
                </dl>
              </SectionCard>

              <SectionCard title="Next actions" description="Stay in control of your application." icon={<FileText className="h-5 w-5" />}>
                <div className="flex flex-col gap-3">
                  {paymentAction && (
                    <Button asChild variant="outline" className="w-full">
                      <Link to={paymentAction.href}>
                        {paymentAction.label}
                      </Link>
                    </Button>
                  )}
                  <Button asChild variant="outline" className="w-full">
                    <Link to={`/student/application/${application.id}`}>
                      View full application details
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full">
                    <Link to="/student/application-wizard">
                      Start new application
                    </Link>
                  </Button>
                  {/* Withdrawal button for eligible statuses */}
                  {canWithdraw(application.status) && (
                    <Button
                      variant="ghost"
                      className="w-full text-destructive hover:bg-destructive/5"
                      onClick={() => setShowWithdrawDialog(true)}
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Withdraw application
                    </Button>
                  )}
                  <Button asChild variant="ghost" className="w-full">
                    <Link to="/student/dashboard">
                      Back to dashboard
                    </Link>
                  </Button>
                </div>
              </SectionCard>

              {application.status === 'under_review' && (
                <SectionCard
                  title="Application under review"
                  description="Our admissions team is reviewing your information. We'll notify you by email when a decision is ready."
                  icon={<Clock className="h-5 w-5" />}
                />
              )}

              {application.status === 'approved' && (
                <div className="space-y-3">
                  <SectionCard
                    title="Congratulations!"
                    description="Your application has been approved. Confirm your enrollment to secure your place."
                    icon={<CheckCircle className="h-5 w-5 text-success" />}
                  />
                  <Button
                    variant="primary"
                    onClick={() => setShowEnrollDialog(true)}
                    disabled={confirmEnrollmentMutation.isPending}
                    className="w-full sm:w-auto"
                  >
                    {confirmEnrollmentMutation.isPending ? 'Confirming…' : 'Confirm Enrollment'}
                  </Button>
                  {confirmEnrollmentMutation.isError && (
                    <p className="text-sm text-error">{confirmEnrollmentMutation.error instanceof Error ? confirmEnrollmentMutation.error.message : 'Failed to confirm enrollment'}</p>
                  )}
                </div>
              )}

              {application.status === 'waitlisted' && (
                <SectionCard
                  title="You're on the waitlist"
                  description="Your application is on the waitlist. We'll notify you by email if a spot becomes available."
                  icon={<Clock className="h-5 w-5 text-amber-600" />}
                >
                  {waitlistPosition && waitlistPosition.position > 0 && (
                    <p className="text-sm font-medium text-amber-800">
                      Position {waitlistPosition.position} of {waitlistPosition.total}
                    </p>
                  )}
                </SectionCard>
              )}

              {application.status === 'conditionally_approved' && (
                <SectionCard
                  title="Conditionally approved"
                  description="Your application has been conditionally approved. Please review and fulfill the pending conditions listed on your application."
                  icon={<AlertCircle className="h-5 w-5 text-warning" />}
                />
              )}

              {application.status === 'withdrawn' && (
                <SectionCard
                  title="Application withdrawn"
                  description="This application has been withdrawn. You may submit a new application for future intakes."
                  icon={<XCircle className="h-5 w-5 text-muted-foreground" />}
                />
              )}

              {application.status === 'enrolled' && (
                <SectionCard
                  title="Enrollment confirmed"
                  description="Your enrollment has been confirmed. Welcome to MIHAS!"
                  icon={<CheckCircle className="h-5 w-5 text-success" />}
                />
              )}

              {application.status === 'rejected' && (
                <SectionCard
                  title="Application update"
                  description="Unfortunately this application was not successful. You're welcome to apply again for future intakes."
                  icon={<XCircle className="h-5 w-5 text-error" />}
                />
              )}
            </div>
          </div>
        </div>
    </PageShell>

    {/* Withdrawal confirmation dialog */}
    <AlertDialog open={showWithdrawDialog} onOpenChange={(open) => { if (!open) { setShowWithdrawDialog(false); setWithdrawalReason('') } }}>
      <AlertDialogContent>
        <AlertDialogHeader className="p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-destructive/10 p-2">
              <LogOut className="h-5 w-5 text-destructive" />
            </div>
            <AlertDialogTitle>Withdraw application</AlertDialogTitle>
          </div>
        </AlertDialogHeader>
        <div className="px-6">
          <AlertDialogDescription>
            This action cannot be undone. Your application will be permanently withdrawn.
          </AlertDialogDescription>
          <div className="mt-4">
            <label htmlFor="withdrawal-reason" className="block text-sm font-medium text-foreground mb-1">
              Reason for withdrawal (min 10 characters)
            </label>
            <textarea
              id="withdrawal-reason"
              value={withdrawalReason}
              onChange={(e) => setWithdrawalReason(e.target.value)}
              rows={3}
              minLength={10}
              maxLength={500}
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Please explain why you are withdrawing this application..."
            />
            <p className="text-xs text-muted-foreground mt-1">{withdrawalReason.length}/10 characters minimum</p>
          </div>
          {withdrawMutation.isError && (
            <p className="text-sm text-destructive mt-3">
              {withdrawMutation.error instanceof Error ? withdrawMutation.error.message : 'Failed to withdraw application.'}
            </p>
          )}
        </div>
        <AlertDialogFooter className="p-6">
          <AlertDialogCancel asChild>
            <Button variant="outline" size="sm">Cancel</Button>
          </AlertDialogCancel>
          <Button
            variant="primary"
            size="sm"
            className="bg-destructive hover:bg-destructive/90 text-white"
            onClick={handleWithdraw}
            loading={withdrawMutation.isPending}
            disabled={withdrawalReason.trim().length < 10}
          >
            Confirm withdrawal
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Enrollment confirmation dialog */}
    <AlertDialog open={showEnrollDialog} onOpenChange={(open) => { if (!open) setShowEnrollDialog(false) }}>
      <AlertDialogContent>
        <AlertDialogHeader className="p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-success/10 p-2">
              <CheckCircle className="h-5 w-5 text-success" />
            </div>
            <AlertDialogTitle>Confirm enrollment</AlertDialogTitle>
          </div>
        </AlertDialogHeader>
        <div className="px-6">
          <AlertDialogDescription>
            Are you sure you want to confirm your enrollment? This action cannot be undone.
          </AlertDialogDescription>
          {confirmEnrollmentMutation.isError && (
            <p className="text-sm text-destructive mt-3">
              {confirmEnrollmentMutation.error instanceof Error ? confirmEnrollmentMutation.error.message : 'Failed to confirm enrollment.'}
            </p>
          )}
        </div>
        <AlertDialogFooter className="p-6">
          <AlertDialogCancel asChild>
            <Button variant="outline" size="sm">Cancel</Button>
          </AlertDialogCancel>
          <Button
            variant="primary"
            size="sm"
            onClick={() => confirmEnrollmentMutation.mutate(undefined, { onSuccess: () => setShowEnrollDialog(false) })}
            loading={confirmEnrollmentMutation.isPending}
          >
            Confirm
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
