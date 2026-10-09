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
  /**
   * The heading level for `variant="section"`'s title.
   *
   * Task 13.3 measured `h1 -> h3` on the student status surface
   * (**GATE-13.3-08**): this component hardcoded `h3`, and a section-variant error
   * rendered directly under a page's `h1` therefore skipped `h2`. `h2` is the
   * correct default for a region that sits at page level; a caller nesting this
   * inside a `SectionCard` (which renders its own `h2`) can pass `h3`.
   */
  headingLevel?: 'h2' | 'h3'
}

export function ErrorDisplay({
  title,
  message,
  onRetry,
  onGoBack,
  supportUrl = '/contact',
  variant = 'section',
  className,
  headingLevel = 'h2',
}: ErrorDisplayProps) {
  if (!message || !message.trim()) return null

  /*
    Every control in this primitive is a 44 px target (GATE-13.3-04, 13.6 §8.1
    item L6; R16.2).

    `Contact Support`, `Retry` and `Go Back` were `inline-flex … text-sm` links
    with no touch floor — measured 126.797 x 20 and ~66 x 20 by task 13.3. Because
    this is a *shared primitive*, that 20 px height was on **every error state in
    the product**, which is why one class fixes more than one screen. The links
    still look like links; `min-h-touch` grows the hit area, and `items-center`
    keeps the glyph and the label optically centred inside it.
  */
  const linkTargetClass =
    'inline-flex min-h-touch items-center gap-1 rounded-md text-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
  const SectionHeading = headingLevel

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
          <div className="mt-1 flex flex-wrap items-center gap-x-3">
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className={cn(linkTargetClass, 'font-medium text-primary')}
              >
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                Retry
              </button>
            )}
            {!onRetry && onGoBack && (
              <button
                type="button"
                onClick={onGoBack}
                className={cn(linkTargetClass, 'font-medium text-primary')}
              >
                <ArrowLeft className="h-3 w-3" aria-hidden="true" />
                Go Back
              </button>
            )}
            <a
              href={supportUrl}
              className={cn(linkTargetClass, 'text-muted-foreground hover:text-foreground')}
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
        'flex flex-col items-center gap-4 rounded-lg border border-border/60 bg-card p-8 text-center shadow-sm',
        className,
      )}
    >
      <div className="rounded-full bg-destructive/10 p-3">
        <XCircle className="h-6 w-6 text-destructive" aria-hidden="true" />
      </div>

      <div className="space-y-1.5">
        {title && (
          <SectionHeading className="text-lg font-semibold text-foreground">{title}</SectionHeading>
        )}
        <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-3 pt-1">
        {onRetry && (
          <Button onClick={onRetry} variant="default" size="default" className="min-h-touch">
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Try Again
          </Button>
        )}
        {!onRetry && onGoBack && (
          <Button onClick={onGoBack} variant="outline" size="default" className="min-h-touch">
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            Go Back
          </Button>
        )}
        <a
          href={supportUrl}
          className={cn(linkTargetClass, 'px-2 text-muted-foreground hover:text-foreground')}
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          Contact Support
        </a>
      </div>
    </div>
  )
}
