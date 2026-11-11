import { useCallback, useState, useMemo } from 'react'
import { FileText } from 'lucide-react'
import { ApplicationCard, ApplicationSummary } from './ApplicationCard'
import { logger } from '@/lib/logger'
import type { StatusCommandOptions } from '@/types/statusCommand'

interface ApplicationsTableProps {
  applications: ApplicationSummary[]
  onStatusUpdate: (id: string, status: string, options?: StatusCommandOptions) => void | Promise<void>
  onPaymentStatusUpdate: (id: string, status: string, verificationNotes?: string) => void | Promise<void>
  onViewDetails: (id: string) => void
  selectedIds?: string[]
  onSelectionChange?: (ids: string[]) => void
}

export function ApplicationsTable({
  applications,
  onStatusUpdate,
  onPaymentStatusUpdate,
  onViewDetails,
  selectedIds = [],
  onSelectionChange
}: ApplicationsTableProps) {
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [updatingPayment, setUpdatingPayment] = useState<string | null>(null)

  // Memoized Set for O(1) selection-membership checks (equivalent to
  // selectedIds.includes(id) over the identical collection).
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds])

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

  // Parent (Applications.tsx) already handles toasts and error display.
  // This wrapper only tracks local loading state for the card UI.
  const handleStatusUpdate = useCallback(async (id: string, status: string, options?: StatusCommandOptions) => {
    try {
      setUpdatingStatus(id)
      await (options ? onStatusUpdate(id, status, options) : onStatusUpdate(id, status))
    } catch (error) {
      logger.error('Failed to update status:', error)
    } finally {
      setUpdatingStatus(null)
    }
  }, [onStatusUpdate])

  const handlePaymentUpdate = useCallback(async (id: string, status: string, verificationNotes?: string) => {
    try {
      setUpdatingPayment(id)
      await onPaymentStatusUpdate(id, status, verificationNotes)
    } catch (error) {
      logger.error('Failed to update payment status:', error)
    } finally {
      setUpdatingPayment(null)
    }
  }, [onPaymentStatusUpdate])

  return (
    <div className="space-y-6">
      {applications.length > 0 ? (
        <>
          {/* Select All Header */}
          {onSelectionChange && (
            <div className="mb-4 rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                {/* The label is the hit area and the name (task 30.4, R17.4). */}
                <label className="flex min-h-touch cursor-pointer items-center gap-3">
                  <span className="inline-flex min-h-touch min-w-touch items-center justify-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.length === applications.length && applications.length > 0}
                      onChange={handleSelectAll}
                      className="h-4 w-4 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border-input rounded"
                    />
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {selectedIds.length > 0 ? `${selectedIds.length} selected` : 'Select all'}
                  </span>
                </label>
                {selectedIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onSelectionChange([])}
                    className="min-h-touch rounded-lg px-2 text-sm text-foreground hover:bg-muted"
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
                isSelected={selectedIdSet.has(app.id)}
                onSelect={onSelectionChange ? handleSelect : undefined}
              />
            ))}
          </div>
          
          {/*
            The page navigator lives one level up (``RosterPagination``) so every
            view mode shares one, and so this component holds no page arithmetic
            of its own.
          */}
        </>
      ) : (
        <div className="rounded-lg border border-border bg-card py-16 text-center">
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
