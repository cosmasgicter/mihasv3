import React from 'react'

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class SimpleErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('=== ERROR BOUNDARY CAUGHT ERROR ===')
    console.error('Error:', error)
    console.error('Error message:', error.message)
    console.error('Error stack:', error.stack)
    console.error('Component stack:', errorInfo.componentStack)
    console.error('===================================')
    console.error('ERROR:', error.message)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="min-h-screen flex items-center justify-center bg-muted">
          <div className="text-center p-8">
            <h2 className="text-xl font-semibold text-body mb-4">Something went wrong</h2>
            <p className="text-body mb-4">{this.state.error?.message || 'Unknown error'}</p>
            <p className="text-xs text-body mb-4">{this.state.error?.stack?.substring(0, 200)}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary text-body rounded-lg hover:bg-primary"
            >
              Refresh Page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}