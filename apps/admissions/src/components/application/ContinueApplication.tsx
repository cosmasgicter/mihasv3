import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert'
import { SectionCard } from '@/components/ui/SectionCard'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { applicationSessionManager } from '@/lib/applicationSession'
import { draftManager } from '@/lib/draftManager'
import { cn, formatDate } from '@/lib/utils'
import { FileText, AlertTriangle, Trash2, RefreshCw } from 'lucide-react'
import { ConfirmAlertDialog } from '@/components/ui/alert-dialog'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { toast } from '@/hooks/useToast'
import { useApplicationDrafts } from '@/hooks/queries/useApplicationQueries'

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
  const draftOwnerId = profile?.user_id || user?.id
  const {
    data: serverDrafts = [],
    isLoading: serverDraftsLoading,
    refetch: refetchServerDrafts,
  } = useApplicationDrafts(draftOwnerId)
  const latestServerDraft = serverDrafts[0]
  const serverDraftCount = serverDrafts.length

  useEffect(() => {
    if (user) {
      loadDraftInfo()
    }
  }, [user])

  useEffect(() => {
    const handleDraftChanged = () => {
      loadDraftInfo()
    }

    const handleApplicationSubmitted = () => {
      setDraftInfo({ exists: false })
      loadDraftInfo()
    }

    window.addEventListener('applicationDraftSaved', handleDraftChanged)
    window.addEventListener('draftCleared', handleDraftChanged)
    window.addEventListener('applicationSubmitted', handleApplicationSubmitted)

    return () => {
      window.removeEventListener('applicationDraftSaved', handleDraftChanged)
      window.removeEventListener('draftCleared', handleDraftChanged)
      window.removeEventListener('applicationSubmitted', handleApplicationSubmitted)
    }
  }, [user, profile?.user_id])

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
    } catch {
      setDraftInfo({ exists: false })
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteDraft = async () => {
    const ownerId = draftOwnerId || user?.id
    if (!ownerId) return
    
    const confirmed = await confirmDialog.confirm({
      title: serverDraftCount > 1 ? 'Delete Drafts' : 'Delete Draft',
      message: serverDraftCount > 1
        ? 'All saved draft applications will be permanently deleted.'
        : 'Your saved draft will be permanently deleted.',
      confirmText: serverDraftCount > 1 ? 'Delete All' : 'Delete',
      variant: 'danger'
    })
    if (!confirmed) return

    try {
      setDeleting(true)
      if (!draftInfo.exists && serverDraftCount === 0) {
        toast.error('Delete Failed', 'We could not remove your saved draft. Please try again.')
        return
      }

      const result = await draftManager.clearAllDrafts(ownerId)
      if (!result.success) {
        toast.error('Delete Failed', result.error || 'We could not remove your saved draft. Please try again.')
        return
      }

      setDraftInfo({ exists: false })
      await refetchServerDrafts()
      window.dispatchEvent(new CustomEvent('draftCleared'))
      toast.success('Draft Deleted', 'Your saved draft was removed.')
    } catch {
      toast.error('Delete Failed', 'We could not remove your saved draft. Please try again.')
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

  if (loading || serverDraftsLoading) {
    return (
      <SectionCard className="border-border/80 bg-card/90 text-foreground shadow-md" padding="sm">
        <div className="space-y-3" role="status" aria-label="Checking for saved applications">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 rounded-full bg-primary/30 animate-pulse" aria-hidden="true" />
            <span>Checking for saved applications...</span>
          </div>
          <div className="space-y-2">
            <div className="h-3 w-40 rounded bg-muted animate-pulse" />
            <div className="h-3 w-64 rounded bg-muted animate-pulse" />
          </div>
        </div>
      </SectionCard>
    )
  }

  if (!draftInfo.exists && serverDraftCount === 0) {
    return null
  }

  const hasMultipleDrafts = serverDraftCount > 1
  const displayProgress = draftInfo.exists ? draftInfo.progress : 'Online draft'
  const displayLastSaved = draftInfo.exists
    ? draftInfo.lastSaved
    : latestServerDraft?.updated_at || latestServerDraft?.created_at

  return (
    <SectionCard
      className={cn(
        'shadow-md ',
        isExpiringSoon() ? 'border-warning/30 bg-warning/5' : 'border-border/80 bg-card/90'
      )}
      padding="sm"
    >
      <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-info-strong">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Continue your application</h2>
              <p className="text-sm text-foreground">
                {hasMultipleDrafts
                  ? `${serverDraftCount} drafts are available. Continue the latest one or manage drafts in the wizard.`
                  : 'Jump back in where you left off. Your progress is saved securely.'}
              </p>
            </div>
          </div>

          {isExpiringSoon() && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
              <AlertTriangle className="h-4 w-4" />
              Expiring soon
            </div>
          )}

          <dl className="mt-4 grid gap-3 text-sm text-foreground sm:max-w-md">
            <div className="flex items-center justify-between rounded-xl bg-card/70 px-4 py-2 font-medium text-foreground shadow-sm">
              <dt className="text-foreground">Progress</dt>
              <dd>{displayProgress}</dd>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-card/70 px-4 py-2 font-medium text-foreground shadow-sm">
              <dt className="text-foreground">Last saved</dt>
              <dd>{displayLastSaved ? formatDate(displayLastSaved) : 'Unknown'}</dd>
            </div>
            {draftInfo.expiresAt && (
              <div className="flex items-center justify-between rounded-xl bg-card/70 px-4 py-2 font-medium text-foreground shadow-sm">
                <dt className="text-foreground">Expires in</dt>
                <dd className={cn(isExpiringSoon() ? 'text-accent' : 'text-foreground')}>{getTimeUntilExpiry()}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="flex flex-col gap-3 sm:w-60">
          <Link to="/student/application-wizard" className="w-full">
            <Button variant="primary" className="w-full">
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
              loading={deleting}
            >
              {!deleting && <Trash2 className="h-4 w-4" />}
              <span className="ml-2">Delete</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void loadDraftInfo()
                void refetchServerDrafts()
              }}
              className="flex-1 text-primary hover:bg-primary/10"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {isExpiringSoon() && (
        <Alert variant="warning">
          <AlertTitle className="text-foreground">Draft expiring soon</AlertTitle>
          <AlertDescription className="text-foreground">
            Finish your application soon to keep your saved progress active.
          </AlertDescription>
        </Alert>
      )}
      </div>
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
    </SectionCard>
  )
}
