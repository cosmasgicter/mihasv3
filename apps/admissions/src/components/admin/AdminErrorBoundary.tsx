import React from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui'

interface AdminErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
  lastCapturedAt: string | null
}

interface AdminErrorBoundaryProps {
  children: React.ReactNode
}

const ADMIN_ERROR_CONTEXT_KEY = 'mihas:admin-error-context'

const isExtensionConflict = (message: string): boolean => (
  message.includes('Could not establish connection') ||
  message.includes('Receiving end does not exist') ||
  message.includes('Extension context invalidated') ||
  message.includes('chrome-extension://') ||
  message.includes('Private Access Token challenge') ||
  message.includes('cdn-cgi/challenge-platform') ||
  message.includes('Failed to load resource') ||
  message.includes('Registration failed')
)

/**
 * Error boundary specifically for admin pages.
 * Keeps runtime context visible to admins and avoids reload loops.
 */
export class AdminErrorBoundary extends React.Component<
  AdminErrorBoundaryProps,
  AdminErrorBoundaryState
> {
  constructor(props: AdminErrorBoundaryProps) {
    super(props)

    let persistedError: Pick<AdminErrorBoundaryState, 'error' | 'lastCapturedAt'> = {
      error: null,
      lastCapturedAt: null,
    }

    if (typeof window !== 'undefined') {
      try {
        const raw = sessionStorage.getItem(ADMIN_ERROR_CONTEXT_KEY)
        if (raw) {
          const parsed = JSON.parse(raw) as { message?: string; capturedAt?: string }
          if (parsed.message) {
            persistedError = {
              error: new Error(parsed.message),
              lastCapturedAt: parsed.capturedAt ?? null,
            }
          }
        }
      } catch {
        // best effort restore
      }
    }

    this.state = {
      hasError: false,
      error: persistedError.error,
      errorInfo: null,
      lastCapturedAt: persistedError.lastCapturedAt,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<AdminErrorBoundaryState> {
    if (isExtensionConflict(error.message || '')) {
      return { hasError: false }
    }

    return { hasError: true, error, lastCapturedAt: new Date().toISOString() }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (isExtensionConflict(error.message || '')) {
      return
    }

    const capturedAt = new Date().toISOString()

    console.error('Admin page error:', {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      errorInfo,
      timestamp: capturedAt,
      url: window.location.href,
      userAgent: navigator.userAgent,
    })

    this.setState({
      error,
      errorInfo,
      lastCapturedAt: capturedAt,
    })

    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem(ADMIN_ERROR_CONTEXT_KEY, JSON.stringify({
          name: error.name,
          message: error.message,
          ...(import.meta.env.DEV && { stack: error.stack, componentStack: errorInfo.componentStack }),
          capturedAt,
        }))
      } catch {
        // best effort persistence
      }
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: this.state.error,
      errorInfo: this.state.errorInfo,
      lastCapturedAt: this.state.lastCapturedAt,
    })
  }

  handleGoHome = () => {
    window.location.href = '/admin/dashboard'
  }

  clearPersistedContext = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(ADMIN_ERROR_CONTEXT_KEY)
    }

    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      lastCapturedAt: null,
    })
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
                <h1 className="text-2xl font-bold text-foreground mb-2">
                  Admin page crashed
                </h1>
                <p className="text-muted-foreground mb-4">
                  This runtime error was captured. Automatic reload has been disabled to avoid loops.
                </p>

                {(this.state.error || this.state.lastCapturedAt) && (
                  <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
                    <h3 className="text-sm font-semibold text-red-800 mb-2">
                      Diagnostic context
                    </h3>
                    {this.state.lastCapturedAt && (
                      <p className="text-xs text-red-700 mb-2">Captured at: {this.state.lastCapturedAt}</p>
                    )}
                    {this.state.error?.message && (
                      <p className="text-sm text-red-700 font-mono mb-2 break-all">
                        {this.state.error.message}
                      </p>
                    )}
                    {isDevelopment && (
                      <pre className="text-xs text-red-600 overflow-auto max-h-48">
                        {this.state.errorInfo?.componentStack || this.state.error?.stack}
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
                    Retry render
                  </Button>
                  <Button
                    onClick={this.handleGoHome}
                    variant="outline"
                    className="flex items-center gap-2"
                  >
                    <Home className="h-4 w-4" />
                    Go to Dashboard
                  </Button>
                  <Button
                    onClick={this.clearPersistedContext}
                    variant="outline"
                    className="flex items-center gap-2"
                  >
                    Clear error context
                  </Button>
                </div>

                <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
                  <h3 className="text-sm font-semibold text-blue-800 mb-2">
                    Next steps:
                  </h3>
                  <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
                    <li>Use "Retry render" after confirming the underlying issue is resolved</li>
                    <li>Check the error context above before clearing it</li>
                    <li>Contact support with the captured timestamp if this persists</li>
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
