import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { applicationSessionManager } from '@/lib/applicationSession'
import { draftManager } from '@/lib/draftManager'
import { useToast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { clearAllDraftData } from '@/lib/draftCleanup'

export const useDraftManager = () => {
  const { user } = useAuth()
  const { profile } = useProfileQuery()
  const { showSuccess, showError } = useToast()
  const [isDeleting, setIsDeleting] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    title: string
    message: string
    onConfirm: () => void
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} })

  const deleteDraft = async (onSuccess?: () => void, onError?: (error: string) => void) => {
    if (!user || isDeleting) return

    return new Promise<void>((resolve) => {
      setConfirmDialog({
        isOpen: true,
        title: 'Delete Draft',
        message: 'Are you sure you want to delete this draft? This action cannot be undone.',
        onConfirm: () => {
          setConfirmDialog(prev => ({ ...prev, isOpen: false }))
          resolve()
        }
      })
    }).then(async () => {
      setIsDeleting(true)
      try {
        // Clear all draft data immediately
        clearAllDraftData()
        
        const deleteResult = await applicationSessionManager.deleteDraft(profile?.user_id || user.id)
        
        if (deleteResult.success) {
          showSuccess('Draft deleted successfully. You can now start a new application.')
          onSuccess?.()
        } else {
          const error = deleteResult.error || 'Failed to delete draft'
          showError('Delete failed', error)
          onError?.(error)
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Failed to delete draft'
        showError('Delete failed', errorMsg)
        onError?.(errorMsg)
      } finally {
        setIsDeleting(false)
      }
    })
  }

  const clearAllDrafts = async (onSuccess?: () => void, onError?: (error: string) => void) => {
    if (!user || isDeleting) return

    return new Promise<void>((resolve) => {
      setConfirmDialog({
        isOpen: true,
        title: 'Clear All Drafts',
        message: 'Are you sure you want to clear all drafts? This action cannot be undone.',
        onConfirm: () => {
          setConfirmDialog(prev => ({ ...prev, isOpen: false }))
          resolve()
        }
      })
    }).then(async () => {
      setIsDeleting(true)
      try {
        const deleteResult = await draftManager.clearAllDrafts(profile?.user_id || user.id)
        
        if (deleteResult.success) {
          showSuccess('All drafts cleared successfully')
          onSuccess?.()
        } else {
          const error = deleteResult.error || 'Failed to clear drafts'
          showError('Clear failed', error)
          onError?.(error)
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Failed to clear drafts'
        showError('Clear failed', errorMsg)
      } finally {
        setIsDeleting(false)
      }
    })
  }

  return {
    deleteDraft,
    clearAllDrafts,
    isDeleting
  }
}