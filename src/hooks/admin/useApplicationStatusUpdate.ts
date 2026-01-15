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
import { supabase } from '@/lib/supabase'
import { useToastStore } from '@/components/ui/Toast'
import { useAuth } from '@/contexts/AuthContext'

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
      const newUpdatedAt = new Date().toISOString()
      
      // Determine if this is a decision status (approved/rejected)
      const isDecisionStatus = newStatus === 'approved' || newStatus === 'rejected'
      
      // Build update payload
      const updatePayload: Record<string, unknown> = {
        status: newStatus,
        updated_at: newUpdatedAt
      }
      
      if (adminFeedback !== undefined) {
        updatePayload.admin_feedback = adminFeedback
      }
      
      if (isDecisionStatus) {
        updatePayload.decision_date = newUpdatedAt
      }

      // Perform update with optimistic locking check
      // The .eq('updated_at', currentUpdatedAt) ensures we only update if no one else has modified
      const { data, error, count } = await supabase
        .from('applications')
        .update(updatePayload)
        .eq('id', applicationId)
        .eq('updated_at', currentUpdatedAt) // Optimistic lock check
        .select('id, application_number, status, admin_feedback, decision_date, updated_at')
        .single()

      if (error) {
        // Check if it's a "no rows returned" error (PGRST116) - indicates conflict
        if (error.code === 'PGRST116') {
          throw new ConcurrentModificationError()
        }
        throw new Error(error.message || 'Failed to update application status')
      }

      // If no data returned, it means the updated_at didn't match (concurrent modification)
      if (!data) {
        throw new ConcurrentModificationError()
      }

      // Record status change in application_status_history
      try {
        await supabase.from('application_status_history').insert({
          application_id: applicationId,
          status: newStatus,
          changed_by: user?.id || null,
          notes: adminFeedback || null,
          created_at: newUpdatedAt
        })
      } catch (historyError) {
        // Log but don't fail the main operation
        console.error('[useApplicationStatusUpdate] Failed to record status history:', historyError)
      }

      return {
        application: data,
        conflictDetected: false
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
