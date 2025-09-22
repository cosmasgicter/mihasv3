import React, { useCallback, useMemo, useState } from 'react'
import { sanitizeHtml } from '@/lib/sanitizer'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Eye, FileText, CreditCard, Clock, CheckCircle, XCircle, AlertTriangle, User, Calendar, Phone, Mail, GraduationCap, Building } from 'lucide-react'

interface ApplicationSummary {
  id: string
  application_number: string
  full_name: string
  email: string
  phone: string
  program: string
  intake: string
  institution: string
  status: string
  payment_status: string
  payment_verified_at: string | null
  payment_verified_by: string | null
  payment_verified_by_name: string | null
  payment_verified_by_email: string | null
  last_payment_audit_id: number | null
  last_payment_audit_at: string | null
  last_payment_audit_by_name: string | null
  last_payment_audit_by_email: string | null
  last_payment_audit_notes: string | null
  last_payment_reference: string | null
  application_fee: number
  paid_amount: number
  submitted_at: string
  created_at: string
  result_slip_url: string
  extra_kyc_url: string
  pop_url: string
  grades_summary: string
  total_subjects: number
  average_grade: number
  days_since_submission: number
}

interface ApplicationsTableProps {
  applications: ApplicationSummary[]
  totalCount: number
  loadedCount: number
  hasMore: boolean
  isLoadingMore: boolean
  onLoadMore: () => void | Promise<void>
  onStatusUpdate: (id: string, status: string) => void
  onPaymentStatusUpdate: (id: string, status: string) => void
  onViewDetails: (id: string) => void
}



export function ApplicationsTable({
  applications,
  totalCount,
  loadedCount,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onStatusUpdate,
  onPaymentStatusUpdate,
  onViewDetails
}: ApplicationsTableProps) {
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [updatingPayment, setUpdatingPayment] = useState<string | null>(null)

  const getStatusBadge = useCallback((status: string) => {
    const statusConfig = {
      draft: { color: 'bg-gray-100 text-gray-800', icon: Clock },
      submitted: { color: 'bg-blue-100 text-blue-800', icon: AlertTriangle },
      under_review: { color: 'bg-yellow-100 text-yellow-800', icon: Eye },
      approved: { color: 'bg-green-100 text-green-800', icon: CheckCircle },
      rejected: { color: 'bg-red-100 text-red-800', icon: XCircle }
    }

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft
    const Icon = config.icon

    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        <Icon className="h-3 w-3" />
        {status.replace('_', ' ').toUpperCase()}
      </span>
    )
  }, [])

  const getPaymentBadge = useCallback((paymentStatus: string) => {
    const paymentConfig = {
      pending_review: { color: 'bg-yellow-100 text-yellow-800', icon: Clock },
      verified: { color: 'bg-green-100 text-green-800', icon: CheckCircle },
      rejected: { color: 'bg-red-100 text-red-800', icon: XCircle }
    }

    const config = paymentConfig[paymentStatus as keyof typeof paymentConfig] || paymentConfig.pending_review
    const Icon = config.icon

    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        <Icon className="h-3 w-3" />
        {paymentStatus.replace('_', ' ').toUpperCase()}
      </span>
    )
  }, [])

  const handleStatusUpdate = useCallback(async (id: string, status: string) => {
    try {
      setUpdatingStatus(id)
      await onStatusUpdate(id, status)
    } catch (error) {
      console.error('Failed to update status:', error)
    } finally {
      setUpdatingStatus(null)
    }
  }, [onStatusUpdate])

  const handlePaymentUpdate = useCallback(async (id: string, status: string) => {
    try {
      setUpdatingPayment(id)
      await onPaymentStatusUpdate(id, status)
    } catch (error) {
      console.error('Failed to update payment status:', error)
    } finally {
      setUpdatingPayment(null)
    }
  }, [onPaymentStatusUpdate])

  return (
    <div className="space-y-6">
      {applications.length > 0 ? (
        <>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {applications.map((app) => (
              <ApplicationCard
                key={app.id}
                application={app}
                getStatusBadge={getStatusBadge}
                getPaymentBadge={getPaymentBadge}
                onStatusUpdate={handleStatusUpdate}
                onPaymentStatusUpdate={handlePaymentUpdate}
                onViewDetails={onViewDetails}
                updatingStatus={updatingStatus === app.id}
                updatingPayment={updatingPayment === app.id}
              />
            ))}
          </div>
          
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-600">
                Showing <span className="font-semibold text-gray-900">{loadedCount}</span>
                {totalCount > 0 && (
                  <>
                    {' '}of{' '}
                    <span className="font-semibold text-gray-900">{totalCount}</span>
                  </>
                )}{' '}
                applications
              </div>
              {totalCount > 0 && (
                <div className="h-4 w-px bg-gray-300" />
              )}
              <div className="text-xs text-gray-500">
                {Math.round((loadedCount / Math.max(totalCount, 1)) * 100)}% loaded
              </div>
            </div>

            {hasMore ? (
              <button
                type="button"
                onClick={onLoadMore}
                disabled={isLoadingMore}
                className="inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:from-blue-700 hover:to-blue-800 hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isLoadingMore && <LoadingSpinner size="sm" className="mr-2" />}
                {isLoadingMore ? 'Loading more...' : 'Load more applications'}
              </button>
            ) : (
              totalCount > 0 && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  All applications loaded
                </div>
              )
            )}
          </div>
        </>
      ) : (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <FileText className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No applications found</h3>
          <p className="text-sm text-gray-500">Try adjusting your filters to see more results.</p>
        </div>
      )}
    </div>
  )
}

