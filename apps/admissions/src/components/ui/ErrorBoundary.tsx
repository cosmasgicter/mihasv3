import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

import { Button } from './Button'
import { ErrorDisplay } from './ErrorDisplay'
import { classifyBoundaryError } from '@/lib/errorBoundaryCopy'

// ---------------------------------------------------------------------------
// Canonical ErrorBoundary — design-doc interface (Requirements 2.2, 8.5, 10.3)
// ---------------------------------------------------------------------------

export interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onReset?: () => void
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
  level?: 'page' | 'section'
}

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

const reportBoundaryError = (error: Error, errorInfo: React.ErrorInfo): void => {
  if (import.meta.env.DEV) {
    console.error('ErrorBoundary caught:', error, errorInfo)
    return
  }

  void import('@/lib/logger')
    .then(({ logger }) => logger.error('ErrorBoundary caught:', error, errorInfo))
    .catch(() => {
      // Rendering the fallback matters more than telemetry availability.
    })
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    reportBoundaryError(error, errorInfo)
    this.props.onError?.(error, errorInfo)
  }

  private handleReset = () => {
    this.props.onReset?.()
    this.setState({ hasError: false, error: undefined })
  }

  private handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      /*
        `fallback={null}` means *"render nothing"*, not *"no fallback given"*
        (task 13.6 remediation L6, GATE-13.3-10).

        This was `if (this.props.fallback) return this.props.fallback`, and `null` is
        falsy — so a caller asking for a silent boundary got the **default** fallback
        instead. Found by measurement rather than by reading: the SessionMonitor
        boundary added in `AuthenticatedRouteShell` for exactly this purpose still
        replaced the student's page, and the harness row said so.

        `'fallback' in this.props` distinguishes the two, which is the only check that
        does: `undefined` is what React gives an absent prop.
      */
      if ('fallback' in this.props && this.props.fallback !== undefined) {
        return this.props.fallback
      }

      const level = this.props.level ?? 'section'

      /*
        The copy is classified, never quoted (GATE-13.3-10, 13.6 §8.1 item L6;
        R16.8, finding STU-10).

        The section fallback used to render `this.state.error?.message`, so a lazy
        route chunk failing while the connection was down printed
        *"Cannot read properties of undefined (reading 'SessionMonitor')"* at a
        student mid-application. `classifyBoundaryError` returns one of four
        sentences — offline, chunk, network, unknown — and the exception itself
        goes only to `reportBoundaryError` and `onError`, which is where a
        stack trace belongs. `navigator.onLine` is read here rather than inside the
        classifier so the classifier stays pure and testable.
      */
      const copy = classifyBoundaryError(
        this.state.error,
        typeof navigator === 'undefined' ? true : navigator.onLine !== false,
      )

      if (level === 'page') {
        return (
          <div className="flex min-h-screen items-center justify-center p-6">
            <div
              role="alert"
              aria-live="assertive"
              data-boundary-kind={copy.kind}
              className="flex max-w-md flex-col items-center gap-4 rounded-lg border border-destructive/30 bg-card p-8 text-center shadow-md"
            >
              <div className="rounded-full bg-destructive/10 p-3">
                <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden="true" />
              </div>

              <div className="space-y-2">
                <h1 className="text-xl font-semibold text-destructive">{copy.title}</h1>
                <p className="text-sm text-muted-foreground">{copy.message}</p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button
                  onClick={this.handleReset}
                  variant="default"
                  className="min-h-touch min-w-touch"
                >
                  <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                  Try again
                </Button>
                {copy.offerReload && (
                  <Button
                    onClick={this.handleReload}
                    variant="outline"
                    className="min-h-touch min-w-touch"
                  >
                    Reload page
                  </Button>
                )}
              </div>
            </div>
          </div>
        )
      }

      // section-level fallback
      return (
        <div className="p-4" data-boundary-kind={copy.kind}>
          <ErrorDisplay
            title={copy.title}
            message={copy.message}
            onRetry={this.handleReset}
            variant="section"
          />
        </div>
      )
    }

    return this.props.children
  }
}
