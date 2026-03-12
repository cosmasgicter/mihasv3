// @ts-nocheck
import React from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { staggerChild, animateClasses } from '@/lib/animations'
import { DocumentButtons } from '@/components/student/DocumentButtons'
import { InterviewDetails } from '@/components/student/InterviewDetails'
import { Button } from '@/components/ui/Button'
import { formatDate, getStatusColor } from '@/lib/utils'
import { applicationService } from '@/services/applications'
import type { ApplicationDetailResponse } from '@/services/applications'
import { getPaymentStatusLabel, normalizePaymentStatus } from '@/lib/paymentStatus'
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

export default function ApplicationDetail() {
  const { id } = useParams<{ id: string }>()

  const {
    data,
    isLoading: loading,
    error: queryError,
  } = useQuery({
    queryKey: ['application-detail', id],
    queryFn: async () => {
      const response = await applicationService.getById(id!)
      const normalizedResponse = response as ApplicationDetailResponse & {
        data?: ApplicationRecord | null
      }

      const applicationRecord =
        normalizedResponse?.application ?? normalizedResponse?.data ?? null

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
      <PageShell title="Application Details" subtitle="Loading...">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-skeleton rounded w-1/3"></div>
            <div className="bg-card rounded-2xl shadow-lg p-4 sm:p-8 space-y-4">
              <div className="h-6 bg-skeleton rounded w-1/2"></div>
              <div className="h-4 bg-skeleton rounded w-3/4"></div>
              <div className="h-4 bg-skeleton rounded w-1/2"></div>
            </div>
          </div>
      </PageShell>
    )
  }

  if (error || !application) {
    return (
      <PageShell title="Application Not Found">
          <div className="text-center py-8 sm:py-16">
            <XCircle className="h-16 w-16 text-error mx-auto mb-4" />
            <h2 className="text-xl font-bold text-foreground mb-2">Application Not Found</h2>
            <p className="text-foreground mb-6">{error || 'The application you are looking for does not exist.'}</p>
            <Link to="/student/dashboard">
              <Button>Return to Dashboard</Button>
            </Link>
          </div>
      </PageShell>
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
    <PageShell
      title="Application Details"
      subtitle={`#${application.application_number}`}
      actions={
        <div className="flex items-center space-x-3">
          {getStatusIcon(application.status)}
          <span className={`px-4 py-2 rounded-full text-sm font-bold ${getStatusColor(application.status)}`}>
            {application.status?.replace('_', ' ').toUpperCase() || 'PENDING'}
          </span>
        </div>
      }
    >
        {/* Back link */}
        <div className={`mb-8 ${animateClasses.slideUp}`}>
          <Link to="/student/dashboard" className="inline-flex items-center text-primary hover:text-primary/80 mb-4">
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
            <InterviewDetails interview={interview} />
          </div>
        )}

        {/* Documents */}
        <div
          className={`bg-card rounded-2xl shadow-lg border border-border p-6 mb-8 ${animateClasses.slideUp}`}
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
              paymentStatus={application.payment_status}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:p-8">
          {/* Personal Information */}
          <div
            className={`bg-card rounded-2xl shadow-lg border border-border p-6 ${animateClasses.slideUp}`}
            style={staggerChild(3, 100)}
          >
            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center">
              <User className="h-5 w-5 mr-2 text-primary" />
              Personal Information
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground">Full Name</label>
                <p className="text-foreground font-medium break-words">{application.full_name}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Email</label>
                <p className="text-foreground font-medium flex items-center">
                  <Mail className="h-4 w-4 mr-2 text-foreground flex-shrink-0" />
                  <span className="break-all">{application.email}</span>
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Phone</label>
                <p className="text-foreground font-medium flex items-center">
                  <Phone className="h-4 w-4 mr-2 text-foreground flex-shrink-0" />
                  <span className="break-all">{application.phone}</span>
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Nationality</label>
                <p className="text-foreground font-medium flex items-center">
                  <MapPin className="h-4 w-4 mr-2 text-foreground" />
                  {application.nationality || 'Zambian'}
                </p>
              </div>
            </div>
          </div>

          {/* Program Information */}
          <div
            className={`bg-card rounded-2xl shadow-lg border border-border p-6 ${animateClasses.slideUp}`}
            style={staggerChild(4, 100)}
          >
            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center">
              <GraduationCap className="h-5 w-5 mr-2 text-primary" />
              Program Information
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground">Program</label>
                <p className="text-foreground font-medium break-words">{application.program}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Institution</label>
                <p className="text-foreground font-medium break-words">
                  {application.institution === 'KATC' ? 'Kalulushi Training Centre' : 
                   application.institution === 'MIHAS' ? 'Mukuba Institute of Health and Allied Sciences' : 
                   application.institution}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Intake</label>
                <p className="text-foreground font-medium break-words">{application.intake}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Application Fee</label>
                <p className="text-foreground font-medium">ZMW {application.application_fee}</p>
              </div>
            </div>
          </div>

          {/* Application Timeline */}
          <div
            className={`bg-card rounded-2xl shadow-lg border border-border p-6 ${animateClasses.slideUp}`}
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
            className={`bg-card rounded-2xl shadow-lg border border-border p-6 ${animateClasses.slideUp}`}
            style={staggerChild(6, 100)}
          >
            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center">
              <CreditCard className="h-5 w-5 mr-2 text-primary" />
              Payment Status
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground">Payment Status</label>
                <p className={`font-medium ${paymentStatusColor}`}>
                  {paymentStatusLabel}
                </p>
              </div>
              {application.payment_verified_at && (
                <div>
                  <label className="text-sm font-medium text-foreground">Verified Date</label>
                  <p className="text-foreground font-medium">{formatDate(application.payment_verified_at)}</p>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-foreground">Tracking Code</label>
                <p className="text-foreground font-medium font-mono break-all">{application.public_tracking_code}</p>
              </div>
            </div>
          </div>
        </div>
    </PageShell>
  )
}
