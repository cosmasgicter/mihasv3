import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { applicationSessionManager } from '@/lib/applicationSession'
import { draftManager } from '@/lib/draftManager'
import { useToastStore } from '@/hooks/useToast'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { toError } from '@/lib/toError'

export const useDraftManager = () => {
  const { user } = useAuth()
  const { profile } = useProfileQuery()
  const { success: showSuccess, error: showError } = useToastStore()
  const [isDeleting, setIsDeleting] = useState(false)
  const confirmDialog = useConfirmDialog()

  const deleteDraft = async (onSuccess?: () => void, onError?: (error: string) => void) => {
    if (!user || isDeleting) return

    const confirmed = await confirmDialog.confirm({
      title: 'Delete Draft',
      message: 'This draft will be permanently deleted.',
      confirmText: 'Delete',
      variant: 'danger'
    })
    if (!confirmed) return

    setIsDeleting(true)
    try {
      // Clear database first so we do not report success while a server draft remains.
      const deleteResult = await applicationSessionManager.deleteDraft(profile?.user_id || user.id)
      
      if (deleteResult.success) {
        showSuccess('Draft deleted successfully')
        onSuccess?.()
      } else {
        const error = deleteResult.error || 'Failed to delete draft'
        showError(error)
        onError?.(error)
      }
    } catch (error) {
      const errorMsg = toError(error).message || 'Failed to delete draft'
      showError(errorMsg)
      onError?.(errorMsg)
    } finally {
      setIsDeleting(false)
    }
  }

  const clearAllDrafts = async (onSuccess?: () => void, onError?: (error: string) => void) => {
    if (!user || isDeleting) return

    const confirmed = await confirmDialog.confirm({
      title: 'Clear All Drafts',
      message: 'All draft applications will be permanently deleted.',
      confirmText: 'Clear All',
      variant: 'danger'
    })
    if (!confirmed) return

    setIsDeleting(true)
    try {
      // Clear database first so we do not report success while a server draft remains.
      const deleteResult = await draftManager.clearAllDrafts(profile?.user_id || user.id)
      
      if (deleteResult.success) {
        showSuccess('All drafts cleared successfully')
        onSuccess?.()
      } else {
        const error = deleteResult.error || 'Failed to clear drafts'
        showError(error)
        onError?.(error)
      }
    } catch (error) {
      const errorMsg = toError(error).message || 'Failed to clear drafts'
      showError(errorMsg)
      onError?.(errorMsg)
    } finally {
      setIsDeleting(false)
    }
  }

  return {
    deleteDraft,
    clearAllDrafts,
    isDeleting,
    confirmDialog
  }
}
