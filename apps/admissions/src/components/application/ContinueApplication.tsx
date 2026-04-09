import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert'
import { SectionCard } from '@/components/ui/SectionCard'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { applicationSessionManager } from '@/lib/applicationSession'
import { cn, formatDate } from '@/lib/utils'
import { FileText, AlertTriangle, Trash2, RefreshCw } from 'lucide-react'
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
        toast.error('Delete Failed', 'We could not remove your saved draft. Please try again.')
      }
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

  if (loading) {
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

  if (!draftInfo.exists) {
    return null
  }

  return (
    <SectionCard
      className={cn(
        'shadow-md backdrop-blur-sm',
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
              <p className="text-sm text-foreground">Jump back in where you left off—your progress is saved securely.</p>
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
              <dd>{draftInfo.progress}</dd>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-card/70 px-4 py-2 font-medium text-foreground shadow-sm">
              <dt className="text-foreground">Last saved</dt>
              <dd>{draftInfo.lastSaved ? formatDate(draftInfo.lastSaved) : 'Unknown'}</dd>
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
