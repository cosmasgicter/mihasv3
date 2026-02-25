/**
 * useApplicationStatusUpdate Hook
 * 
 * Provides optimistic locking for application status updates to handle
 * concurrent modifications when multiple admins work simultaneously.
 * Uses `updated_at` timestamp comparison to detect conflicts.
 * 
 * @requirements 2.3 - Multi-Admin Consistency
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useToastStore } from '@/components/ui/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/services/client'

import { apiClient } from '@/services/client'

export interface StatusUpdateParams {
  /** The application ID to update */
  applicationId: string
  /** The new status to set */
  newStatus: string
  /** The current updated_at timestamp for optimistic locking */
  currentUpdatedAt: string
  /** Optional admin feedback/notes */
  adminFeedback?: string
}

export interface StatusUpdateResult {
  /** The updated application data */
  application: {
    id: string
    application_number: string
    status: string
    admin_feedback?: string
    decision_date?: string
    updated_at: string
  }
  /** Whether a conflict was detected */
  conflictDetected: boolean
}

export interface UseApplicationStatusUpdateOptions {
  /** Callback when update succeeds */
  onSuccess?: (result: StatusUpdateResult) => void
  /** Callback when update fails */
  onError?: (error: Error) => void
  /** Callback when conflict is detected */
  onConflict?: () => void
}

/**
 * Custom error class for concurrent modification conflicts
 */
export class ConcurrentModificationError extends Error {
  constructor(message: string = 'Application was modified by another admin') {
    super(message)
    this.name = 'ConcurrentModificationError'
  }
}

/**
 * Hook for updating application status with optimistic locking
 * 
 * Implements:
 * - Optimistic locking using `updated_at` timestamp
 * - Concurrent modification conflict detection
 * - Warning toast and auto-refresh on conflict
 * - Status change recording in `application_status_history`
 * 
 * @example
 * ```tsx
 * function ApplicationActions({ application }) {
 *   const { updateStatus, isUpdating } = useApplicationStatusUpdate({
 *     onConflict: () => refetchApplication()
 *   })
 *   
 *   const handleApprove = () => {
 *     updateStatus({
 *       applicationId: application.id,
 *       newStatus: 'approved',
 *       currentUpdatedAt: application.updated_at,
 *       adminFeedback: 'Application meets all requirements'
 *     })
 *   }
 *   
 *   return (
 *     <button onClick={handleApprove} disabled={isUpdating}>
 *       Approve
 *     </button>
 *   )
 * }
 * ```
 */
export function useApplicationStatusUpdate(options: UseApplicationStatusUpdateOptions = {}) {
  const { onSuccess, onError, onConflict } = options
  const queryClient = useQueryClient()
  const toast = useToastStore()
  const { user } = useAuth()

  const mutation = useMutation({
    mutationFn: async (params: StatusUpdateParams): Promise<StatusUpdateResult> => {
      const { applicationId, newStatus, currentUpdatedAt, adminFeedback } = params

      try {
        const result = await apiClient.request<{
          id: string
          application_number: string
          status: string
          admin_feedback?: string
          decision_date?: string
          updated_at: string
        }>(`/api/applications?id=${applicationId}`, {
          method: 'POST',
          body: JSON.stringify({
            action: 'update_status',
            status: newStatus,
            notes: adminFeedback,
            expected_updated_at: currentUpdatedAt
          })
        })

        return {
          application: result!,
          conflictDetected: false
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : ''
        if (message.includes('CONFLICT') || message.includes('modified')) {
          throw new ConcurrentModificationError()
        }
        throw error
      }
    },

    onSuccess: (result) => {
      // Invalidate all related queries to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ['applications'] })
      queryClient.invalidateQueries({ queryKey: ['applications', result.application.id] })
      queryClient.invalidateQueries({ queryKey: ['application-stats'] })
      queryClient.invalidateQueries({ queryKey: ['application-history'] })
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })

      // Show success toast
      toast.success(
        `Application ${result.application.application_number} updated to ${result.application.status}`
      )

      // Call user callback
      onSuccess?.(result)
    },

    onError: (error: Error) => {
      if (error instanceof ConcurrentModificationError) {
        // Handle concurrent modification conflict
        toast.info(
          'This application was modified by another admin. Refreshing data...'
        )

        // Invalidate queries to get fresh data
        queryClient.invalidateQueries({ queryKey: ['applications'] })

        // Call conflict callback
        onConflict?.()
      } else {
        // Handle other errors
        toast.error('Failed to update application status')
        console.error('[useApplicationStatusUpdate] Error:', error)
      }

      // Call user error callback
      onError?.(error)
    }
  })

  return {
    /** Trigger the status update mutation */
    updateStatus: mutation.mutate,
    /** Async version of updateStatus that returns a promise */
    updateStatusAsync: mutation.mutateAsync,
    /** Whether an update is currently in progress */
    isUpdating: mutation.isPending,
    /** The last error that occurred */
    error: mutation.error,
    /** Whether the last update was successful */
    isSuccess: mutation.isSuccess,
    /** Reset the mutation state */
    reset: mutation.reset
  }
}

export default useApplicationStatusUpdate
