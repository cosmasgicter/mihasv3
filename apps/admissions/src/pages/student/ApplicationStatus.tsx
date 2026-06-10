import React, { useState } from 'react'
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
  Phone,
  CreditCard,
  AlertTriangle,
  Edit3,
} from 'lucide-react'
import { SectionCard } from '@/components/ui/SectionCard'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { PageShell } from '@/components/ui/PageShell'
import { CACHE_CONFIG } from '@/hooks/queries/useQueryConfig'
import { useToastStore } from '@/hooks/useToast'
import { isValidEmail, isValidPhoneNumber } from '@/lib/utils'
import { canWithdraw } from '@/lib/withdrawalEligibility'
import { StatusTimeline } from '@/components/student/applicationStatus/StatusTimeline'
import { NextActionCards } from '@/components/student/applicationStatus/NextActionCards'
import { DocumentChecklist } from '@/components/student/applicationStatus/DocumentChecklist'
import { PaymentStatusBlock } from '@/components/student/applicationStatus/PaymentStatusBlock'
import { ConditionsTimeline } from '@/components/student/applicationStatus/ConditionsTimeline'
import { AmendmentForm } from '@/components/student/applicationStatus/AmendmentForm'
import { WithdrawDialog, EnrollDialog } from '@/components/student/applicationStatus/WithdrawEnrollDialogs'

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

const AMENDABLE_STATUSES = new Set(['submitted', 'under_review', 'waitlisted'])
const PHONE_AMENDMENT_FIELDS = new Set(['phone', 'next_of_kin_phone'])

function formatStatusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

function truncateValue(value: string | null | undefined, maxLength: number) {
  if (!value) {
    return null
  }
  return value.length > maxLength ? `${value.slice(0, maxLength)}\u2026` : value
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[minmax(0,9rem)_1fr] sm:items-start">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground break-words">{value}</dd>
    </div>
  )
}

