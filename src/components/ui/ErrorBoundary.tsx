import { Component, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

import { ErrorDisplay } from './ErrorDisplay'

// ---------------------------------------------------------------------------
// Canonical ErrorBoundary — design-doc interface (Requirements 2.2, 8.5)
// ---------------------------------------------------------------------------

export interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onReset?: () => void
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
  }

  private handleReset = () => {
    this.props.onReset?.()
    this.setState({ hasError: false, error: undefined })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      const level = this.props.level ?? 'section'

      return (
        <div
          className={cn(
            level === 'page' && 'flex min-h-screen items-center justify-center p-6',
            level === 'section' && 'p-4',
          )}
        >
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
