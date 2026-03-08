import React from 'react'
import { AlertTriangle, ArrowRight, Info, RefreshCw, XCircle } from 'lucide-react'

import { formatError, isRetryableError, type ErrorMessage } from '@/utils/errorMessages'
import { cn } from '@/lib/utils'

import { Alert, AlertDescription, AlertTitle } from './Alert'
import { Button } from './Button'
import { SectionCard } from './SectionCard'

interface ErrorDisplayProps {
  error: any
  onRetry?: () => void
  onAction?: () => void
  showTechnicalDetails?: boolean
  className?: string
}

function getErrorIcon(error: any) {
  if (error?.status >= 500) {
    return <XCircle className="h-10 w-10 text-destructive" />
  }
  if (error?.status === 404) {
    return <Info className="h-10 w-10 text-primary" />
  }
  return <AlertTriangle className="h-10 w-10 text-warning" />
}

export function ErrorDisplay({
  error,
  onRetry,
  onAction,
  showTechnicalDetails = false,
  className = '',
}: ErrorDisplayProps) {
  const errorMessage: ErrorMessage = formatError(error)
  const canRetry = isRetryableError(error)

  return (
    <SectionCard className={cn('mx-auto max-w-xl', className)} padding="sm">
      <div role="alert" className="flex flex-col items-center gap-4 text-center">
        <div className="rounded-full bg-muted p-4">
          {getErrorIcon(error)}
        </div>

        <div className="space-y-2">
          <h3 className="text-xl font-semibold text-foreground">{errorMessage.title}</h3>
          <p className="text-sm text-muted-foreground">{errorMessage.description}</p>
        </div>

        <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
          {canRetry && onRetry && (
            <Button onClick={onRetry} className="w-full sm:w-auto" variant="primary">
              <RefreshCw className="mr-2 h-4 w-4" />
              {errorMessage.actionLabel || 'Try Again'}
            </Button>
          )}

          {errorMessage.action && errorMessage.action !== 'retry' && onAction && (
            <Button
              onClick={onAction}
              className="w-full sm:w-auto"
              variant={canRetry ? 'secondary' : 'primary'}
            >
              <ArrowRight className="mr-2 h-4 w-4" />
              {errorMessage.actionLabel}
            </Button>
          )}
        </div>
      </div>

      {showTechnicalDetails && errorMessage.technicalDetails && (
        <details className="mt-4 rounded-xl border border-border/70 bg-muted/40 px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium text-muted-foreground">
            Technical Details
          </summary>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-card px-3 py-2 text-xs text-foreground">
            {errorMessage.technicalDetails}
          </pre>
        </details>
      )}
    </SectionCard>
  )
}

interface InlineErrorProps {
  message: string
  className?: string
}

export function InlineError({ message, className = '' }: InlineErrorProps) {
  return (
    <div className={cn('mt-1 flex items-start gap-2 text-sm text-destructive', className)} role="alert">
      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <span>{message}</span>
    </div>
  )
}

interface ErrorBannerProps {
  error: any
  onDismiss?: () => void
  onRetry?: () => void
  className?: string
}

export function ErrorBanner({
  error,
  onDismiss,
  onRetry,
  className = '',
}: ErrorBannerProps) {
  const errorMessage: ErrorMessage = formatError(error)
  const canRetry = isRetryableError(error)

  return (
    <Alert variant="error" className={cn(className)} role="alert">
      <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <AlertTitle className="text-foreground">{errorMessage.title}</AlertTitle>
          <AlertDescription className="text-foreground">{errorMessage.description}</AlertDescription>
          {canRetry && onRetry && (
            <Button onClick={onRetry} size="sm" variant="secondary" className="mt-2 w-full sm:w-auto">
              <RefreshCw className="mr-1 h-3 w-3" />
              {errorMessage.actionLabel || 'Try Again'}
            </Button>
          )}
        </div>

        {onDismiss && (
          <Button
            onClick={onDismiss}
            variant="ghost"
            size="sm"
            aria-label="Dismiss error"
            className="self-start"
          >
            Dismiss
          </Button>
        )}
      </div>
    </Alert>
  )
}

interface ErrorPageProps {
  error: any
  onRetry?: () => void
  onGoHome?: () => void
  showTechnicalDetails?: boolean
}

export function ErrorPage({
  error,
  onRetry,
  onGoHome,
  showTechnicalDetails = false,
}: ErrorPageProps) {
  return (
    <div className="min-h-screen bg-muted/30 px-4 py-10">
      <div className="mx-auto max-w-xl">
        <ErrorDisplay
          error={error}
          onRetry={onRetry}
          onAction={onGoHome}
          showTechnicalDetails={showTechnicalDetails}
        />

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Need help?{' '}
          <a href="/contact" className="font-medium text-primary hover:underline">
            Contact Support
          </a>
        </p>
      </div>
    </div>
  )
}