function getStatusIcon(status: string) {
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

export default function ApplicationStatus() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false)
  const [withdrawalReason, setWithdrawalReason] = useState('')
  const [showEnrollDialog, setShowEnrollDialog] = useState(false)
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

  const { data: conditions = [] } = useQuery<ApplicationCondition[]>({
    queryKey: ['application-conditions', id],
    queryFn: async () => {
      const res = await applicationService.getConditions(id!)
      return (res ?? []) as ApplicationCondition[]
    },
    enabled: !!id && application?.status === 'conditionally_approved',
    staleTime: 60_000,
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
      queryClient.invalidateQueries({ queryKey: ['application-status', id] })
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

  const formatInterviewDateTime = (value?: string | null) => {
    if (!value) return 'To be confirmed'
    const result = formatTimestamp(value)
    return result === 'Not available' ? 'To be confirmed' : result
  }

  const getTimeline = (): ApplicationTimeline[] => {
    if (!application) return []

    const timeline: ApplicationTimeline[] = [
      application.status === 'draft'
        ? { status: 'draft', date: application.created_at, description: 'Application draft started', completed: true }
        : { status: 'submitted', date: application.submitted_at || application.created_at, description: 'Application submitted successfully', completed: true }
    ]

    if (application.interview && application.interview.status !== 'cancelled') {
      timeline.push({
        status: 'interview_scheduled',
        date: application.interview.scheduled_at,
        description: `Interview scheduled for ${formatInterviewDateTime(application.interview.scheduled_at)}`,
        completed: application.interview.scheduled_at ? new Date(application.interview.scheduled_at) < new Date() : false
      })
    }

    if (['under_review', 'approved', 'rejected', 'waitlisted', 'conditionally_approved', 'enrolled', 'enrollment_expired'].includes(application.status)) {
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
        description: 'Application has been waitlisted \u2014 you will be notified if a spot opens',
        completed: true
      })
    }

    if (['approved', 'rejected', 'conditionally_approved'].includes(application.status)) {
      timeline.push({
        status: application.status,
        date: application.decision_date || application.updated_at,
        description: application.status === 'approved'
          ? 'Application approved'
          : application.status === 'conditionally_approved'
            ? 'Application conditionally approved'
            : 'Application not successful',
        completed: true
      })
    }

    if (application.status === 'enrolled') {
      timeline.push({ status: 'approved', date: application.decision_date || application.updated_at, description: 'Application approved', completed: true })
      timeline.push({ status: 'enrolled', date: application.updated_at, description: 'Enrollment confirmed', completed: true })
    }

    if (application.status === 'withdrawn') {
      timeline.push({ status: 'withdrawn', date: application.updated_at, description: 'Application withdrawn', completed: true })
    }

    if (application.status === 'expired' || application.status === 'enrollment_expired') {
      timeline.push({
        status: application.status,
        date: application.updated_at,
        description: application.status === 'expired' ? 'Application expired' : 'Enrollment confirmation window expired',
        completed: true
      })
    }

    return timeline
  }

  if (loading) {
    return (
      <>
      <Seo title="Application Status | Beanola Admissions" description="Track the status and progress of your Beanola admissions application." path={`/student/application/${id}/status`} noindex />
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
      <Seo title="Application Status | Beanola Admissions" description="Track the status and progress of your Beanola admissions application." path={`/student/application/${id}/status`} noindex />
      <PageShell title="Application Status">
        <ErrorDisplay variant="section" title="Application Not Found" message={error || 'Application not found or access denied'} onRetry={() => loadApplicationDetails()} className="max-w-2xl" />
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
          label: application.status === 'draft'
            ? 'Continue draft in wizard'
            : normalizedPaymentStatus === 'rejected'
              ? 'Retry rejected payment'
              : 'Pay application fee',
        }
      : null

  return (
    <>
      <Seo title="Application Status | Beanola Admissions" description="Track the status and progress of your Beanola admissions application." path={`/student/application/${id}/status`} noindex />
    <PageShell
      title={applicationTitle}
      eyebrow="Application Status"
      subtitle={`${truncateValue(application.program, 40) || 'Programme pending'} \u2022 ${applicationSubtitlePrefix} ${applicationSubtitleDate}`}
      maxWidth="7xl"
      tone="student"
      metrics={[
        { label: 'Decision state', value: formatStatusLabel(application.status), helper: application.status === 'under_review' ? 'Admissions is actively reviewing this file' : 'Latest recorded application state' },
        { label: 'Payment', value: paymentStatusLabel, helper: paymentStatusDescription },
        { label: 'Interview', value: hasActiveInterview ? 'Scheduled' : 'Not active', helper: hasActiveInterview ? formatInterviewDateTime(interview?.scheduled_at) : 'You will be notified if an interview is required' },
        { label: 'Next move', value: paymentAction ? paymentAction.label : application.status === 'approved' ? 'Confirm enrollment' : 'Monitor progress', helper: needsPaymentAttention ? 'There is still an action blocking forward movement' : 'No immediate blocker detected' },
      ]}
      actions={<div className="flex items-center gap-2">{getStatusIcon(application.status)}<span className="text-sm font-bold">{statusLabel}</span></div>}
    >
      <div className="space-y-6 sm:space-y-8">
        <Link to="/student/dashboard" className="inline-flex min-h-touch items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted">
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.8fr)]">
          <div className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              {['Status clarity', 'Document access', 'Payment guidance'].map((item) => (
                <span key={item} className="rounded-md border border-border bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground">{item}</span>
              ))}
            </div>
            <h2 className="mt-4 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">A single view of where your application stands and what happens next</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">This page is structured to reduce uncertainty. The latest admissions state, payment position, interview details, and supporting documents are all surfaced here in the order students usually need them.</p>
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
          <SectionCard title="Admissions interview" description="Your interview is scheduled\u2014review the key details below." icon={<Calendar className="h-5 w-5" />}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground">{formatInterviewDateTime(interview.scheduled_at)}</p>
                <p className="text-sm text-foreground">{interview.mode?.replace('_', ' ') || 'Interview'}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-info-strong">Location / Link</p>
                  <p className="text-sm text-foreground">{interview.location || 'You will receive the meeting details shortly.'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-info-strong">Important notes</p>
                  <p className="text-sm text-foreground">{interview.notes || 'Please arrive 10 minutes early and bring your identification.'}</p>
                </div>
              </div>
            </div>
          </SectionCard>
        ) : null}

        {!hasActiveInterview && (
          <SectionCard title="Interview status" description="Our admissions team will contact you if a new interview is required." icon={<Calendar className="h-5 w-5" />}>
            <p className="text-sm text-foreground">If you have questions, please reach out to admissions support.</p>
          </SectionCard>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
          <div className="lg:col-span-2 space-y-6 sm:space-y-8">
            <SectionCard title="Application progress" description="Track how far along your application is in the review process." icon={<CheckCircle className="h-5 w-5" />}>
              <StatusTimeline timeline={timeline} />
            </SectionCard>

            <SectionCard title="Application details" description="Review the information you submitted with this application." icon={<FileText className="h-5 w-5" />}>
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
                <PaymentStatusBlock
                  paymentStatusLabel={paymentStatusLabel}
                  applicationFee={application.application_fee}
                  paymentVerifiedAt={application.payment_verified_at}
                  paymentStatusDescription={paymentStatusDescription}
                />
              </div>
            </SectionCard>

            <SectionCard title="Supporting documents" description="Access the files you uploaded with this application." icon={<Download className="h-5 w-5" />}>
              <DocumentChecklist resultSlipUrl={application.result_slip_url} extraKycUrl={application.extra_kyc_url} />
            </SectionCard>

            {application.status === 'conditionally_approved' && conditions.length > 0 && (
              <SectionCard title="Admission conditions" description="You must fulfill these conditions to complete your admission." icon={<AlertTriangle className="h-5 w-5" />}>
                <ConditionsTimeline conditions={conditions} />
              </SectionCard>
            )}

            {AMENDABLE_STATUSES.has(application.status) && (
              <SectionCard title="Request an amendment" description="Request a change to your personal details. Amendments require admin approval." icon={<Edit3 className="h-5 w-5" />}>
                <AmendmentForm
                  amendField={amendField}
                  amendValue={amendValue}
                  amendReason={amendReason}
                  amendError={amendError}
                  amendSuccess={amendSuccess}
                  isPending={amendMutation.isPending}
                  onFieldChange={setAmendField}
                  onValueChange={(v) => { setAmendValue(v); if (amendError) setAmendError('') }}
                  onReasonChange={setAmendReason}
                  onSubmit={handleAmendSubmit}
                />
              </SectionCard>
            )}
          </div>

          <div className="space-y-6">
            <SectionCard title="Documents and records" description="Download your application slip and other available documents." icon={<Download className="h-5 w-5" />}>
              <DocumentButtons applicationId={application.id} applicationNumber={application.application_number} status={application.status} paymentStatus={application.payment_status ?? null} />
            </SectionCard>

            {paymentReviewNote && (
              <SectionCard title="Latest payment review note" description="Use this guidance if you need to correct or complete payment." icon={<CreditCard className="h-5 w-5" />}>
                <p className="text-sm text-foreground">{paymentReviewNote}</p>
              </SectionCard>
            )}

            <SectionCard title="Quick information" description="Essential application details at a glance." icon={<User className="h-5 w-5" />}>
              <dl className="space-y-3 text-sm">
                <DetailRow label="Application number" value={application.application_number ? `#${application.application_number}` : 'Not assigned'} />
                <DetailRow label="Program" value={application.program || 'Not provided'} />
                <DetailRow label="Intake" value={application.intake || 'Not provided'} />
                <DetailRow label={application.status === 'draft' ? 'Started' : 'Submitted'} value={formatDate(application.status === 'draft' ? application.created_at : application.submitted_at)} />
                <DetailRow label="Last updated" value={formatDate(application.updated_at)} />
              </dl>
            </SectionCard>

            <NextActionCards
              applicationId={application.id}
              applicationStatus={application.status}
              paymentAction={paymentAction}
              onWithdrawClick={() => setShowWithdrawDialog(true)}
              waitlistPosition={waitlistPosition}
              showEnrollButton={application.status === 'approved'}
              onEnrollClick={() => setShowEnrollDialog(true)}
              enrollPending={confirmEnrollmentMutation.isPending}
              enrollError={confirmEnrollmentMutation.isError ? (confirmEnrollmentMutation.error instanceof Error ? confirmEnrollmentMutation.error.message : 'Failed to confirm enrollment') : null}
            />
          </div>
        </div>
      </div>
    </PageShell>

    <WithdrawDialog
      open={showWithdrawDialog}
      onOpenChange={(open) => { if (!open) { setShowWithdrawDialog(false); setWithdrawalReason('') } }}
      reason={withdrawalReason}
      onReasonChange={setWithdrawalReason}
      onConfirm={handleWithdraw}
      isPending={withdrawMutation.isPending}
      error={withdrawMutation.isError ? (withdrawMutation.error instanceof Error ? withdrawMutation.error.message : 'Failed to withdraw application.') : null}
    />
    <EnrollDialog
      open={showEnrollDialog}
      onOpenChange={(open) => { if (!open) setShowEnrollDialog(false) }}
      onConfirm={() => confirmEnrollmentMutation.mutate(undefined, { onSuccess: () => setShowEnrollDialog(false) })}
      isPending={confirmEnrollmentMutation.isPending}
      error={confirmEnrollmentMutation.isError ? (confirmEnrollmentMutation.error instanceof Error ? confirmEnrollmentMutation.error.message : 'Failed to confirm enrollment.') : null}
    />
    </>
  )
}
