import React from 'react'
import { AlertTriangle, Clock, Save, RefreshCw, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'

interface DraftWarningBannerProps {
  onRestore: () => void
  onDismiss: () => void
  draftTimestamp: Date
  className?: string
}

export function DraftWarningBanner({
  onRestore,
  onDismiss,
  draftTimestamp,
  className
}: DraftWarningBannerProps) {
  const formatTimestamp = (date: Date) => {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMinutes = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMinutes < 60) {
      return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
    } else {
      return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
    }
  }

  return (
    <div className={cn(
      'bg-warning/5 border border-warning/30 rounded-lg p-4 mb-6',
      'flex items-start space-x-3',
      className
    )}>
      <AlertTriangle className="w-5 h-5 text-accent mt-0.5 flex-shrink-0" />
      
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-medium text-accent-foreground">
          Draft Found
        </h3>
        <p className="text-sm text-warning-foreground mt-1">
          We found an unsaved draft from {formatTimestamp(draftTimestamp)}. 
          Would you like to restore it or start fresh?
        </p>
        
        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <Button
            onClick={onRestore}
            size="sm"
            variant="warning"
            className="gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Restore Draft
          </Button>
          
          <Button
            onClick={onDismiss}
            size="sm"
            variant="outline"
            className="gap-2"
          >
            <X className="w-4 h-4" />
            Start Fresh
          </Button>
        </div>
      </div>
    </div>
  )
}

interface AutoSaveIndicatorProps {
  lastSaved?: Date | null
  isSaving?: boolean
  hasUnsavedChanges?: boolean
  className?: string
}

export function AutoSaveIndicator({
  lastSaved,
  isSaving = false,
  hasUnsavedChanges = false,
  className
}: AutoSaveIndicatorProps) {
  const getStatusText = () => {
    if (isSaving) return 'Saving...'
    if (hasUnsavedChanges) return 'Unsaved changes'
    if (lastSaved) {
      const diffMs = new Date().getTime() - lastSaved.getTime()
      const diffMinutes = Math.floor(diffMs / (1000 * 60))
      
      if (diffMinutes < 1) return 'Saved just now'
      if (diffMinutes === 1) return 'Saved 1 minute ago'
      return `Saved ${diffMinutes} minutes ago`
    }
    return 'Not saved'
  }

  const getStatusColor = () => {
    if (isSaving) return 'text-primary'
    if (hasUnsavedChanges) return 'text-warning'
    if (lastSaved) return 'text-success'
    return 'text-foreground'
  }

  const getIcon = () => {
    if (isSaving) {
      return <Save className="w-4 h-4 animate-pulse" />
    }
    if (hasUnsavedChanges) {
      return <Clock className="w-4 h-4" />
    }
    if (lastSaved) {
      return <Save className="w-4 h-4" />
    }
    return <Save className="w-4 h-4 opacity-50" />
  }

  return (
    <div className={cn(
      'flex items-center space-x-2 text-sm',
      getStatusColor(),
      className
    )}>
      {getIcon()}
      <span>{getStatusText()}</span>
    </div>
  )
}

interface SessionTimeoutWarningProps {
  timeLeft: number
  onExtend: () => void
  formatTimeLeft: () => string
  className?: string
}

export function SessionTimeoutWarning({
  timeLeft,
  onExtend,
  formatTimeLeft,
  className
}: SessionTimeoutWarningProps) {
  if (timeLeft > 300) return null // Only show when less than 5 minutes left

  return (
    <div className={cn(
      'fixed top-4 left-1/2 transform -translate-x-1/2 z-50',
      'bg-destructive/5 border border-destructive/30 rounded-lg p-4 shadow-lg',
      'max-w-sm w-full mx-4',
      className
    )}>
      <div className="flex items-start space-x-3">
        <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
        
        <div className="flex-1">
          <h3 className="text-sm font-medium text-destructive-foreground">
            Session Expiring
          </h3>
          <p className="text-sm text-error mt-1">
            Your session will expire in {formatTimeLeft()}. 
            Any unsaved changes will be lost.
          </p>
          
          <div className="mt-3">
            <Button
              onClick={onExtend}
              size="sm"
              variant="destructive"
              className="w-full"
            >
              Extend Session
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

interface FormRecoveryBannerProps {
  onRecover: () => void
  onDismiss: () => void
  errorMessage: string
  className?: string
}

export function FormRecoveryBanner({
  onRecover,
  onDismiss,
  errorMessage,
  className
}: FormRecoveryBannerProps) {
  return (
    <div className={cn(
      'bg-destructive/5 border border-destructive/30 rounded-lg p-4 mb-6',
      'flex items-start space-x-3',
      className
    )}>
      <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
      
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-medium text-destructive-foreground">
          Form Submission Failed
        </h3>
        <p className="text-sm text-error mt-1">
          {errorMessage} Your data has been saved locally and can be recovered.
        </p>
        
        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <Button
            onClick={onRecover}
            size="sm"
            variant="destructive"
            className="gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </Button>
          
          <Button
            onClick={onDismiss}
            size="sm"
            variant="outline"
          >
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  )
}
