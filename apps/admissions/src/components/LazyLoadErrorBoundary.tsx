import React, { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallbackMessage?: string
}

interface State {
  hasError: boolean
  isChunkError: boolean
}

/**
 * Error boundary that catches chunk load failures (e.g. from React.lazy)
 * and shows a retry button so users can recover without a full page reload.
 */
export class LazyLoadErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, isChunkError: false }

  static getDerivedStateFromError(error: Error): State {
    const isChunkError =
      error.name === 'ChunkLoadError' ||
      error.message.includes('Loading chunk') ||
      error.message.includes('Failed to fetch dynamically imported module') ||
      error.message.includes('Importing a module script failed')

    return { hasError: true, isChunkError }
  }

  handleRetry = () => {
    this.setState({ hasError: false, isChunkError: false })
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    const message =
      this.props.fallbackMessage ??
      (this.state.isChunkError
        ? 'A newer version of the app is available, or the network request failed.'
        : 'Something went wrong loading this section.')

    return (
      <div
        role="alert"
        className="flex flex-col items-center justify-center gap-4 rounded-lg border border-border bg-card p-8 text-center"
      >
        <p className="text-sm text-muted-foreground">{message}</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={this.handleRetry}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Try again
          </button>
          {this.state.isChunkError && (
            <button
              type="button"
              onClick={this.handleReload}
              className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Reload page
            </button>
          )}
        </div>
      </div>
    )
  }
}
