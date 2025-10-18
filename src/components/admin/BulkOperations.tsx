import React, { useState } from 'react'
import { Check, X, Mail, Users, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MobileOptimizedButton } from '../ui/MobileOptimizedButton'
import { EnhancedSelect } from '../ui/EnhancedFormComponents'
import { EnhancedToast } from '../ui/EnhancedErrorHandling'

interface BulkOperationsProps {
  selectedCount: number
  onStatusUpdate?: (status: string) => Promise<void>
  onPaymentUpdate?: (status: string) => Promise<void>
  onSendEmail?: () => Promise<void>
  onClearSelection: () => void
}

export function BulkOperations({
  selectedCount,
  onStatusUpdate,
  onPaymentUpdate,
  onSendEmail,
  onClearSelection
}: BulkOperationsProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [selectedStatus, setSelectedStatus] = useState('')
  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState('')
  const [showConfirmation, setShowConfirmation] = useState<{
    type: 'status' | 'payment' | 'email'
    action: string
  } | null>(null)

  const handleStatusUpdate = async () => {
    if (!selectedStatus || !onStatusUpdate) return
    
    setIsLoading(true)
    try {
      await onStatusUpdate(selectedStatus)
      setSelectedStatus('')
      onClearSelection()
      setShowConfirmation(null)
    } catch (error) {
      console.error('Failed to update status:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handlePaymentUpdate = async () => {
    if (!selectedPaymentStatus || !onPaymentUpdate) return
    
    setIsLoading(true)
    try {
      await onPaymentUpdate(selectedPaymentStatus)
      setSelectedPaymentStatus('')
      onClearSelection()
      setShowConfirmation(null)
    } catch (error) {
      console.error('Failed to update payment status:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSendEmail = async () => {
    if (!onSendEmail) return
    
    setIsLoading(true)
    try {
      await onSendEmail()
      onClearSelection()
      setShowConfirmation(null)
    } catch (error) {
      console.error('Failed to send emails:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const statusOptions = [
    { value: '', label: 'Select Status' },
    { value: 'submitted', label: 'Submitted' },
    { value: 'under-review', label: 'Under Review' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' }
  ]

  const paymentStatusOptions = [
    { value: '', label: 'Select Payment Status' },
    { value: 'verified', label: 'Verified' },
    { value: 'rejected', label: 'Rejected' }
  ]

  const getActionDescription = () => {
    if (!showConfirmation) return ''
    
    switch (showConfirmation.type) {
      case 'status':
        return `update status to "${showConfirmation.action}"`
      case 'payment':
        return `update payment status to "${showConfirmation.action}"`
      case 'email':
        return 'send notification emails'
      default:
        return 'perform this action'
    }
  }

  return (
    <>
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0">
            <Users className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-1" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200 dark:text-blue-800">
                  Bulk Actions
                </h3>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  {selectedCount} application{selectedCount !== 1 ? 's' : ''} selected
                </p>
              </div>
              
              <MobileOptimizedButton
                onClick={onClearSelection}
                variant="ghost"
                size="sm"
                icon={<X className="w-4 h-4" />}
              >
                Clear Selection
              </MobileOptimizedButton>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Status Update */}
              {onStatusUpdate && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-blue-800 dark:text-blue-200 dark:text-blue-800">
                    Update Status
                  </label>
                  <div className="flex space-x-2">
                    <div className="flex-1">
                      <EnhancedSelect
                        value={selectedStatus}
                        onChange={(e) => setSelectedStatus(e.target.value)}
                        options={statusOptions}
                        className="text-sm"
                      />
                    </div>
                    <MobileOptimizedButton
                      onClick={() => setShowConfirmation({ type: 'status', action: selectedStatus })}
                      disabled={!selectedStatus || isLoading}
                      variant="primary"
                      size="sm"
                      icon={<Check className="w-4 h-4" />}
                    >
                      Update
                    </MobileOptimizedButton>
                  </div>
                </div>
              )}
              
              {/* Payment Update */}
              {onPaymentUpdate && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-blue-800 dark:text-blue-200 dark:text-blue-800">
                    Update Payment
                  </label>
                  <div className="flex space-x-2">
                    <div className="flex-1">
                      <EnhancedSelect
                        value={selectedPaymentStatus}
                        onChange={(e) => setSelectedPaymentStatus(e.target.value)}
                        options={paymentStatusOptions}
                        className="text-sm"
                      />
                    </div>
                    <MobileOptimizedButton
                      onClick={() => setShowConfirmation({ type: 'payment', action: selectedPaymentStatus })}
                      disabled={!selectedPaymentStatus || isLoading}
                      variant="primary"
                      size="sm"
                      icon={<Check className="w-4 h-4" />}
                    >
                      Update
                    </MobileOptimizedButton>
                  </div>
                </div>
              )}
              
              {/* Send Email */}
              {onSendEmail && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-blue-800 dark:text-blue-200 dark:text-blue-800">
                    Send Notifications
                  </label>
                  <MobileOptimizedButton
                    onClick={() => setShowConfirmation({ type: 'email', action: 'notification' })}
                    disabled={isLoading}
                    variant="secondary"
                    size="md"
                    icon={<Mail className="w-4 h-4" />}
                    fullWidth
                  >
                    Send Email Updates
                  </MobileOptimizedButton>
                </div>
              )}
              
              {/* Additional Actions Slot */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-blue-800 dark:text-blue-200 dark:text-blue-800">
                  Quick Actions
                </label>
                <div className="space-y-2">
                  <MobileOptimizedButton
                    onClick={() => {
                      // Export selected applications
                    }}
                    variant="outline"
                    size="sm"
                    fullWidth
                  >
                    Export Selected
                  </MobileOptimizedButton>
                  
                  <MobileOptimizedButton
                    onClick={() => {
                      // Generate reports for selected
                    }}
                    variant="outline"
                    size="sm"
                    fullWidth
                  >
                    Generate Report
                  </MobileOptimizedButton>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 dark:bg-gray-200 rounded-lg p-6 max-w-md w-full">
            <div className="flex items-center space-x-3 mb-4">
              <AlertCircle className="w-6 h-6 text-yellow-600 dark:text-yellow-400 dark:text-yellow-500" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                Confirm Bulk Action
              </h3>
            </div>
            
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Are you sure you want to {getActionDescription()} for {selectedCount} selected application{selectedCount !== 1 ? 's' : ''}?
            </p>
            
            <div className="flex space-x-3">
              <MobileOptimizedButton
                onClick={() => setShowConfirmation(null)}
                variant="outline"
                size="md"
                fullWidth
                disabled={isLoading}
              >
                Cancel
              </MobileOptimizedButton>
              
              <MobileOptimizedButton
                onClick={() => {
                  switch (showConfirmation.type) {
                    case 'status':
                      handleStatusUpdate()
                      break
                    case 'payment':
                      handlePaymentUpdate()
                      break
                    case 'email':
                      handleSendEmail()
                      break
                  }
                }}
                variant="primary"
                size="md"
                fullWidth
                loading={isLoading}
              >
                Confirm
              </MobileOptimizedButton>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// Quick filter buttons component for common operations
export function QuickFilters({
  onFilterChange,
  currentFilters
}: {
  onFilterChange: (filter: string, value: string) => void
  currentFilters: Record<string, string>
}) {
  const quickFilters = [
    { label: 'Pending Review', filter: 'status', value: 'submitted' },
    { label: 'Under Review', filter: 'status', value: 'under-review' },
    { label: 'Payment Pending', filter: 'paymentStatus', value: 'pending' },
    { label: 'Today\'s Applications', filter: 'dateRange', value: 'today' },
    { label: 'This Week', filter: 'dateRange', value: 'week' },
    { label: 'High Scores (80%+)', filter: 'eligibilityRange', value: '80-100' }
  ]

  return (
    <div className="flex flex-wrap gap-2">
      {quickFilters.map((filter) => {
        const isActive = currentFilters[filter.filter] === filter.value
        
        return (
          <MobileOptimizedButton
            key={`${filter.filter}-${filter.value}`}
            onClick={() => onFilterChange(filter.filter, isActive ? '' : filter.value)}
            variant={isActive ? 'primary' : 'outline'}
            size="sm"
            className={cn(
              'transition-colors',
              isActive && 'bg-blue-600 text-white border-blue-600'
            )}
          >
            {filter.label}
          </MobileOptimizedButton>
        )
      })}
    </div>
  )
}
