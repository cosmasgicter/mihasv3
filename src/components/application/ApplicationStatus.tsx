import React from 'react'
import { CheckCircle, XCircle, Clock, AlertTriangle, FileText, Star } from 'lucide-react'

interface ApplicationStatusProps {
  status: string
  paymentStatus?: string
  eligibilityStatus?: string
  eligibilityScore?: number
  showDetails?: boolean
  className?: string
}

export function ApplicationStatus({ 
  status, 
  paymentStatus, 
  eligibilityStatus, 
  eligibilityScore,
  showDetails = false,
  className = '' 
}: ApplicationStatusProps) {
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'approved':
        return {
          icon: CheckCircle,
          color: 'text-green-600',
          bg: 'bg-green-50',
          border: 'border-green-200',
          label: 'Approved',
          description: 'Your application has been approved'
        }
      case 'rejected':
        return {
          icon: XCircle,
          color: 'text-red-600',
          bg: 'bg-red-50',
          border: 'border-red-200',
          label: 'Rejected',
          description: 'Your application was not successful'
        }
      case 'under_review':
        return {
          icon: Clock,
          color: 'text-blue-600',
          bg: 'bg-blue-50',
          border: 'border-blue-200',
          label: 'Under Review',
          description: 'Your application is being reviewed'
        }
      case 'submitted':
        return {
          icon: AlertTriangle,
          color: 'text-yellow-600',
          bg: 'bg-yellow-50',
          border: 'border-yellow-200',
          label: 'Submitted',
          description: 'Waiting for review to begin'
        }
      case 'draft':
        return {
          icon: FileText,
          color: 'text-gray-600',
          bg: 'bg-gray-50',
          border: 'border-gray-200',
          label: 'Draft',
          description: 'Application not yet submitted'
        }
      default:
        return {
          icon: Clock,
          color: 'text-gray-600',
          bg: 'bg-gray-50',
          border: 'border-gray-200',
          label: 'Unknown',
          description: 'Status unknown'
        }
    }
  }

  const getPaymentStatusConfig = (paymentStatus: string) => {
    switch (paymentStatus) {
      case 'verified':
        return {
          color: 'text-green-600',
          label: 'Payment Verified',
          icon: CheckCircle
        }
      case 'rejected':
        return {
          color: 'text-red-600',
          label: 'Payment Rejected',
          icon: XCircle
        }
      default:
        return {
          color: 'text-yellow-600',
          label: 'Payment Pending',
          icon: Clock
        }
    }
  }

  const getEligibilityConfig = (eligibilityStatus: string, score?: number) => {
    switch (eligibilityStatus) {
      case 'eligible':
        return {
          color: 'text-green-600',
          label: 'Eligible',
          icon: CheckCircle
        }
      case 'not_eligible':
        return {
          color: 'text-red-600',
          label: 'Not Eligible',
          icon: XCircle
        }
      default:
        return {
          color: 'text-yellow-600',
          label: 'Pending Review',
          icon: Clock
        }
    }
  }

  const statusConfig = getStatusConfig(status)
  const paymentConfig = paymentStatus ? getPaymentStatusConfig(paymentStatus) : null
  const eligibilityConfig = eligibilityStatus ? getEligibilityConfig(eligibilityStatus, eligibilityScore) : null
  const StatusIcon = statusConfig.icon

  if (!showDetails) {
    return (
      <div className={`inline-flex items-center space-x-2 ${className}`}>
        <StatusIcon className={`h-4 w-4 ${statusConfig.color}`} />
        <span className={`text-sm font-medium ${statusConfig.color}`}>
          {statusConfig.label}
        </span>
        {eligibilityScore && (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            <Star className="h-3 w-3 mr-1" />
            {eligibilityScore}%
          </span>
        )}
      </div>
    )
  }

  return (
    <div className={`${statusConfig.bg} ${statusConfig.border} border rounded-lg p-4 ${className}`}>
      <div className="flex items-start space-x-3">
        <StatusIcon className={`h-6 w-6 ${statusConfig.color} mt-0.5`} />
        <div className="flex-1">
          <h3 className={`text-lg font-semibold ${statusConfig.color}`}>
            {statusConfig.label}
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            {statusConfig.description}
          </p>
          
          {/* Additional Status Details */}
          {(paymentConfig || eligibilityConfig) && (
            <div className="mt-3 space-y-2">
              {paymentConfig && (
                <div className="flex items-center space-x-2">
                  <paymentConfig.icon className={`h-4 w-4 ${paymentConfig.color}`} />
                  <span className={`text-sm ${paymentConfig.color}`}>
                    {paymentConfig.label}
                  </span>
                </div>
              )}
              
              {eligibilityConfig && (
                <div className="flex items-center space-x-2">
                  <eligibilityConfig.icon className={`h-4 w-4 ${eligibilityConfig.color}`} />
                  <span className={`text-sm ${eligibilityConfig.color}`}>
                    {eligibilityConfig.label}
                  </span>
                  {eligibilityScore && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      <Star className="h-3 w-3 mr-1" />
                      Score: {eligibilityScore}%
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function ApplicationStatusBadge({ 
  status, 
  className = '' 
}: { 
  status: string
  className?: string 
}) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800'
      case 'rejected':
        return 'bg-red-100 text-red-800'
      case 'under_review':
        return 'bg-blue-100 text-blue-800'
      case 'submitted':
        return 'bg-yellow-100 text-yellow-800'
      case 'draft':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const sanitizedStatus = status.replace(/[<>&"'`]/g, '').replace(/_/g, ' ').substring(0, 50).toUpperCase()
  
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(status)} ${className}`}>
      {sanitizedStatus}
    </span>
  )
}