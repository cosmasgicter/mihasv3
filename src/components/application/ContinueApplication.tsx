import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { applicationSessionManager } from '@/lib/applicationSession'
import { cn, formatDate } from '@/lib/utils'
import { FileText, Clock, AlertTriangle, Trash2, RefreshCw } from 'lucide-react'
import { clearAllDraftData } from '@/lib/draftCleanup'
import { ConfirmAlertDialog } from '@/components/ui/alert-dialog'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { toast } from '@/hooks/useToast'

interface DraftInfo {
  exists: boolean
  step?: number
  lastSaved?: string
  progress?: string
  expiresAt?: string
}

export function ContinueApplication() {
  const { user } = useAuth()
  const { profile } = useProfileQuery()
  const [draftInfo, setDraftInfo] = useState<DraftInfo>({ exists: false })
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [currentTime, setCurrentTime] = useState(Date.now())
  const confirmDialog = useConfirmDialog()

  useEffect(() => {
    if (user) {
      loadDraftInfo()
    }
  }, [user])

  // Update timer every minute
  useEffect(() => {
    if (!draftInfo.exists || !draftInfo.expiresAt) return

    const interval = setInterval(() => {
      setCurrentTime(Date.now())
    }, 60000)

    return () => clearInterval(interval)
  }, [draftInfo.exists, draftInfo.expiresAt])

  const loadDraftInfo = async () => {
    if (!user) return

    try {
      setLoading(true)
      const info = await applicationSessionManager.getDraftInfo(profile?.user_id || user.id)
      setDraftInfo(info)
    } catch (error) {
      console.error('Error loading draft info:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteDraft = async () => {
    if (!user) return
    
    const confirmed = await confirmDialog.confirm({
      title: 'Delete Draft',
      message: 'Your saved draft will be permanently deleted.',
      confirmText: 'Delete',
      variant: 'danger'
    })
    if (!confirmed) return

    try {
      setDeleting(true)
      const result = await applicationSessionManager.deleteDraft(profile?.user_id || user.id)
      
      if (result.success) {
        setDraftInfo({ exists: false })
        // Dispatch event to notify other components
        window.dispatchEvent(new CustomEvent('draftCleared'))
      } else {
        console.error('Failed to delete draft:', result.error)
        toast.error('Delete Failed', result.error || 'Unknown error')
      }
    } catch (error) {
      console.error('Error deleting draft:', error)
      toast.error('Delete Failed', 'Please try again')
    } finally {
      setDeleting(false)
    }
  }

  const isExpiringSoon = () => {
    if (!draftInfo.expiresAt) return false
    const expiryTime = new Date(draftInfo.expiresAt).getTime()
    const hoursUntilExpiry = (expiryTime - currentTime) / (1000 * 60 * 60)
    return hoursUntilExpiry < 2
  }

  const getTimeUntilExpiry = () => {
    if (!draftInfo.expiresAt) return ''
    const expiryTime = new Date(draftInfo.expiresAt).getTime()
    const msUntilExpiry = expiryTime - currentTime

    if (msUntilExpiry <= 0) return 'Expired'

    const hours = Math.floor(msUntilExpiry / (1000 * 60 * 60))
    const minutes = Math.floor((msUntilExpiry % (1000 * 60 * 60)) / (1000 * 60))

    if (hours > 0) {
      return `${hours}h ${minutes}m`
    }
    return `${minutes}m`
  }

  const baseCardClasses = 'rounded-2xl border px-6 py-6 transition-colors shadow-md backdrop-blur-sm'

  if (loading) {
    return (
      <div className={cn(baseCardClasses, 'bg-card/90 border-border/80 text-foreground')}>
        <div className="flex items-center gap-3">
          <RefreshCw className="h-5 w-5 animate-spin text-primary" />
          <span>Checking for saved applications...</span>
        </div>
      </div>
    )
  }

  if (!draftInfo.exists) {
    return (
      <div
        className={cn(
          baseCardClasses,
          'flex flex-col gap-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-primary/20 text-primary-900 sm:flex-row sm:items-center sm:justify-between'
        )}
      >
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Ready to apply?</h2>
          <p className="text-sm sm:text-base text-primary-800">
            Start your application to join programs at Kalulushi Training Centre or Mukuba Institute of Health and Applied Sciences.
          </p>
        </div>
        <Link to="/student/application-wizard" className="flex-shrink-0">
          <Button className="bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg hover:from-blue-700 hover:to-purple-700">
            <FileText className="mr-2 h-4 w-4" />
            Start application
          </Button>
        </Link>
      </div>
    )
  }

  const cardTone = isExpiringSoon()
    ? 'bg-amber-50/90 border-amber-200 text-amber-900'
    : 'bg-card/90 border-border/80 text-foreground'

  return (
    <div className={cn(baseCardClasses, 'flex flex-col gap-5', cardTone)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-info-strong">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Continue your application</h2>
              <p className="text-sm text-gray-900">Jump back in where you left off—your progress is saved securely.</p>
            </div>
          </div>

          {isExpiringSoon() && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
              <AlertTriangle className="h-4 w-4" />
              Expiring soon
            </div>
          )}

          <dl className="mt-4 grid gap-3 text-sm text-gray-900 sm:max-w-md">
            <div className="flex items-center justify-between rounded-xl bg-card/70 px-4 py-2 font-medium text-gray-900 shadow-sm">
              <dt className="text-gray-900">Progress</dt>
              <dd>{draftInfo.progress}</dd>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-card/70 px-4 py-2 font-medium text-gray-900 shadow-sm">
              <dt className="text-gray-900">Last saved</dt>
              <dd>{draftInfo.lastSaved ? formatDate(draftInfo.lastSaved) : 'Unknown'}</dd>
            </div>
            {draftInfo.expiresAt && (
              <div className="flex items-center justify-between rounded-xl bg-card/70 px-4 py-2 font-medium text-gray-900 shadow-sm">
                <dt className="text-gray-900">Expires in</dt>
                <dd className={cn(isExpiringSoon() ? 'text-accent' : 'text-foreground')}>{getTimeUntilExpiry()}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="flex flex-col gap-3 sm:w-60">
          <Link to="/student/application-wizard" className="w-full">
            <Button className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg hover:from-blue-700 hover:to-purple-700">
              <FileText className="mr-2 h-4 w-4" />
              Continue application
            </Button>
          </Link>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDeleteDraft}
              disabled={deleting}
              className="flex-1 text-destructive hover:bg-destructive/5"
            >
              {deleting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              <span className="ml-2">Delete</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={loadDraftInfo}
              className="flex-1 text-primary hover:bg-primary/10"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {isExpiringSoon() && (
        <div className="rounded-2xl border border-warning/30 bg-amber-100/60 px-4 py-3 text-sm text-amber-900">
          <div className="flex items-start gap-2">
            <Clock className="mt-0.5 h-4 w-4" />
            <span>Finish your application soon to keep your saved progress active.</span>
          </div>
        </div>
      )}
      <ConfirmAlertDialog
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
