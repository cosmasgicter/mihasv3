import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

import { Button } from './Button'
import { ErrorDisplay } from './ErrorDisplay'

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

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
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
      if (this.props.fallback) return this.props.fallback

      const level = this.props.level ?? 'section'

      if (level === 'page') {
        return (
          <div className="flex min-h-screen items-center justify-center p-6">
            <div
              role="alert"
              aria-live="assertive"
              className="flex max-w-md flex-col items-center gap-4 rounded-lg border border-destructive/30 bg-card p-8 text-center shadow-md"
            >
              <div className="rounded-full bg-destructive/10 p-3">
                <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden="true" />
              </div>

              <div className="space-y-2">
                <h1 className="text-xl font-semibold text-destructive">
                  Something went wrong
                </h1>
                <p className="text-sm text-muted-foreground">
                  Please try reloading the page.
                </p>
              </div>

              <Button
                onClick={this.handleReload}
                variant="destructive"
                className="min-h-touch min-w-touch"
              >
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                Reload Page
              </Button>
            </div>
          </div>
        )
      }

      // section-level fallback
      return (
        <div className="p-4">
          <ErrorDisplay
            title="Something went wrong"
            message={this.state.error?.message || 'An unexpected error occurred'}
            onRetry={this.handleReset}
            variant="section"
          />
        </div>
      )
    }

    return this.props.children
  }
}
