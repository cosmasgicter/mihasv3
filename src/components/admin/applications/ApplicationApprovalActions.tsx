import React, { useState } from 'react'
import { CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'

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
  const confirmDialog = useConfirmDialog()

  const handleStatusUpdate = async (newStatus: string) => {
    if (updatingStatus || disabled) return
    
    // Confirm critical actions
    if (newStatus === 'rejected') {
      const confirmed = await confirmDialog.confirm({
        title: 'Reject Application',
        message: 'This application will be rejected. The applicant will be notified.',
        confirmText: 'Reject',
        variant: 'danger'
      })
      if (!confirmed) return
    }
    
    if (newStatus === 'approved') {
      const confirmed = await confirmDialog.confirm({
        title: 'Approve Application',
        message: 'The applicant will be notified of approval. This action cannot be undone.',
        confirmText: 'Approve',
        variant: 'info'
      })
      if (!confirmed) return
    }
    
    try {
      setUpdatingStatus(true)
      await onStatusUpdate(applicationId, newStatus)
    } catch (error) {
      console.error('Status update failed:', error)
    } finally {
      setUpdatingStatus(false)
    }
  }

  const handlePaymentUpdate = async (newStatus: string) => {
    if (updatingPayment || disabled) return
    
    // Confirm payment actions
    if (newStatus === 'verified') {
      const confirmed = await confirmDialog.confirm({
        title: 'Verify Payment',
        message: 'Confirm that payment has been received and verified.',
        confirmText: 'Verify',
        variant: 'info'
      })
      if (!confirmed) return
    }
    
    if (newStatus === 'rejected') {
      const confirmed = await confirmDialog.confirm({
        title: 'Reject Payment',
        message: 'The payment will be marked as rejected. The applicant will be notified.',
        confirmText: 'Reject',
        variant: 'danger'
      })
      if (!confirmed) return
    }
    
    try {
      setUpdatingPayment(true)
      await onPaymentStatusUpdate(applicationId, newStatus)
    } catch (error) {
      console.error('Payment status update failed:', error)
    } finally {
      setUpdatingPayment(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Application Status Controls */}
      <div>
        <label className="text-xs font-medium text-gray-900 mb-1 block">
          Application Status
        </label>
        <div className="flex gap-1">
          {currentStatus === 'submitted' && (
            <button
              onClick={() => handleStatusUpdate('under_review')}
              disabled={updatingStatus || disabled}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1"
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
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1"
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
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1"
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
                  ? 'bg-green-100 text-green-800 border border-green-300' 
                  : 'bg-red-100 text-red-800 border border-red-300'
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
        <label className="text-xs font-medium text-gray-900 mb-1 block">
          Payment Status
        </label>
        <div className="flex gap-1">
          {currentPaymentStatus === 'pending_review' && (
            <>
              <button
                onClick={() => handlePaymentUpdate('verified')}
                disabled={updatingPayment || disabled}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1"
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
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1"
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
                  ? 'bg-green-100 text-green-800 border border-green-300' 
                  : 'bg-red-100 text-red-800 border border-red-300'
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
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={confirmDialog.handleCancel}
        onConfirm={confirmDialog.handleConfirm}
        title={confirmDialog.options.title}
        message={confirmDialog.options.message}
        confirmText={confirmDialog.options.confirmText}
        cancelText={confirmDialog.options.cancelText}
        variant={confirmDialog.options.variant}
      />
    </div>
  )
}