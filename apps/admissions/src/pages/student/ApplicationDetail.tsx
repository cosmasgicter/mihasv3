import React from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Seo } from '@/components/seo/Seo'
import { staggerChild, animateClasses } from '@/lib/animations'
import { DocumentButtons } from '@/components/student/DocumentButtons'
import { InterviewDetails } from '@/components/student/InterviewDetails'
import { Button } from '@/components/ui/Button'
import { formatDate, getStatusColor } from '@/lib/utils'
import { applicationService } from '@/services/applications'
import type { ApplicationDetailResponse } from '@/services/applications'
import { getPaymentStatusLabel, normalizePaymentStatus } from '@/lib/paymentStatus'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { Skeleton, SkeletonCard } from '@/components/ui'
import { 
  ArrowLeft, 
  Calendar, 
  MapPin, 
  Phone, 
  Mail, 
  User,
  GraduationCap,
  FileText,
  CreditCard,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle
} from 'lucide-react'
import { PageShell } from '@/components/ui/PageShell'
import { CACHE_CONFIG } from '@/hooks/queries/useQueryConfig'

type ApplicationRecord = ApplicationDetailResponse['application']

/** Fields that come from the Django API but aren't in the base Application interface */
type ApplicationRecordWithExtras = ApplicationRecord & {
  institution?: string
  application_fee?: string | number
  public_tracking_code?: string
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[minmax(0,9rem)_1fr] sm:items-start">
      <dt className="text-sm font-medium text-foreground">{label}</dt>
      <dd className="text-foreground font-medium break-words">{value}</dd>
    </div>
  )
}

