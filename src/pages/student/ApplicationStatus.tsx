// @ts-nocheck
import React, { useState, useEffect, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import type { ApplicationWithDetails } from '@/types/database'
import { logger } from '@/utils/logger'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { formatDate } from '@/lib/utils'
import { applicationService } from '@/services/applications'
import { staggerChild, animateClasses } from '@/lib/animations'
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
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionCard } from '@/components/ui/SectionCard'

interface ApplicationTimeline {
  status: string
  date: string
  description: string
  completed: boolean
}

const statusAccent = (status: string) => {
  switch (status) {
    case 'approved':
      return 'success' as const
    case 'rejected':
      return 'warning' as const
    case 'under_review':
      return 'primary' as const
    default:
      return 'neutral' as const
  }
}

export default function ApplicationStatus() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [application, setApplication] = useState<ApplicationWithDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadApplicationDetails = useCallback(async () => {
    if (!id || !user) return
    
    try {
      setLoading(true)
      setError('')

      const response = await applicationService.getById(id)

      if (!response.application) {
        throw new Error('Application not found or access denied')
      }

      setApplication(response.application as ApplicationWithDetails)
    } catch (error: any) {
      logger.error('Error loading application details:', error)
      setError(error.message || 'Failed to load application')
    } finally {
      setLoading(false)
    }
  }, [id, user])

  useEffect(() => {
    loadApplicationDetails()
  }, [loadApplicationDetails])

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
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return 'To be confirmed'
    }
    const datePart = formatDate(date.toISOString())
    const timePart = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    return `${datePart} at ${timePart}`
  }

  const getTimeline = (): ApplicationTimeline[] => {
    if (!application) return []

    const timeline: ApplicationTimeline[] = [
      {
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
      
          <div className="safe-area-bottom py-4 sm:py-6 lg:py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          <div className="flex min-h-[40vh] items-center justify-center">
            <LoadingSpinner size="lg" />
          </div>
        </div>
      
    )
  }

  if (error || !application) {
    return (
      
          <div className="safe-area-bottom py-4 sm:py-6 lg:py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          <SectionCard className="mx-auto max-w-xl text-center" title="Application not found" icon={<AlertCircle className="h-5 w-5" />}>
            <p className="text-foreground">
              {error || 'The application you are looking for does not exist or you do not have permission to view it.'}
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link to="/student/dashboard">
                <Button className="bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700">
                  Back to dashboard
                </Button>
              </Link>
              <Button variant="outline" onClick={() => navigate(-1)}>
                Go back
              </Button>
            </div>
          </SectionCard>
        </div>
      
    )
  }

  const timeline = getTimeline()
  const interview = application.interview
  const hasActiveInterview = Boolean(interview && interview.status !== 'cancelled')
  const statusLabel = application.status.replace('_', ' ').toUpperCase()

  return (
    
        <div className="safe-area-bottom py-4 sm:py-6 lg:py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="space-y-6 sm:space-y-8">
          <Link
            to="/student/dashboard"
            className="inline-flex items-center text-primary transition-colors hover:text-primary/80"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to dashboard
          </Link>

          <PageHeader
            icon={<FileText className="h-6 w-6" />}
            title={`Application #${application.application_number}`}
            description={`${application.program.length > 40 ? application.program.substring(0, 40) + '...' : application.program} • Submitted on ${formatDate(application.submitted_at)}`}
            stats={[
              {
                label: 'Current status',
                value: statusLabel,
                accent: statusAccent(application.status),
                icon: getStatusIcon(application.status)
              }
            ]}
          >
            <p className="text-sm text-foreground">Intake: {application.intake}</p>
          </PageHeader>

          {hasActiveInterview && interview && (
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
          )}

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
                        className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full shadow-lg ${
                          step.completed
                            ? 'bg-gradient-to-br from-green-500 to-green-600 text-white'
                            : 'bg-accent text-foreground'
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
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <div className="rounded-xl border border-primary/30 bg-primary/5 px-5 py-4">
                    <h3 className="text-sm font-bold text-foreground mb-3"><User className="w-5 h-5" /> Personal information</h3>
                    <div className="space-y-2 text-sm text-foreground">
                      <div className="flex justify-between">
                        <span className="text-foreground">Full name:</span>
                        <span className="font-semibold break-words">{application.full_name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-foreground">Date of birth:</span>
                        <span className="font-semibold">{application.date_of_birth}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-foreground">Sex:</span>
                        <span className="font-semibold">{application.sex}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-foreground">Phone:</span>
                        <span className="font-semibold">{application.phone}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-foreground">Email:</span>
                        <span className="font-semibold truncate">{application.email}</span>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-accent/30 bg-accent/10 px-5 py-4">
                    <h3 className="text-sm font-bold text-foreground mb-3"><Phone className="w-5 h-5" /> Contact information</h3>
                    <div className="space-y-2 text-sm text-foreground">
                      <div className="flex justify-between">
                        <span className="text-foreground">Residence:</span>
                        <span className="font-semibold break-words">{application.residence_town}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-foreground">NRC:</span>
                        <span className="font-semibold break-all">{application.nrc_number || 'Not provided'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-foreground">Guardian:</span>
                        <span className="font-semibold">{application.guardian_name || 'Not provided'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-foreground">Guardian phone:</span>
                        <span className="font-semibold">{application.guardian_phone || 'Not provided'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-input/30 bg-secondary/5 px-5 py-4 lg:col-span-2">
                    <h3 className="text-sm font-bold text-foreground mb-3"><CreditCard className="w-5 h-5" /> Payment information</h3>
                    <div className="grid gap-2 text-sm text-foreground sm:grid-cols-2">
                      <div className="flex justify-between">
                        <span className="text-foreground">Payment reference:</span>
                        <span className="font-semibold">{application.payment_reference || 'Not provided'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-foreground">Payment method:</span>
                        <span className="font-semibold">{application.payment_method || 'Not provided'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-foreground">Amount paid:</span>
                        <span className="font-semibold">K{application.amount || application.application_fee || 'Not provided'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-foreground">Payment status:</span>
                        <span className="font-semibold">{application.payment_status}</span>
                      </div>
                    </div>
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
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(application.result_slip_url as string, '_blank')}
                        className="border-blue-300 text-primary hover:bg-primary/10"
                      >
                        <Eye className="mr-1 h-4 w-4" />
                        View
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
                          <p className="text-sm font-semibold text-foreground">Extra KYC documents</p>
                          <p className="text-xs font-medium text-warning-strong">✓ Uploaded</p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(application.extra_kyc_url as string, '_blank')}
                        className="border-green-300 text-accent hover:bg-accent/10"
                      >
                        <Eye className="mr-1 h-4 w-4" />
                        View
                      </Button>
                    </div>
                  )}

                  {application.pop_url && (
                    <div
                      className={`flex items-center justify-between rounded-xl border border-input/30 bg-secondary/5 px-4 py-3 ${animateClasses.fadeIn}`}
                      style={staggerChild(2, 100)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-muted p-2">
                          <FileText className="h-5 w-5 text-secondary" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">Proof of payment</p>
                          <p className="text-xs font-medium text-foreground">✓ Uploaded</p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(application.pop_url as string, '_blank')}
                        className="border-purple-300 text-foreground hover:bg-muted"
                      >
                        <Eye className="mr-1 h-4 w-4" />
                        View
                      </Button>
                    </div>
                  )}

                  {!application.result_slip_url && !application.extra_kyc_url && !application.pop_url && (
                    <p className="rounded-xl bg-muted px-4 py-6 text-center text-sm text-foreground">
                      No supporting documents uploaded.
                    </p>
                  )}
                </div>
              </SectionCard>
            </div>

            <div className="space-y-6">
              <SectionCard
                title="Quick information"
                description="Essential application details at a glance."
                icon={<User className="h-5 w-5" />}
              >
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-foreground">Application ID</span>
                    <span className="font-semibold">#{application.application_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-foreground">Program</span>
                    <span className="font-semibold break-words">{application.program}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-foreground">Intake</span>
                    <span className="font-semibold">{application.intake}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-foreground">Submitted</span>
                    <span className="font-semibold">{formatDate(application.submitted_at)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-foreground">Last updated</span>
                    <span className="font-semibold">{formatDate(application.updated_at)}</span>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Next actions" description="Stay in control of your application." icon={<FileText className="h-5 w-5" />}>
                <div className="flex flex-col gap-3">
                  <Link to="/apply">
                    <Button variant="outline" className="w-full">
                      Submit new application
                    </Button>
                  </Link>
                  <Link to="/student/dashboard">
                    <Button variant="ghost" className="w-full">
                      Back to dashboard
                    </Button>
                  </Link>
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
      </div>
    
  )
}
