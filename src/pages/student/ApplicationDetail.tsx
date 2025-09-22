import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AuthenticatedNavigation } from '@/components/ui/AuthenticatedNavigation'
import { ApplicationSlipActions } from '@/components/student/ApplicationSlipActions'
import { Button } from '@/components/ui/Button'
import { formatDate, getStatusColor } from '@/lib/utils'
import { applicationService } from '@/services/applications'
import type { ApplicationDetailResponse } from '@/services/applications'
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

type ApplicationRecord = ApplicationDetailResponse['application']

export default function ApplicationDetail() {
  const { id } = useParams<{ id: string }>()
  const [application, setApplication] = useState<ApplicationRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (id) {
      loadApplication()
    }
  }, [id])

  const loadApplication = async () => {
    try {
      setLoading(true)
      setError('')

      const response = await applicationService.getById(id!)
      const normalizedResponse = response as ApplicationDetailResponse & {
        data?: ApplicationRecord | null
      }

      const applicationRecord =
        normalizedResponse?.application ?? normalizedResponse?.data ?? null

      if (!applicationRecord) {
        setApplication(null)
        setError('Application not found')
        return
      }

      setApplication(applicationRecord)
    } catch (error) {
      console.error('Error loading application:', error)
      setError('Failed to load application details')
    } finally {
      setLoading(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-6 w-6 text-green-500" />
      case 'rejected':
        return <XCircle className="h-6 w-6 text-red-500" />
      case 'under_review':
        return <Clock className="h-6 w-6 text-blue-500" />
      default:
        return <AlertCircle className="h-6 w-6 text-yellow-500" />
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <AuthenticatedNavigation />
        <main className="px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="bg-white rounded-2xl shadow-lg p-8 space-y-4">
              <div className="h-6 bg-gray-200 rounded w-1/2"></div>
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (error || !application) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <AuthenticatedNavigation />
        <main className="px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto py-8">
          <div className="text-center py-16">
            <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Application Not Found</h2>
            <p className="text-gray-600 mb-6">{error || 'The application you are looking for does not exist.'}</p>
            <Link to="/student/dashboard">
              <Button>Return to Dashboard</Button>
            </Link>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <AuthenticatedNavigation />
      
      <main className="px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <Link to="/student/dashboard" className="inline-flex items-center text-primary hover:text-primary/80 mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Link>
          
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Application Details</h1>
              <p className="text-gray-600">#{application.application_number}</p>
            </div>
            
            <div className="flex items-center space-x-3">
              {getStatusIcon(application.status)}
              <span className={`px-4 py-2 rounded-full text-sm font-bold ${getStatusColor(application.status)}`}>
                {application.status?.replace('_', ' ').toUpperCase() || 'PENDING'}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Application Slip Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 mb-8"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Application Slip</h3>
              <p className="text-gray-600 text-sm">Download or email your official application slip</p>
            </div>
            <ApplicationSlipActions 
              applicationId={application.id} 
              applicationNumber={application.application_number}
            />
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Personal Information */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <User className="h-5 w-5 mr-2 text-primary" />
              Personal Information
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Full Name</label>
                <p className="text-gray-900 font-medium">{application.full_name}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Email</label>
                <p className="text-gray-900 font-medium flex items-center">
                  <Mail className="h-4 w-4 mr-2 text-gray-400" />
                  {application.email}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Phone</label>
                <p className="text-gray-900 font-medium flex items-center">
                  <Phone className="h-4 w-4 mr-2 text-gray-400" />
                  {application.phone}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Nationality</label>
                <p className="text-gray-900 font-medium flex items-center">
                  <MapPin className="h-4 w-4 mr-2 text-gray-400" />
                  {application.nationality}
                </p>
              </div>
            </div>
          </motion.div>

          {/* Program Information */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <GraduationCap className="h-5 w-5 mr-2 text-primary" />
              Program Information
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Program</label>
                <p className="text-gray-900 font-medium">{application.program}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Institution</label>
                <p className="text-gray-900 font-medium">{application.institution}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Intake</label>
                <p className="text-gray-900 font-medium">{application.intake}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Application Fee</label>
                <p className="text-gray-900 font-medium">ZMW {application.application_fee}</p>
              </div>
            </div>
          </motion.div>

          {/* Application Timeline */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Calendar className="h-5 w-5 mr-2 text-primary" />
              Timeline
            </h3>
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Application Created</p>
                  <p className="text-xs text-gray-500">{formatDate(application.created_at)}</p>
                </div>
              </div>
              {application.submitted_at && (
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Application Submitted</p>
                    <p className="text-xs text-gray-500">{formatDate(application.submitted_at)}</p>
                  </div>
                </div>
              )}
              {application.review_started_at && (
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Review Started</p>
                    <p className="text-xs text-gray-500">{formatDate(application.review_started_at)}</p>
                  </div>
                </div>
              )}
              {application.decision_date && (
                <div className="flex items-center space-x-3">
                  <div className={`w-2 h-2 rounded-full ${
                    application.status === 'approved' ? 'bg-green-500' : 'bg-red-500'
                  }`}></div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Decision Made</p>
                    <p className="text-xs text-gray-500">{formatDate(application.decision_date)}</p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>

          {/* Payment Information */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <CreditCard className="h-5 w-5 mr-2 text-primary" />
              Payment Status
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Payment Status</label>
                <p className={`font-medium ${
                  application.payment_status === 'verified' ? 'text-green-600' : 
                  application.payment_status === 'pending' ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {(application.payment_status || 'pending').toUpperCase()}
                </p>
              </div>
              {application.payment_verified_at && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Verified Date</label>
                  <p className="text-gray-900 font-medium">{formatDate(application.payment_verified_at)}</p>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-gray-500">Tracking Code</label>
                <p className="text-gray-900 font-medium font-mono">{application.public_tracking_code}</p>
              </div>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  )
}