interface ApplicationCardProps {
  application: ApplicationSummary
  getStatusBadge: (status: string) => JSX.Element
  getPaymentBadge: (status: string) => JSX.Element
  onStatusUpdate: (id: string, status: string) => void
  onPaymentStatusUpdate: (id: string, status: string) => void
  onViewDetails: (id: string) => void
  updatingStatus: boolean
  updatingPayment: boolean
}

const ApplicationCard: React.FC<ApplicationCardProps> = ({ 
  application: app, 
  getStatusBadge, 
  getPaymentBadge, 
  onStatusUpdate, 
  onPaymentStatusUpdate,
  onViewDetails,
  updatingStatus,
  updatingPayment
}) => {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const getGradeColor = (grade: number) => {
    if (grade <= 3) return 'text-green-600'
    if (grade <= 6) return 'text-yellow-600'
    return 'text-red-600'
  }

  const documentsCount = [app.result_slip_url, app.extra_kyc_url, app.pop_url].filter(Boolean).length

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg hover:border-gray-300 transition-all duration-200 group">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <User className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <h3 className="font-semibold text-gray-900 truncate">{app.full_name}</h3>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className="font-mono">#{app.application_number}</span>
            <span className="text-gray-300">•</span>
            <Calendar className="h-3 w-3" />
            <span>{formatDate(app.submitted_at || app.created_at)}</span>
          </div>
        </div>
        {getStatusBadge(app.status)}
      </div>

      {/* Contact Info */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Mail className="h-3 w-3 text-gray-400" />
          <span className="truncate">{app.email}</span>
        </div>
        {app.phone && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Phone className="h-3 w-3 text-gray-400" />
            <span>{app.phone}</span>
          </div>
        )}
      </div>

      {/* Program Info */}
      <div className="bg-gray-50 rounded-lg p-3 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <GraduationCap className="h-4 w-4 text-blue-500" />
          <span className="font-medium text-gray-900 text-sm">{app.program}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Building className="h-3 w-3 text-gray-400" />
          <span>{app.institution}</span>
          <span className="text-gray-300">•</span>
          <span>{app.intake}</span>
        </div>
      </div>

      {/* Payment & Grades */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div className="text-xs text-gray-500 mb-1">Payment Status</div>
          {getPaymentBadge(app.payment_status)}
          <div className="text-sm font-medium text-gray-900 mt-1">
            K{app.paid_amount || 0} / K{app.application_fee}
          </div>
        </div>
        
        {app.total_subjects > 0 && (
          <div>
            <div className="text-xs text-gray-500 mb-1">Academic</div>
            <div className="text-sm">
              <span className="text-gray-700">{app.total_subjects} subjects</span>
              {app.average_grade && (
                <div className={`font-medium ${getGradeColor(app.average_grade)}`}>
                  Avg: {app.average_grade.toFixed(1)}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Documents */}
      {documentsCount > 0 && (
        <div className="flex items-center gap-2 mb-4 p-2 bg-blue-50 rounded-lg">
          <FileText className="h-4 w-4 text-blue-500" />
          <span className="text-sm text-blue-700">{documentsCount} document{documentsCount > 1 ? 's' : ''} uploaded</span>
        </div>
      )}

      {/* Status Controls */}
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-gray-700 mb-1 block">Application Status</label>
          <select
            value={app.status}
            onChange={(e) => onStatusUpdate(app.id, e.target.value)}
            disabled={updatingStatus}
            className="block w-full text-sm rounded-lg border-gray-300 focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50"
          >
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="under_review">Under Review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-700 mb-1 block">Payment Status</label>
          <select
            value={app.payment_status}
            onChange={(e) => onPaymentStatusUpdate(app.id, e.target.value)}
            disabled={updatingPayment}
            className="block w-full text-sm rounded-lg border-gray-300 focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50"
          >
            <option value="pending_review">Pending Review</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
        <button
          onClick={() => onViewDetails(app.id)}
          className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-sm py-2.5 px-4 rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 font-medium flex items-center justify-center gap-2 group-hover:shadow-md"
        >
          <Eye className="h-4 w-4" />
          View Details
        </button>
        
        {documentsCount > 0 && (
          <div className="flex gap-1">
            {app.result_slip_url && (
              <a
                href={app.result_slip_url}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 p-2.5 rounded-lg transition-colors"
                title="Result Slip"
              >
                <FileText className="h-4 w-4" />
              </a>
            )}
            {app.pop_url && (
              <a
                href={app.pop_url}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 p-2.5 rounded-lg transition-colors"
                title="Proof of Payment"
              >
                <CreditCard className="h-4 w-4" />
              </a>
            )}
          </div>
        )}
      </div>

      {/* Loading Overlays */}
      {(updatingStatus || updatingPayment) && (
        <div className="absolute inset-0 bg-white bg-opacity-75 rounded-xl flex items-center justify-center">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <LoadingSpinner size="sm" />
            <span>Updating...</span>
          </div>
        </div>
      )}
    </div>
  )
}
