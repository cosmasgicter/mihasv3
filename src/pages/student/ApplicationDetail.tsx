import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
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
    if (!id) return
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
        return <Clock className="h-6 w-6 text-primary" />
      default:
        return <AlertCircle className="h-6 w-6 text-yellow-500" />
    }
  }

  if (loading) {
    return (
      <div className="page-container bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <main className="w-full">
          <div className="content-wrapper py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-skeleton rounded w-1/3"></div>
            <div className="bg-card rounded-2xl shadow-lg p-8 space-y-4">
              <div className="h-6 bg-skeleton rounded w-1/2"></div>
              <div className="h-4 bg-skeleton rounded w-3/4"></div>
              <div className="h-4 bg-skeleton rounded w-1/2"></div>
            </div>
          </div>
          </div>
        </main>
      </div>
    )
  }

  if (error || !application) {
    return (
      <div className="page-container bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <main className="w-full">
          <div className="content-wrapper py-8">
          <div className="text-center py-16">
            <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-foreground mb-2">Application Not Found</h2>
            <p className="text-muted-foreground mb-6">{error || 'The application you are looking for does not exist.'}</p>
            <Link to="/student/dashboard">
              <Button>Return to Dashboard</Button>
            </Link>
          </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="page-container bg-gradient-to-br from-blue-50 via-white to-purple-50">
      
      <main className="w-full">
        <div className="content-wrapper py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <Link to="/student/dashboard" className="inline-flex items-center text-primary hover:text-blue-600/80 mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Link>
          
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground break-words">Application Details</h1>
              <p className="text-muted-foreground break-all">#{application.application_number}</p>
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
          className="bg-card rounded-2xl shadow-lg border border-border p-6 mb-8"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Application Slip</h3>
              <p className="text-muted-foreground text-sm">Download or email your official application slip</p>
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
            className="bg-card rounded-2xl shadow-lg border border-border p-6"
          >
            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center">
              <User className="h-5 w-5 mr-2 text-primary" />
              Personal Information
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Full Name</label>
                <p className="text-foreground font-medium break-words">{application.full_name}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Email</label>
                <p className="text-foreground font-medium flex items-center">
                  <Mail className="h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" />
                  <span className="break-all">{application.email}</span>
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Phone</label>
                <p className="text-foreground font-medium flex items-center">
                  <Phone className="h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" />
                  <span className="break-all">{application.phone}</span>
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Nationality</label>
                <p className="text-foreground font-medium flex items-center">
                  <MapPin className="h-4 w-4 mr-2 text-muted-foreground" />
                  {application.nationality || 'Zambian'}
                </p>
              </div>
            </div>
          </motion.div>

          {/* Program Information */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-card rounded-2xl shadow-lg border border-border p-6"
          >
            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center">
              <GraduationCap className="h-5 w-5 mr-2 text-primary" />
              Program Information
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Program</label>
                <p className="text-foreground font-medium break-words">{application.program}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Institution</label>
                <p className="text-foreground font-medium break-words">
                  {application.institution === 'KATC' ? 'Kalulushi Training Centre' : 
                   application.institution === 'MIHAS' ? 'Mukuba Institute of Health and Allied Sciences' : 
                   application.institution}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Intake</label>
                <p className="text-foreground font-medium break-words">{application.intake}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Application Fee</label>
                <p className="text-foreground font-medium">ZMW {application.application_fee}</p>
              </div>
            </div>
          </motion.div>

          {/* Application Timeline */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-card rounded-2xl shadow-lg border border-border p-6"
          >
            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center">
              <Calendar className="h-5 w-5 mr-2 text-primary" />
              Timeline
            </h3>
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-accent/10/300 rounded-full"></div>
                <div>
                  <p className="text-sm font-medium text-foreground">Application Created</p>
                  <p className="text-xs text-muted-foreground">{formatDate(application.created_at)}</p>
                </div>
              </div>
              {application.submitted_at && (
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-primary/5/300 rounded-full"></div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Application Submitted</p>
                    <p className="text-xs text-muted-foreground">{formatDate(application.submitted_at)}</p>
                  </div>
                </div>
              )}
              {application.review_started_at && (
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-accent/5/300 rounded-full"></div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Review Started</p>
                    <p className="text-xs text-muted-foreground">{formatDate(application.review_started_at)}</p>
                  </div>
                </div>
              )}
              {application.decision_date && (
                <div className="flex items-center space-x-3">
                  <div className={`w-2 h-2 rounded-full ${
                    application.status === 'approved' ? 'bg-green-500' : 'bg-red-500'
                  }`}></div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Decision Made</p>
                    <p className="text-xs text-muted-foreground">{formatDate(application.decision_date)}</p>
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
            className="bg-card rounded-2xl shadow-lg border border-border p-6"
          >
            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center">
              <CreditCard className="h-5 w-5 mr-2 text-primary" />
              Payment Status
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Payment Status</label>
                <p className={`font-medium ${
                  application.payment_status === 'verified' ? 'text-green-600' : 
                  application.payment_status === 'pending' ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {(application.payment_status || 'pending').toUpperCase()}
                </p>
              </div>
              {application.payment_verified_at && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Verified Date</label>
                  <p className="text-foreground font-medium">{formatDate(application.payment_verified_at)}</p>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-muted-foreground">Tracking Code</label>
                <p className="text-foreground font-medium font-mono break-all">{application.public_tracking_code}</p>
              </div>
            </div>
          </motion.div>
        </div>
        </div>
      </main>
    </div>
  )
}