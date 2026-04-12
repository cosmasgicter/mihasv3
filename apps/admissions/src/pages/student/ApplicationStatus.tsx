import React from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
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
  CreditCard
} from 'lucide-react'
import { SectionCard } from '@/components/ui/SectionCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { PageShell } from '@/components/ui/PageShell'
import { CACHE_CONFIG } from '@/hooks/queries/useQueryConfig'

interface ApplicationTimeline {
  status: string
  date: string | undefined
  description: string
  completed: boolean
}

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
      <dt className="text-foreground">{label}</dt>
      <dd className="font-semibold text-foreground break-words">{value}</dd>
    </div>
  )
}

export default function ApplicationStatus() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()

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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-5 w-5 text-success" />
      case 'rejected':
        return <XCircle className="h-5 w-5 text-error" />
      case 'under_review':
        return <Clock className="h-5 w-5 text-primary" />
      case 'submitted':
        return <AlertCircle className="h-5 w-5 text-warning" />
      case 'interview_scheduled':
        return <Calendar className="h-5 w-5 text-primary" />
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

    if (application.status === 'under_review' || application.status === 'approved' || application.status === 'rejected') {
      timeline.push({
        status: 'under_review',
        date: application.review_started_at || application.updated_at,
        description: 'Application currently under review by admissions',
        completed: application.status !== 'under_review'
      })
    }

    if (application.status === 'approved' || application.status === 'rejected') {
      timeline.push({
        status: application.status,
        date: application.decision_date || application.updated_at,
        description: application.status === 'approved' ? 'Application approved' : 'Application not successful',
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
          href: application.status === 'draft' ? '/student/application-wizard' : '/student/payment',
          label:
            application.status === 'draft'
              ? 'Continue draft in wizard'
              : normalizedPaymentStatus === 'rejected'
                ? 'Review rejected payment'
                : 'Open payments',
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
      subtitle={`${truncateValue(application.program, 40) || 'Programme pending'} • ${applicationSubtitlePrefix} ${applicationSubtitleDate}`}
      maxWidth="7xl"
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
            className="inline-flex items-center rounded-full border border-border/70 bg-card px-3 py-2 text-sm font-medium text-primary shadow-sm transition-colors hover:bg-primary/5"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to dashboard
          </Link>

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
                <div className="space-y-6">
                  {timeline.map((step, index) => (
                    <div
                      key={`${step.status}-${index}`}
                      className={`flex items-start gap-4 ${animateClasses.slideUp}`}
                      style={staggerChild(index, 50)}
                    >
                      <div
                        className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border shadow-sm ${
                          step.completed
                            ? 'border-success/20 bg-success/10 text-success'
                            : 'border-border bg-accent text-foreground'
                        }`}
                      >
                        {step.completed ? <CheckCircle className="h-5 w-5" /> : getStatusIcon(step.status)}
                      </div>
                      <div className="flex-1">
                        <p className={`font-semibold ${step.completed ? 'text-foreground' : 'text-foreground'}`}>
                          {step.description}
                        </p>
                        {step.date && (
                          <p className="text-sm text-foreground">{formatDate(step.date)}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>

              <SectionCard
                title="Application details"
                description="Review the information you submitted with this application."
                icon={<FileText className="h-5 w-5" />}
              >
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="rounded-xl border border-primary/30 bg-primary/5 px-5 py-4">
                    <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2"><User className="w-5 h-5" aria-hidden="true" /> Personal information</h3>
                    <dl className="space-y-2 text-sm">
                      <DetailRow label="Full name" value={application.full_name || 'Not provided'} />
                      <DetailRow label="Date of birth" value={application.date_of_birth || 'Not provided'} />
                      <DetailRow label="Sex" value={application.sex || 'Not provided'} />
                      <DetailRow label="Phone" value={application.phone || 'Not provided'} />
                      <DetailRow label="Email" value={application.email || 'Not provided'} />
                    </dl>
                  </div>
                  <div className="rounded-xl border border-accent/30 bg-accent/10 px-5 py-4">
                    <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2"><Phone className="w-5 h-5" aria-hidden="true" /> Contact information</h3>
                    <dl className="space-y-2 text-sm">
                      <DetailRow label="Residence town" value={application.residence_town || 'Not provided'} />
                      <DetailRow label="NRC" value={application.nrc_number || 'Not provided'} />
                      <DetailRow label="Next of kin" value={application.next_of_kin_name || 'Not provided'} />
                      <DetailRow label="Next of kin phone" value={application.next_of_kin_phone || 'Not provided'} />
                    </dl>
                  </div>
                  <div className="rounded-xl border border-input/30 bg-secondary/5 px-5 py-4 lg:col-span-2">
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
                      className={`flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 ${animateClasses.fadeIn}`}
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
                    </div>
                  )}

                  {application.extra_kyc_url && (
                    <div
                      className={`flex items-center justify-between rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 ${animateClasses.fadeIn}`}
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
                <SectionCard
                  title="Congratulations!"
                  description="Your application has been approved. Look out for enrollment instructions via email."
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
    </>
    
  )
}
