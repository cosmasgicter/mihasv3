import React, { useState, useEffect, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import type { ApplicationWithDetails } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { formatDate, getStatusColor } from '@/lib/utils'
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
  Eye
} from 'lucide-react'

interface ApplicationTimeline {
  status: string
  date: string
  description: string
  completed: boolean
}

export default function ApplicationStatus() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [application, setApplication] = useState<ApplicationWithDetails | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadApplicationDetails = useCallback(async () => {
    try {
      setLoading(true)
      
      const response = await applicationService.getById(id as string)

      if (!response.application) {
        throw new Error('Application not found or access denied')
      }

      setApplication(response.application as ApplicationWithDetails)


    } catch (error: any) {
      console.error('Error loading application details:', error)
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }, [id, user])

  useEffect(() => {
    if (id && user) {
      loadApplicationDetails()
    }
  }, [id, user, loadApplicationDetails])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case 'rejected':
        return <XCircle className="h-5 w-5 text-red-500" />
      case 'under_review':
        return <Clock className="h-5 w-5 text-primary" />
      case 'submitted':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />
      case 'interview_scheduled':
        return <Calendar className="h-5 w-5 text-blue-500" />
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
        description: 'Application under review by admissions team',
        completed: true
      })
    }

    if (application.status === 'approved') {
      timeline.push({
        status: 'approved',
        date: application.decision_date || application.updated_at,
        description: 'Application approved - Congratulations!',
        completed: true
      })
    } else if (application.status === 'rejected') {
      timeline.push({
        status: 'rejected',
        date: application.decision_date || application.updated_at,
        description: 'Application not successful this time',
        completed: true
      })
    } else {
      // Add pending steps
      timeline.push({
        status: 'decision',
        date: '',
        description: 'Final decision pending',
        completed: false
      })
    }

    return timeline
  }



  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (error || !application) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-secondary mb-2">
              Application Not Found
            </h2>
            <p className="text-secondary mb-6">
              {error || 'The application you are looking for does not exist or you do not have permission to view it.'}
            </p>
            <Link to="/student/dashboard">
              <Button>Back to Dashboard</Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const timeline = getTimeline()
  const interview = application.interview
  const hasActiveInterview = Boolean(interview && interview.status !== 'cancelled')

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="container-mobile py-4 sm:py-6 lg:py-8 safe-area-bottom">
        {/* Header - Mobile First */}
        <div className="mb-6 sm:mb-8">
          <Link to="/student/dashboard" className="inline-flex items-center text-primary hover:text-primary/80 mb-4 font-medium transition-colors">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Link>
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6"
          >
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between space-y-4 sm:space-y-0">
              <div className="flex-1">
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 mb-2">
                  📋 Application #{application.application_number}
                </h1>
                <p className="text-lg sm:text-xl text-gray-800 mb-1 font-semibold">
                  {application.program}
                </p>
                <p className="text-sm sm:text-base text-gray-600">
                  {application.intake} • Submitted on {formatDate(application.submitted_at)}
                </p>
              </div>
              <div className="flex items-center space-x-3 sm:flex-col sm:items-end sm:space-x-0 sm:space-y-2">
                <div className="flex items-center space-x-2">
                  {getStatusIcon(application.status)}
                  <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                    getStatusColor(application.status)
                  }`}>
                    {application.status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {interview && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-6"
          >
            <div className={`rounded-2xl border ${
              hasActiveInterview ? 'border-blue-200 bg-blue-50/80' : 'border-gray-200 bg-white'
            } p-6 shadow-sm`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Calendar className={`h-10 w-10 ${hasActiveInterview ? 'text-blue-500' : 'text-gray-400'}`} />
                  <div>
                    <p className="text-sm font-semibold text-gray-700">Admissions interview</p>
                    <p className="text-base font-medium text-gray-900">
                      {hasActiveInterview
                        ? formatInterviewDateTime(interview.scheduled_at)
                        : 'The previously scheduled interview has been cancelled.'}
                    </p>
                  </div>
                </div>
                {hasActiveInterview && (
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                    {interview.mode?.replace('_', ' ') || 'Interview'}
                  </span>
                )}
              </div>

              {hasActiveInterview && (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-blue-700">Location / Link</p>
                    <p className="text-sm text-gray-900">
                      {interview.location || 'You will receive the meeting details shortly.'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-blue-700">Important notes</p>
                    <p className="text-sm text-gray-900">
                      {interview.notes || 'Please arrive 10 minutes early and bring your identification.'}
                    </p>
                  </div>
                </div>
              )}

              {!hasActiveInterview && (
                <p className="mt-4 text-sm text-gray-600">
                  Our admissions team will contact you if a new interview is required. If you have questions, please reach out to admissions support.
                </p>
              )}
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          {/* Main Content - Mobile First */}
          <div className="lg:col-span-2 space-y-6 sm:space-y-8">
            {/* Timeline */}
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6"
            >
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-6 flex items-center">
                📈 Application Progress
              </h2>
              <div className="space-y-6">
                {timeline.map((step, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + index * 0.1 }}
                    className="flex items-start space-x-4"
                  >
                    <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-lg ${
                      step.completed
                        ? 'bg-gradient-to-br from-green-400 to-green-600 text-white'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {step.completed ? <CheckCircle className="h-5 w-5" /> : getStatusIcon(step.status)}
                    </div>
                    <div className="flex-grow">
                      <div className={`font-semibold ${
                        step.completed ? 'text-gray-900' : 'text-gray-600'
                      }`}>
                        {step.description}
                      </div>
                      {step.date && (
                        <div className="text-sm text-gray-500 mt-1">
                          {formatDate(step.date)}
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Application Details */}
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6"
            >
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-6 flex items-center">
                📝 Application Details
              </h2>
              <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
                    <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center">
                      👤 Personal Information
                    </h3>
                    <div className="text-gray-700 text-sm space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Full Name:</span>
                        <span className="font-semibold">{application.full_name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Date of Birth:</span>
                        <span className="font-semibold">{application.date_of_birth}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Sex:</span>
                        <span className="font-semibold">{application.sex}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Phone:</span>
                        <span className="font-semibold">{application.phone}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Email:</span>
                        <span className="font-semibold truncate">{application.email}</span>
                      </div>
                    </div>
                  </div>
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200">
                    <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center">
                      📞 Contact Information
                    </h3>
                    <div className="text-gray-700 text-sm space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Residence:</span>
                        <span className="font-semibold">{application.residence_town}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">NRC:</span>
                        <span className="font-semibold">{application.nrc_number || 'Not provided'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Passport:</span>
                        <span className="font-semibold">{application.passport_number || 'Not provided'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Next of Kin:</span>
                        <span className="font-semibold">{application.next_of_kin_name || 'Not provided'}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-4 border border-purple-200">
                  <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center">
                    💳 Payment Information
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Payment Method:</span>
                      <span className="font-semibold">{application.payment_method || 'Not provided'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Amount Paid:</span>
                      <span className="font-semibold">K{application.amount || application.application_fee || 'Not provided'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Payment Status:</span>
                      <span className="font-semibold">{application.payment_status}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Payer:</span>
                      <span className="font-semibold">{application.payer_name || 'Not provided'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Documents */}
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 }}
              className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6"
            >
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-6 flex items-center">
                📄 Supporting Documents
              </h2>
              <div className="space-y-4">
                {application.result_slip_url && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <FileText className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">Result Slip</p>
                        <p className="text-xs text-blue-600 font-medium">✓ Uploaded</p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(application.result_slip_url, '_blank')}
                      className="text-blue-600 border-blue-300 hover:bg-blue-100"
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
                  </motion.div>
                )}
                
                {application.extra_kyc_url && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="flex items-center justify-between p-4 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-green-100 rounded-lg">
                        <FileText className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">Extra KYC Documents</p>
                        <p className="text-xs text-green-600 font-medium">✓ Uploaded</p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(application.extra_kyc_url, '_blank')}
                      className="text-green-600 border-green-300 hover:bg-green-100"
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
                  </motion.div>
                )}
                
                {application.pop_url && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-xl"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-purple-100 rounded-lg">
                        <FileText className="h-5 w-5 text-purple-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">Proof of Payment</p>
                        <p className="text-xs text-purple-600 font-medium">✓ Uploaded</p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(application.pop_url, '_blank')}
                      className="text-purple-600 border-purple-300 hover:bg-purple-100"
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
                  </motion.div>
                )}
                
                {!application.result_slip_url && !application.extra_kyc_url && !application.pop_url && (
                  <div className="text-center py-8">
                    <div className="text-6xl mb-4">📄</div>
                    <p className="text-gray-500 font-medium">No documents uploaded</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Info */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-secondary mb-4">Quick Info</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-secondary">Application ID:</span>
                  <span className="font-medium">#{application.application_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-secondary">Program:</span>
                  <span className="font-medium text-right">{application.program}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-secondary">Intake:</span>
                  <span className="font-medium">{application.intake}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-secondary">Submitted:</span>
                  <span className="font-medium">{formatDate(application.submitted_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-secondary">Last Updated:</span>
                  <span className="font-medium">{formatDate(application.updated_at)}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-secondary mb-4">Actions</h3>
              <div className="space-y-3">
                <Link to="/apply">
                  <Button variant="outline" className="w-full">
                    Submit New Application
                  </Button>
                </Link>
                <Link to="/student/dashboard">
                  <Button variant="ghost" className="w-full">
                    Back to Dashboard
                  </Button>
                </Link>
              </div>
            </div>

            {/* Contact Info */}
            {application.status === 'under_review' && (
              <div className="bg-primary border border-primary/20 rounded-lg p-4">
                <h4 className="text-sm font-medium text-primary mb-2">
                  Application Under Review
                </h4>
                <p className="text-xs text-primary">
                  Your application is being reviewed by our admissions team. 
                  You will be notified via email once a decision is made.
                </p>
              </div>
            )}

            {application.status === 'approved' && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h4 className="text-sm font-medium text-green-900 mb-2">
                  Congratulations!
                </h4>
                <p className="text-xs text-green-700">
                  Your application has been approved. You will receive further 
                  instructions via email regarding enrollment and next steps.
                </p>
              </div>
            )}

            {application.status === 'rejected' && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h4 className="text-sm font-medium text-red-900 mb-2">
                  Application Update
                </h4>
                <p className="text-xs text-red-700">
                  Unfortunately, your application was not successful this time. 
                  You may submit a new application for future intakes.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}