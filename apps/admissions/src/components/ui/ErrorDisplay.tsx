import { AlertTriangle, ArrowLeft, ExternalLink, RefreshCw, XCircle } from 'lucide-react'

import { cn } from '@/lib/utils'

import { Button } from './Button'

// ---------------------------------------------------------------------------
// Canonical ErrorDisplay — design-doc interface (Requirements 2.2, 7.1–7.3, 8.4, 8.6)
// ---------------------------------------------------------------------------

export interface ErrorDisplayProps {
  title?: string
  message: string
  onRetry?: () => void
  onGoBack?: () => void
  supportUrl?: string
  variant?: 'inline' | 'section'
  className?: string
}

export function ErrorDisplay({
  title,
  message,
  onRetry,
  onGoBack,
  supportUrl = '/contact',
  variant = 'section',
  className,
}: ErrorDisplayProps) {
  if (!message || !message.trim()) return null

  if (variant === 'inline') {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className={cn('flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm', className)}
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          {title && <span className="font-medium text-foreground">{title}</span>}
          <span className="text-destructive">{message}</span>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                Retry
              </button>
            )}
            {!onRetry && onGoBack && (
              <button
                type="button"
                onClick={onGoBack}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <ArrowLeft className="h-3 w-3" aria-hidden="true" />
                Go Back
              </button>
            )}
            <a
              href={supportUrl}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
              Contact Support
            </a>
          </div>
        </div>
      </div>
    )
  }

  // section variant
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        'flex flex-col items-center gap-4 rounded-2xl border border-border/60 bg-card p-8 text-center shadow-sm',
        className,
      )}
    >
      <div className="rounded-full bg-destructive/10 p-3">
        <XCircle className="h-6 w-6 text-destructive" aria-hidden="true" />
      </div>

      <div className="space-y-1.5">
        {title && <h3 className="text-lg font-semibold text-foreground">{title}</h3>}
        <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
        {onRetry && (
          <Button onClick={onRetry} variant="default" size="default">
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Try Again
          </Button>
        )}
        {!onRetry && onGoBack && (
          <Button onClick={onGoBack} variant="outline" size="default">
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            Go Back
          </Button>
        )}
        <a
          href={supportUrl}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          Contact Support
        </a>
      </div>
    </div>
  )
}
