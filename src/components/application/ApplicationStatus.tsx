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
          color: 'text-success',
          bg: 'bg-green-50',
          border: 'border-green-200',
          label: 'Approved',
          description: 'Your application has been approved'
        }
      case 'rejected':
        return {
          icon: XCircle,
          color: 'text-error',
          bg: 'bg-red-50',
          border: 'border-red-200',
          label: 'Rejected',
          description: 'Your application was not successful'
        }
      case 'under_review':
        return {
          icon: Clock,
          color: 'text-primary',
          bg: 'bg-blue-50',
          border: 'border-blue-200',
          label: 'Under Review',
          description: 'Your application is being reviewed'
        }
      case 'submitted':
        return {
          icon: AlertTriangle,
          color: 'text-warning',
          bg: 'bg-yellow-50',
          border: 'border-yellow-200',
          label: 'Submitted',
          description: 'Waiting for review to begin'
        }
      case 'draft':
        return {
          icon: FileText,
          color: 'text-foreground',
          bg: 'bg-muted',
          border: 'border-border',
          label: 'Draft',
          description: 'Application not yet submitted'
        }
      default:
        return {
          icon: Clock,
          color: 'text-foreground',
          bg: 'bg-muted',
          border: 'border-border',
          label: 'Unknown',
          description: 'Status unknown'
        }
    }
  }

  const getPaymentStatusConfig = (paymentStatus: string) => {
    switch (paymentStatus) {
      case 'verified':
        return {
          color: 'text-success',
          label: 'Payment Verified',
          icon: CheckCircle
        }
      case 'rejected':
        return {
          color: 'text-error',
          label: 'Payment Rejected',
          icon: XCircle
        }
      default:
        return {
          color: 'text-warning',
          label: 'Payment Pending',
          icon: Clock
        }
    }
  }

  const getEligibilityConfig = (eligibilityStatus: string, score?: number) => {
    switch (eligibilityStatus) {
      case 'eligible':
        return {
          color: 'text-success',
          label: 'Eligible',
          icon: CheckCircle
        }
      case 'not_eligible':
        return {
          color: 'text-error',
          label: 'Not Eligible',
          icon: XCircle
        }
      default:
        return {
          color: 'text-warning',
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
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary-foreground">
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
          <p className="text-sm text-gray-900 mt-1">
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
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary-foreground">
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
        return 'bg-accent/10 text-accent-foreground'
      case 'rejected':
        return 'bg-destructive/10 text-destructive-foreground'
      case 'under_review':
        return 'bg-primary/10 text-primary-foreground'
      case 'submitted':
        return 'bg-accent/10 text-accent-foreground'
      case 'draft':
        return 'bg-accent text-foreground'
      default:
        return 'bg-accent text-foreground'
    }
  }

  const sanitizedStatus = status.replace(/[<>&"'`]/g, '').replace(/_/g, ' ').substring(0, 50).toUpperCase()
  
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(status)} ${className}`}>
      {sanitizedStatus}
    </span>
  )
}