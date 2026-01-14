import React from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/card'

interface AdminErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

interface AdminErrorBoundaryProps {
  children: React.ReactNode
}

/**
 * Error boundary specifically for admin pages
 * Provides a user-friendly fallback UI and error reporting
 */
export class AdminErrorBoundary extends React.Component<
  AdminErrorBoundaryProps,
  AdminErrorBoundaryState
> {
  constructor(props: AdminErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<AdminErrorBoundaryState> {
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
      // Silently ignore extension errors
      return
    }

    // Log error for monitoring
    console.error('Admin page error:', {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      errorInfo,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
    })

    // Update state with error info
    this.setState({
      error,
      errorInfo,
    })

    // In production, send to monitoring service
    if (!import.meta.env.DEV) {
      // TODO: Send to monitoring service (e.g., Sentry, LogRocket)
      // Example:
      // Sentry.captureException(error, { contexts: { react: errorInfo } })
    }
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
    window.location.href = '/admin/dashboard'
  }

  render() {
    if (this.state.hasError) {
      const isDevelopment = import.meta.env.DEV

      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <Card className="max-w-2xl w-full p-8">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <AlertTriangle className="h-8 w-8 text-red-500" />
              </div>
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">
                  Something went wrong
                </h1>
                <p className="text-gray-600 mb-4">
                  We encountered an error while loading this admin page. This has been
                  logged and our team will investigate.
                </p>

                {isDevelopment && this.state.error && (
                  <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
                    <h3 className="text-sm font-semibold text-red-800 mb-2">
                      Error Details (Development Only)
                    </h3>
                    <p className="text-sm text-red-700 font-mono mb-2">
                      {this.state.error.message}
                    </p>
                    {this.state.error.stack && (
                      <pre className="text-xs text-red-600 overflow-auto max-h-48">
                        {this.state.error.stack}
                      </pre>
                    )}
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
                    What you can do:
                  </h3>
                  <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
                    <li>Try refreshing the page</li>
                    <li>Clear your browser cache and cookies</li>
                    <li>Check your internet connection</li>
                    <li>Try accessing the page from a different browser</li>
                    <li>Contact support if the problem persists</li>
                  </ul>
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
