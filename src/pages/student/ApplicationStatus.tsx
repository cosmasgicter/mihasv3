import React, { useState, useEffect, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import type { ApplicationWithDetails } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { formatDate } from '@/lib/utils'
import { motion } from 'framer-motion'
import { applicationService } from '@/services/applications'
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
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case 'rejected':
        return <XCircle className="h-5 w-5 text-red-500" />
      case 'under_review':
        return <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
      case 'submitted':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />
      case 'interview_scheduled':
        return <Calendar className="h-5 w-5 text-blue-500 dark:text-blue-400" />
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
            <p className="text-gray-600 dark:text-gray-400 dark:text-gray-500">
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
            className="inline-flex items-center text-blue-600 dark:text-blue-400 transition-colors hover:text-blue-600/80"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to dashboard
          </Link>

          <PageHeader
            icon={<FileText className="h-6 w-6" />}
            title={`Application #${application.application_number}`}
            description={`${application.program} • Submitted on ${formatDate(application.submitted_at)}`}
            stats={[
              {
                label: 'Current status',
                value: statusLabel,
                accent: statusAccent(application.status),
                icon: getStatusIcon(application.status)
              }
            ]}
          >
            <p className="text-sm text-gray-600 dark:text-gray-400 dark:text-gray-500">Intake: {application.intake}</p>
          </PageHeader>

          {hasActiveInterview && interview && (
            <SectionCard
              title="Admissions interview"
              description="Your interview is scheduled—review the key details below."
              icon={<Calendar className="h-5 w-5" />}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 dark:text-gray-900">{formatInterviewDateTime(interview.scheduled_at)}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 dark:text-gray-500">{interview.mode?.replace('_', ' ') || 'Interview'}</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">Location / Link</p>
                    <p className="text-sm text-gray-900 dark:text-gray-100 dark:text-gray-900">
                      {interview.location || 'You will receive the meeting details shortly.'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">Important notes</p>
                    <p className="text-sm text-gray-900 dark:text-gray-100 dark:text-gray-900">
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
              <p className="text-sm text-gray-600 dark:text-gray-400 dark:text-gray-500">
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
                    <motion.div
                      key={`${step.status}-${index}`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + index * 0.05 }}
                      className="flex items-start gap-4"
                    >
                      <div
                        className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full shadow-lg ${
                          step.completed
                            ? 'bg-gradient-to-br from-green-500 to-green-600 text-white'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-500'
                        }`}
                      >
                        {step.completed ? <CheckCircle className="h-5 w-5" /> : getStatusIcon(step.status)}
                      </div>
                      <div className="flex-1">
                        <p className={`font-semibold ${step.completed ? 'text-gray-900 dark:text-gray-100 dark:text-gray-900' : 'text-gray-600 dark:text-gray-400 dark:text-gray-500'}`}>
                          {step.description}
                        </p>
                        {step.date && (
                          <p className="text-sm text-gray-500 dark:text-gray-500">{formatDate(step.date)}</p>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </SectionCard>

              <SectionCard
                title="Application details"
                description="Review the information you submitted with this application."
                icon={<FileText className="h-5 w-5" />}
              >
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 px-5 py-4">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 dark:text-gray-900 mb-3"><User className="w-5 h-5" /> Personal information</h3>
                    <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300 dark:text-gray-600">
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400 dark:text-gray-500">Full name:</span>
                        <span className="font-semibold">{application.full_name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400 dark:text-gray-500">Date of birth:</span>
                        <span className="font-semibold">{application.date_of_birth}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400 dark:text-gray-500">Sex:</span>
                        <span className="font-semibold">{application.sex}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400 dark:text-gray-500">Phone:</span>
                        <span className="font-semibold">{application.phone}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400 dark:text-gray-500">Email:</span>
                        <span className="font-semibold truncate">{application.email}</span>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 px-5 py-4">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 dark:text-gray-900 mb-3"><Phone className="w-5 h-5" /> Contact information</h3>
                    <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300 dark:text-gray-600">
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400 dark:text-gray-500">Residence:</span>
                        <span className="font-semibold">{application.residence_town}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400 dark:text-gray-500">NRC:</span>
                        <span className="font-semibold">{application.nrc_number || 'Not provided'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400 dark:text-gray-500">Guardian:</span>
                        <span className="font-semibold">{application.guardian_name || 'Not provided'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400 dark:text-gray-500">Guardian phone:</span>
                        <span className="font-semibold">{application.guardian_phone || 'Not provided'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30 px-5 py-4 lg:col-span-2">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 dark:text-gray-900 mb-3"><CreditCard className="w-5 h-5" /> Payment information</h3>
                    <div className="grid gap-2 text-sm text-gray-700 dark:text-gray-300 dark:text-gray-600 sm:grid-cols-2">
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400 dark:text-gray-500">Payment reference:</span>
                        <span className="font-semibold">{application.payment_reference || 'Not provided'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400 dark:text-gray-500">Payment method:</span>
                        <span className="font-semibold">{application.payment_method || 'Not provided'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400 dark:text-gray-500">Amount paid:</span>
                        <span className="font-semibold">K{application.amount || application.application_fee || 'Not provided'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400 dark:text-gray-500">Payment status:</span>
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
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center justify-between rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-blue-100 dark:bg-blue-900/30 p-2">
                          <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 dark:text-gray-900">Result slip</p>
                          <p className="text-xs font-medium text-blue-600 dark:text-blue-400">✓ Uploaded</p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(application.result_slip_url as string, '_blank')}
                        className="border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:bg-blue-900/30"
                      >
                        <Eye className="mr-1 h-4 w-4" />
                        View
                      </Button>
                    </motion.div>
                  )}

                  {application.extra_kyc_url && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="flex items-center justify-between rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-green-100 dark:bg-green-900/30 p-2">
                          <FileText className="h-5 w-5 text-green-600 dark:text-green-400" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 dark:text-gray-900">Extra KYC documents</p>
                          <p className="text-xs font-medium text-green-600 dark:text-green-400">✓ Uploaded</p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(application.extra_kyc_url as string, '_blank')}
                        className="border-green-300 dark:border-green-700 text-green-600 dark:text-green-400 hover:bg-green-100 dark:bg-green-900/30"
                      >
                        <Eye className="mr-1 h-4 w-4" />
                        View
                      </Button>
                    </motion.div>
                  )}

                  {application.pop_url && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="flex items-center justify-between rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-purple-100 dark:bg-purple-900/30 p-2">
                          <FileText className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 dark:text-gray-900">Proof of payment</p>
                          <p className="text-xs font-medium text-purple-600 dark:text-purple-400">✓ Uploaded</p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(application.pop_url as string, '_blank')}
                        className="border-purple-300 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:bg-purple-900/30"
                      >
                        <Eye className="mr-1 h-4 w-4" />
                        View
                      </Button>
                    </motion.div>
                  )}

                  {!application.result_slip_url && !application.extra_kyc_url && !application.pop_url && (
                    <p className="rounded-xl bg-gray-50 dark:bg-gray-900 px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-500">
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
                    <span className="text-gray-600 dark:text-gray-400 dark:text-gray-500">Application ID</span>
                    <span className="font-semibold">#{application.application_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400 dark:text-gray-500">Program</span>
                    <span className="font-semibold text-right">{application.program}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400 dark:text-gray-500">Intake</span>
                    <span className="font-semibold">{application.intake}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400 dark:text-gray-500">Submitted</span>
                    <span className="font-semibold">{formatDate(application.submitted_at)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400 dark:text-gray-500">Last updated</span>
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
                  icon={<CheckCircle className="h-5 w-5 text-green-500" />}
                />
              )}

              {application.status === 'rejected' && (
                <SectionCard
                  title="Application update"
                  description="Unfortunately this application was not successful. You're welcome to apply again for future intakes."
                  icon={<XCircle className="h-5 w-5 text-red-500" />}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    
  )
}
