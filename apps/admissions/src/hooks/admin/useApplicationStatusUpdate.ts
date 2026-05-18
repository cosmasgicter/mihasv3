/**
 * useApplicationStatusUpdate Hook
 * 
 * Provides a canonical status update mutation for admin workflows.
 * 
 * @requirements 2.3 - Multi-Admin Consistency
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useToastStore } from '@/hooks/useToast'
import { applicationService } from '@/services/applications'
import type { Application } from '@/types/database'
import { invalidateAdminApplicationQueries } from './applicationQueryInvalidation'
import { logger } from '@/lib/logger'

export interface StatusUpdateParams {
  /** The application ID to update */
  applicationId: string
  /** The new status to set */
  status: Application['status']
  /** Optional admin feedback/notes */
  notes?: string
  /** Optional override for guarded transitions */
  force?: boolean
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
 * Hook for updating application status through the canonical service path.
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
 *       status: 'approved',
 *       notes: 'Application meets all requirements'
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

  const mutation = useMutation({
    mutationFn: async (params: StatusUpdateParams): Promise<StatusUpdateResult> => {
      const { applicationId, status, notes, force } = params

      try {
        const result = await applicationService.updateStatus(
          applicationId,
          status,
          notes,
          force
        ) as {
          id: string
          application_number: string
          status: string
          admin_feedback?: string
          decision_date?: string
          updated_at: string
        }

        return {
          application: result,
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

    onSuccess: async (result) => {
      await invalidateAdminApplicationQueries(queryClient, {
        applicationId: result.application.id,
        includeApplicationHistory: true,
      })

      // Show success toast
      toast.success(
        `Application ${result.application.application_number} updated to ${result.application.status}`
      )

      // Call user callback
      onSuccess?.(result)
    },

    onError: async (error: Error) => {
      if (error instanceof ConcurrentModificationError) {
        // Handle concurrent modification conflict
        toast.info(
          'This application was modified by another admin. Refreshing data...'
        )

        // Invalidate queries to get fresh data
        await invalidateAdminApplicationQueries(queryClient)

        // Call conflict callback
        onConflict?.()
      } else {
        // Handle other errors
        toast.error('Failed to update application status')
        logger.error('[useApplicationStatusUpdate] Error:', error)
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
