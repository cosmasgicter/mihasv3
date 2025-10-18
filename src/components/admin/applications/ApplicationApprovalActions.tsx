import React, { useState } from 'react'
import { CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

interface ApplicationApprovalActionsProps {
  applicationId: string
  currentStatus: string
  currentPaymentStatus: string
  onStatusUpdate: (id: string, status: string) => Promise<void>
  onPaymentStatusUpdate: (id: string, status: string) => Promise<void>
  disabled?: boolean
}

export function ApplicationApprovalActions({
  applicationId,
  currentStatus,
  currentPaymentStatus,
  onStatusUpdate,
  onPaymentStatusUpdate,
  disabled = false
}: ApplicationApprovalActionsProps) {
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [updatingPayment, setUpdatingPayment] = useState(false)

  const handleStatusUpdate = async (newStatus: string) => {
    if (updatingStatus || disabled) return
    
    // Confirm critical actions
    if (newStatus === 'rejected') {
      if (!confirm('Are you sure you want to reject this application? This action cannot be undone.')) {
        return
      }
    }
    
    if (newStatus === 'approved') {
      if (!confirm('Are you sure you want to approve this application? The applicant will be notified.')) {
        return
      }
    }
    
    try {
      setUpdatingStatus(true)
      await onStatusUpdate(applicationId, newStatus)
    } catch (error) {
      console.error('Status update failed:', error)
      alert(`Failed to update status: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setUpdatingStatus(false)
    }
  }

  const handlePaymentUpdate = async (newStatus: string) => {
    if (updatingPayment || disabled) return
    
    try {
      setUpdatingPayment(true)
      await onPaymentStatusUpdate(applicationId, newStatus)
    } catch (error) {
      console.error('Payment status update failed:', error)
      alert(`Failed to update payment status: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setUpdatingPayment(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Application Status Controls */}
      <div>
        <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">
          Application Status
        </label>
        <div className="flex gap-1">
          {currentStatus === 'submitted' && (
            <button
              onClick={() => handleStatusUpdate('under_review')}
              disabled={updatingStatus || disabled}
              className="flex-1 bg-blue-50 dark:bg-blue-950/300 hover:bg-blue-600 disabled:opacity-50 text-white text-xs py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1"
            >
              {updatingStatus ? (
                <LoadingSpinner size="sm" />
              ) : (
                <>
                  <Clock className="h-3 w-3" />
                  Review
                </>
              )}
            </button>
          )}
          
          {currentStatus === 'under_review' && (
            <>
              <button
                onClick={() => handleStatusUpdate('approved')}
                disabled={updatingStatus || disabled}
                className="flex-1 bg-green-50 dark:bg-green-950/300 hover:bg-green-600 disabled:opacity-50 text-white text-xs py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1"
              >
                {updatingStatus ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <>
                    <CheckCircle className="h-3 w-3" />
                    Approve
                  </>
                )}
              </button>
              <button
                onClick={() => handleStatusUpdate('rejected')}
                disabled={updatingStatus || disabled}
                className="flex-1 bg-red-50 dark:bg-red-950/300 hover:bg-red-600 disabled:opacity-50 text-white text-xs py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1"
              >
                {updatingStatus ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <>
                    <XCircle className="h-3 w-3" />
                    Reject
                  </>
                )}
              </button>
            </>
          )}
          
          {(currentStatus === 'approved' || currentStatus === 'rejected') && (
            <div className="flex-1 text-center py-2">
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                currentStatus === 'approved' 
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200' 
                  : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200'
              }`}>
                {currentStatus === 'approved' ? (
                  <>
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Approved
                  </>
                ) : (
                  <>
                    <XCircle className="h-3 w-3 mr-1" />
                    Rejected
                  </>
                )}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Payment Status Controls */}
      <div>
        <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">
          Payment Status
        </label>
        <div className="flex gap-1">
          {currentPaymentStatus === 'pending_review' && (
            <>
              <button
                onClick={() => handlePaymentUpdate('verified')}
                disabled={updatingPayment || disabled}
                className="flex-1 bg-green-50 dark:bg-green-950/300 hover:bg-green-600 disabled:opacity-50 text-white text-xs py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1"
              >
                {updatingPayment ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <>
                    <CheckCircle className="h-3 w-3" />
                    Verify
                  </>
                )}
              </button>
              <button
                onClick={() => handlePaymentUpdate('rejected')}
                disabled={updatingPayment || disabled}
                className="flex-1 bg-red-50 dark:bg-red-950/300 hover:bg-red-600 disabled:opacity-50 text-white text-xs py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1"
              >
                {updatingPayment ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <>
                    <XCircle className="h-3 w-3" />
                    Reject
                  </>
                )}
              </button>
            </>
          )}
          
          {(currentPaymentStatus === 'verified' || currentPaymentStatus === 'rejected') && (
            <div className="flex-1 text-center py-2">
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                currentPaymentStatus === 'verified' 
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200' 
                  : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200'
              }`}>
                {currentPaymentStatus === 'verified' ? (
                  <>
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Verified
                  </>
                ) : (
                  <>
                    <XCircle className="h-3 w-3 mr-1" />
                    Rejected
                  </>
                )}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}