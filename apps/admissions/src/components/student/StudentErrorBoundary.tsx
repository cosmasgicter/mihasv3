import React from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui'
import { logger } from '@/lib/logger'

interface StudentErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

interface StudentErrorBoundaryProps {
  children: React.ReactNode
}

/**
 * Error boundary specifically for student pages
 * Provides a user-friendly fallback UI with student-specific recovery options
 * Requirements: 11.1, 11.8
 */
export class StudentErrorBoundary extends React.Component<
  StudentErrorBoundaryProps,
  StudentErrorBoundaryState
> {
  constructor(props: StudentErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<StudentErrorBoundaryState> {
    // Check if this is an extension-related error that should be ignored
    const message = error.message || ''
    if (
      message.includes('Could not establish connection') ||
      message.includes('Receiving end does not exist') ||
      message.includes('Extension context invalidated') ||
      message.includes('chrome-extension://') ||
      message.includes('Private Access Token challenge') ||
      message.includes('cdn-cgi/challenge-platform') ||
      message.includes('Failed to load resource') ||
      message.includes('Registration failed')
    ) {
      // Don't show error boundary for extension conflicts
      return { hasError: false, error: null, errorInfo: null }
    }

    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Check if this is an extension-related error that should be ignored
    const message = error.message || ''
    if (
      message.includes('Could not establish connection') ||
      message.includes('Receiving end does not exist') ||
      message.includes('Extension context invalidated') ||
      message.includes('chrome-extension://') ||
      message.includes('Private Access Token challenge') ||
      message.includes('cdn-cgi/challenge-platform') ||
      message.includes('Failed to load resource') ||
      message.includes('Registration failed')
    ) {
      return
    }

    // Log error without PII (Requirements: 4.9, 10.6)
    logger.error('Student page error:', {
      error: {
        name: error.name,
        message: error.message,
      },
      timestamp: new Date().toISOString(),
      path: window.location.pathname,
    })

    this.setState({
      error,
      errorInfo,
    })
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
  }

  handleReload = () => {
    window.location.reload()
  }

  handleGoHome = () => {
    window.location.href = '/student/dashboard'
  }

  render() {
    if (this.state.hasError) {
      const isDevelopment = import.meta.env.DEV

      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <Card className="max-w-2xl w-full p-8">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <AlertTriangle className="h-8 w-8 text-amber-500" />
              </div>
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-foreground mb-2">
                  Something went wrong
                </h1>
                <p className="text-muted-foreground mb-4">
                  We encountered an error while loading this page. Don't worry - your
                  application data is safely saved. Please try again.
                </p>

                {isDevelopment && this.state.error && (
                  <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
                    <h3 className="text-sm font-semibold text-red-800 mb-2">
                      Error Details (Development Only)
                    </h3>
                    <p className="text-sm text-red-700 font-mono mb-2">
                      {this.state.error.message}
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={this.handleReset}
                    variant="default"
                    className="flex items-center gap-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Try Again
                  </Button>
                  <Button
                    onClick={this.handleReload}
                    variant="outline"
                    className="flex items-center gap-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Reload Page
                  </Button>
                  <Button
                    onClick={this.handleGoHome}
                    variant="outline"
                    className="flex items-center gap-2"
                  >
                    <Home className="h-4 w-4" />
                    Go to Dashboard
                  </Button>
                </div>

                <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
                  <h3 className="text-sm font-semibold text-blue-800 mb-2">
                    Your data is safe
                  </h3>
                  <p className="text-sm text-blue-700">
                    Your application progress is automatically saved every 8 seconds.
                    If you were filling out a form, your data should still be there
                    when you reload the page.
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}
