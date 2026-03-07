import React, { useCallback, useState } from 'react'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { FileText, CheckCircle } from 'lucide-react'
import { useToastStore } from '@/components/ui/Toast'
import { ApplicationCard, ApplicationSummary } from './ApplicationCard'
import { getPaymentStatusLabel } from '@/lib/paymentStatus'

const formatStatusLabel = (value: string) =>
  value.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())

interface ApplicationsTableProps {
  applications: ApplicationSummary[]
  totalCount: number
  loadedCount: number
  hasMore: boolean
  isLoadingMore: boolean
  onLoadMore: () => void | Promise<void>
  onStatusUpdate: (id: string, status: string) => void | Promise<void>
  onPaymentStatusUpdate: (id: string, status: string, verificationNotes?: string) => void | Promise<void>
  onViewDetails: (id: string) => void
  selectedIds?: string[]
  onSelectionChange?: (ids: string[]) => void
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
  onViewDetails,
  selectedIds = [],
  onSelectionChange
}: ApplicationsTableProps) {
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [updatingPayment, setUpdatingPayment] = useState<string | null>(null)
  const { error: showError, success: showSuccess } = useToastStore()

  const handleSelect = (id: string, selected: boolean) => {
    if (!onSelectionChange) return
    
    const newSelection = selected
      ? [...selectedIds, id]
      : selectedIds.filter(selectedId => selectedId !== id)
    
    onSelectionChange(newSelection)
  }

  const handleSelectAll = () => {
    if (!onSelectionChange) return
    
    const allSelected = selectedIds.length === applications.length
    onSelectionChange(allSelected ? [] : applications.map(app => app.id))
  }

  const handleStatusUpdate = useCallback(async (id: string, status: string) => {
    try {
      setUpdatingStatus(id)
      await onStatusUpdate(id, status)
      showSuccess('Status Updated', `Application status changed to ${formatStatusLabel(status)}`)
    } catch (error) {
      console.error('Failed to update status:', error)
      showError('Update Failed', error instanceof Error ? error.message : 'Failed to update application status')
    } finally {
      setUpdatingStatus(null)
    }
  }, [onStatusUpdate, showSuccess, showError])

  const handlePaymentUpdate = useCallback(async (id: string, status: string, verificationNotes?: string) => {
    try {
      setUpdatingPayment(id)
      await onPaymentStatusUpdate(id, status, verificationNotes)
      showSuccess('Payment Updated', `Payment status changed to ${getPaymentStatusLabel(status)}`)
    } catch (error) {
      console.error('Failed to update payment status:', error)
      showError('Update Failed', error instanceof Error ? error.message : 'Failed to update payment status')
    } finally {
      setUpdatingPayment(null)
    }
  }, [onPaymentStatusUpdate, showSuccess, showError])

  return (
    <div className="space-y-6">
      {applications.length > 0 ? (
        <>
          {/* Select All Header */}
          {onSelectionChange && (
            <div className="bg-card rounded-xl border border-border p-4 mb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === applications.length && applications.length > 0}
                    onChange={handleSelectAll}
                    className="h-4 w-4 text-primary focus:ring-blue-500 border-input rounded"
                  />
                  <span className="text-sm font-medium text-foreground">
                    {selectedIds.length > 0 ? `${selectedIds.length} selected` : 'Select all'}
                  </span>
                </div>
                {selectedIds.length > 0 && (
                  <button
                    onClick={() => onSelectionChange([])}
                    className="text-sm text-foreground hover:text-foreground"
                  >
                    Clear selection
                  </button>
                )}
              </div>
            </div>
          )}
          
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {applications.map((app) => (
              <ApplicationCard
                key={app.id}
                application={app}
                onStatusUpdate={handleStatusUpdate}
                onPaymentStatusUpdate={handlePaymentUpdate}
                onViewDetails={onViewDetails}
                updatingStatus={updatingStatus === app.id}
                updatingPayment={updatingPayment === app.id}
                isSelected={selectedIds.includes(app.id)}
                onSelect={onSelectionChange ? handleSelect : undefined}
              />
            ))}
          </div>
          
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-card rounded-xl p-6 border border-border shadow-sm">
            <div className="flex items-center gap-4">
              <div className="text-sm text-foreground">
                Showing <span className="font-semibold text-foreground">{loadedCount}</span>
                {totalCount > 0 && (
                  <>
                    {' '}of{' '}
                    <span className="font-semibold text-foreground">{totalCount}</span>
                  </>
                )}{' '}
                applications
              </div>
              {totalCount > 0 && (
                <div className="h-4 w-px bg-muted" />
              )}
              <div className="text-xs text-foreground">
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
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <CheckCircle className="h-4 w-4 text-success" />
                  All applications loaded
                </div>
              )
            )}
          </div>
        </>
      ) : (
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <div className="mx-auto w-16 h-16 bg-accent rounded-full flex items-center justify-center mb-4">
            <FileText className="h-8 w-8 text-foreground" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">No applications found</h3>
          <p className="text-sm text-foreground">Try adjusting your filters to see more results.</p>
        </div>
      )}
    </div>
  )
}

// Re-export types for backward compatibility
export type { ApplicationSummary }
