import { Component, type ReactNode } from 'react'

import { ErrorDisplay } from './ErrorDisplay'

// ---------------------------------------------------------------------------
// ErrorBoundary — catches unhandled JS errors in the component tree and
// renders a fallback UI. Follows the same pattern as the admissions app.
//
// - Catches errors via componentDidCatch
// - Renders ErrorDisplay as default fallback with retry action
// - Logs to console; forwards to GlitchTip via onError callback if provided
// - Page-level variant shows full-page fallback; section-level shows inline
// ---------------------------------------------------------------------------

export interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  level?: 'page' | 'section'
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Always log to console
    console.error('[ErrorBoundary] Caught error:', error, errorInfo)

    // Forward to GlitchTip (or any external reporter) via callback
    this.props.onError?.(error, errorInfo)
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  private handleReload = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    // Custom fallback takes precedence
    if (this.props.fallback) {
      return this.props.fallback
    }

    const level = this.props.level ?? 'section'

    // Page-level: full-page centered fallback with reload action
    if (level === 'page') {
      return (
        <ErrorDisplay
          message={
            this.state.error?.message ??
            'An unexpected error occurred. Please reload the page.'
          }
          variant="page"
          onRetry={this.handleReload}
        />
      )
    }

    // Section-level: inline fallback with reset-and-retry action
    return (
      <ErrorDisplay
        message={
          this.state.error?.message ?? 'Something went wrong in this section.'
        }
        variant="section"
        onRetry={this.handleRetry}
      />
    )
  }
}
