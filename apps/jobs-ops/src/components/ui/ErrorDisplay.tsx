import clsx from 'clsx'
import { AlertTriangle, ArrowLeft, ExternalLink, RefreshCw, XCircle } from 'lucide-react'

// ---------------------------------------------------------------------------
// ErrorDisplay — jobs-ops error presentation component
// Matches the admissions convention: returns null for empty/whitespace messages,
// uses role="alert" only when a meaningful message is present.
// Styled with the jobs-ops design tokens (canvas, ink, muted, danger, primary).
// ---------------------------------------------------------------------------

export interface ErrorDisplayProps {
  message?: string
  variant?: 'page' | 'section' | 'inline'
  onRetry?: () => void
  onGoBack?: () => void
  showSupport?: boolean
}

export function ErrorDisplay({
  message,
  variant = 'section',
  onRetry,
  onGoBack,
  showSupport = false,
}: ErrorDisplayProps) {
  // Return null for empty or whitespace-only messages (admissions convention)
  if (!message || !message.trim()) return null

  // --- inline variant ---
  if (variant === 'inline') {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className={clsx(
          'flex items-start gap-2.5 rounded-xl border border-danger/20 bg-danger/5 p-3 text-sm',
        )}
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-danger" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <span className="text-danger">{message}</span>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex min-h-touch items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                Retry
              </button>
            )}
            {!onRetry && onGoBack && (
              <button
                type="button"
                onClick={onGoBack}
                className="inline-flex min-h-touch items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                <ArrowLeft className="h-3 w-3" aria-hidden="true" />
                Go Back
              </button>
            )}
            {showSupport && (
              <span className="inline-flex items-center gap-1 text-sm text-muted">
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                Contact support if this persists
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }

  // --- page variant ---
  if (variant === 'page') {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="flex min-h-[60vh] flex-col items-center justify-center gap-5 px-6 text-center"
      >
        <div className="rounded-full bg-danger/10 p-4">
          <XCircle className="h-10 w-10 text-danger" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
            Something went wrong
          </h2>
          <p className="mx-auto max-w-md text-sm leading-6 text-muted">{message}</p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex min-h-touch-lg items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Try Again
            </button>
          ) : (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex min-h-touch-lg items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Reload Page
            </button>
          )}
          {onGoBack && (
            <button
              type="button"
              onClick={onGoBack}
              className="inline-flex min-h-touch-lg items-center gap-2 rounded-full border border-line px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Go Back
            </button>
          )}
          {showSupport && (
            <span className="inline-flex items-center gap-1 text-sm text-muted">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              Contact support if this persists
            </span>
          )}
        </div>
      </div>
    )
  }

  // --- section variant (default) ---
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex flex-col items-center gap-4 rounded-[28px] border border-line/70 bg-panel/85 p-8 text-center shadow-sm"
    >
      <div className="rounded-full bg-danger/10 p-3">
        <XCircle className="h-6 w-6 text-danger" aria-hidden="true" />
      </div>

      <div className="space-y-1.5">
        <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
          Something went wrong
        </h3>
        <p className="mx-auto max-w-md text-sm leading-6 text-muted">{message}</p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-touch items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try Again
          </button>
        ) : (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex min-h-touch items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Reload Page
          </button>
        )}
        {onGoBack ? (
          <button
            type="button"
            onClick={onGoBack}
            className="inline-flex min-h-touch items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Go Back
          </button>
        ) : (
          <button
            type="button"
            onClick={() => window.history.back()}
            className="inline-flex min-h-touch items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Go Back
          </button>
        )}
        {showSupport && (
          <span className="inline-flex items-center gap-1 text-sm text-muted">
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            Contact support if this persists
          </span>
        )}
      </div>
    </div>
  )
}