export default function ApplicationDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const {
    data,
    isLoading: loading,
    error: queryError,
  } = useQuery({
    queryKey: ['application-detail', id],
    queryFn: async () => {
      const response = await applicationService.getById(id!)
      const normalizedResponse = response as ApplicationDetailResponse & {
        data?: ApplicationRecordWithExtras | null
      }

      const applicationRecord =
        (normalizedResponse?.application ?? normalizedResponse?.data ?? null) as ApplicationRecordWithExtras | null

      return {
        application: applicationRecord,
        interview: normalizedResponse?.interview ?? null,
      }
    },
    enabled: !!id,
    ...CACHE_CONFIG.applications,
  })

  const application = data?.application ?? null
  const interview = data?.interview ?? null
  const error = queryError ? (queryError instanceof Error ? queryError.message : 'Failed to load application details') : (!loading && !application ? 'Application not found' : '')

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-6 w-6 text-success" />
      case 'rejected':
        return <XCircle className="h-6 w-6 text-error" />
      case 'under_review':
        return <Clock className="h-6 w-6 text-primary" />
      default:
        return <AlertCircle className="h-6 w-6 text-warning" />
    }
  }

  if (loading) {
    return (
      <>
      <Seo
        title="Application Details | MIHAS-KATC Admissions"
        description="View the full details of your MIHAS-KATC admissions application."
        path={`/student/application/${id}`}
        noindex
      />
      <PageShell title="Application Details" subtitle="Loading...">
          <div className="space-y-6" role="status" aria-label="Loading application details">
            <Skeleton className="h-8 w-1/3 min-w-56" />
            <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
              <div className="space-y-4">
                <SkeletonCard />
                <SkeletonCard />
              </div>
              <SkeletonCard />
            </div>
            <span className="sr-only" aria-live="polite">Loading application details</span>
          </div>
      </PageShell>
      </>
    )
  }

  if (error || !application) {
    return (
      <>
      <Seo
        title="Application Details | MIHAS-KATC Admissions"
        description="View the full details of your MIHAS-KATC admissions application."
        path={`/student/application/${id}`}
        noindex
      />
      <PageShell title="Application Not Found">
          <ErrorDisplay
            variant="section"
            title="Application Not Found"
            message={error || 'The application you are looking for does not exist.'}
            onGoBack={() => navigate('/student/dashboard')}
            className="max-w-2xl"
          />
      </PageShell>
      </>
    )
  }

  const normalizedPaymentStatus = normalizePaymentStatus(application?.payment_status)
  const paymentStatusLabel = getPaymentStatusLabel(application?.payment_status)
  const paymentStatusColor =
    normalizedPaymentStatus === 'verified'
      ? 'text-success'
      : normalizedPaymentStatus === 'pending_review'
        ? 'text-warning'
        : normalizedPaymentStatus === 'rejected'
          ? 'text-error'
          : 'text-muted-foreground'

  return (
    <>
      <Seo
        title="Application Details | MIHAS-KATC Admissions"
        description="View the full details of your MIHAS-KATC admissions application."
        path={`/student/application/${id}`}
        noindex
      />
    <PageShell
      title="Application Details"
      subtitle={`#${application.application_number}`}
      eyebrow="Application Record"
      tone="student"
      metrics={[
        { label: 'Status', value: application.status?.replace('_', ' ') || 'Pending', helper: 'Current application decision state' },
        { label: 'Program', value: application.program || 'Not provided', helper: application.intake || 'Intake pending' },
        { label: 'Payment', value: paymentStatusLabel, helper: 'Current fee verification position' },
        { label: 'Tracking code', value: application.public_tracking_code || 'Not available', helper: 'Use this for public status tracking' },
      ]}
      actions={
        <div className="flex flex-wrap items-center gap-3">
          {getStatusIcon(application.status)}
          <span className={`rounded-md px-4 py-2 text-sm font-bold ${getStatusColor(application.status)}`}>
            {application.status?.replace('_', ' ').toUpperCase() || 'PENDING'}
          </span>
          <Button asChild variant="outline" size="sm">
            <Link to={`/student/application/${application.id}/status`}>
              View Status
            </Link>
          </Button>
        </div>
      }
    >
        {/* Back link */}
        <div className={`mb-8 ${animateClasses.slideUp}`}>
          <Link to="/student/dashboard" className="mb-4 inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Link>
        </div>

        {/* Interview */}
        {interview && interview.status !== 'cancelled' && (
          <div
            className={`mb-8 ${animateClasses.slideUp}`}
            style={staggerChild(1, 100)}
          >
            <InterviewDetails interview={{ ...interview, location: interview.location ?? '', notes: interview.notes ?? undefined }} />
          </div>
        )}

        {/* Documents */}
        <div
          className={`mb-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm ${animateClasses.slideUp}`}
          style={staggerChild(2, 100)}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Documents</h3>
              <p className="text-foreground text-sm">Download your application documents</p>
            </div>
            <DocumentButtons 
              applicationId={application.id}
              applicationNumber={application.application_number}
              status={application.status}
              paymentStatus={application.payment_status ?? null}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Personal Information */}
          <div
            className={`rounded-lg border border-slate-200 bg-white p-6 shadow-sm ${animateClasses.slideUp}`}
            style={staggerChild(3, 100)}
          >
            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center">
              <User className="h-5 w-5 mr-2 text-primary" />
              Personal Information
            </h3>
            <dl className="space-y-4">
              <DetailRow label="Full Name" value={application.full_name || 'Not provided'} />
              <DetailRow
                label="Email"
                value={(
                  <span className="flex items-center">
                    <Mail className="h-4 w-4 mr-2 text-foreground flex-shrink-0" />
                    <span className="break-all">{application.email || 'Not provided'}</span>
                  </span>
                )}
              />
              <DetailRow
                label="Phone"
                value={(
                  <span className="flex items-center">
                    <Phone className="h-4 w-4 mr-2 text-foreground flex-shrink-0" />
                    <span className="break-all">{application.phone || 'Not provided'}</span>
                  </span>
                )}
              />
              <DetailRow
                label="Nationality"
                value={(
                  <span className="flex items-center">
                    <MapPin className="h-4 w-4 mr-2 text-foreground flex-shrink-0" />
                    <span>{application.nationality || 'Zambian'}</span>
                  </span>
                )}
              />
            </dl>
          </div>

          {/* Program Information */}
          <div
            className={`rounded-lg border border-slate-200 bg-white p-6 shadow-sm ${animateClasses.slideUp}`}
            style={staggerChild(4, 100)}
          >
            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center">
              <GraduationCap className="h-5 w-5 mr-2 text-primary" />
              Program Information
            </h3>
            <dl className="space-y-4">
              <DetailRow label="Program" value={application.program || 'Not provided'} />
              <DetailRow
                label="Institution"
                value={
                  application.institution === 'KATC'
                    ? 'Kalulushi Training Centre'
                    : application.institution === 'MIHAS'
                      ? 'Mukuba Institute of Health and Applied Sciences'
                      : application.institution || 'Not provided'
                }
              />
              <DetailRow label="Intake" value={application.intake || 'Not provided'} />
              <DetailRow
                label="Application Fee"
                value={application.application_fee != null ? `ZMW ${application.application_fee}` : 'Resolved at payment step'}
              />
            </dl>
          </div>

          {/* Application Timeline */}
          <div
            className={`rounded-lg border border-slate-200 bg-white p-6 shadow-sm ${animateClasses.slideUp}`}
            style={staggerChild(5, 100)}
          >
            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center">
              <Calendar className="h-5 w-5 mr-2 text-primary" />
              Timeline
            </h3>
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-accent rounded-full"></div>
                <div>
                  <p className="text-sm font-medium text-foreground">Application Created</p>
                  <p className="text-xs text-foreground">{formatDate(application.created_at)}</p>
                </div>
              </div>
              {application.submitted_at && (
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-primary rounded-full"></div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Application Submitted</p>
                    <p className="text-xs text-foreground">{formatDate(application.submitted_at)}</p>
                  </div>
                </div>
              )}
              {application.review_started_at && (
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-accent rounded-full"></div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Review Started</p>
                    <p className="text-xs text-foreground">{formatDate(application.review_started_at)}</p>
                  </div>
                </div>
              )}
              {application.decision_date && (
                <div className="flex items-center space-x-3">
                  <div className={`w-2 h-2 rounded-full ${
                    application.status === 'approved' ? 'bg-success' : 'bg-error'
                  }`}></div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Decision Made</p>
                    <p className="text-xs text-foreground">{formatDate(application.decision_date)}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Payment Information */}
          <div
            className={`rounded-lg border border-slate-200 bg-white p-6 shadow-sm ${animateClasses.slideUp}`}
            style={staggerChild(6, 100)}
          >
            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center">
              <CreditCard className="h-5 w-5 mr-2 text-primary" />
              Payment Status
            </h3>
            <dl className="space-y-4">
              <DetailRow
                label="Payment Status"
                value={<span className={paymentStatusColor}>{paymentStatusLabel}</span>}
              />
              {application.payment_verified_at && (
                <DetailRow label="Verified Date" value={formatDate(application.payment_verified_at)} />
              )}
              <DetailRow
                label="Tracking Code"
                value={<span className="font-mono break-all">{application.public_tracking_code || 'Not available'}</span>}
              />
            </dl>
          </div>
        </div>
    </PageShell>
    </>
  )
}
