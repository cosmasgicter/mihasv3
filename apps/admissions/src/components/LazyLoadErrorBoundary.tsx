import React, { Component, type ReactNode } from 'react'
import { evaluateChunkAutoReloadPolicy } from '@/lib/chunkAutoReloadPolicy'
import { BROWSER_KEYS, LEGACY_BROWSER_KEYS } from '@/lib/browserNamespace'

// Session storage keys for chunk auto-reload state
const SS_RELOAD_GUARD = BROWSER_KEYS.chunkReloadGuard
const SS_RELOAD_TS = BROWSER_KEYS.chunkReloadTs
const SS_RELOAD_COUNT = BROWSER_KEYS.chunkReloadCount
const LEGACY_SS_RELOAD_GUARD = LEGACY_BROWSER_KEYS.chunkReloadGuard
const LEGACY_SS_RELOAD_TS = LEGACY_BROWSER_KEYS.chunkReloadTs
const LEGACY_SS_RELOAD_COUNT = LEGACY_BROWSER_KEYS.chunkReloadCount

// Policy defaults
const MAX_PER_SESSION = 3
const COOLDOWN_MS = 30_000

const logChunkReloadWarning = (message: string, context?: unknown): void => {
  if (import.meta.env.DEV) {
    console.warn(message, context)
    return
  }

  void import('@/lib/logger')
    .then(({ logger }) => logger.warn(message, context))
    .catch(() => {
      // Chunk recovery should keep working even if telemetry cannot load.
    })
}

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
 * and automatically reloads the page when the chunk auto-reload policy allows,
 * falling back to manual retry/reload buttons when the policy denies.
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

  componentDidCatch(_error: Error): void {
    if (!this.state.isChunkError) {
      return
    }

    // Read reload state from session storage
    let reloadCount = 0
    let lastReloadAt = 0
    try {
      const storedCount =
        window.sessionStorage.getItem(SS_RELOAD_COUNT) ??
        window.sessionStorage.getItem(LEGACY_SS_RELOAD_COUNT)
      const storedTs =
        window.sessionStorage.getItem(SS_RELOAD_TS) ??
        window.sessionStorage.getItem(LEGACY_SS_RELOAD_TS)
      if (storedCount !== null) reloadCount = Number(storedCount) || 0
      if (storedTs !== null) lastReloadAt = Number(storedTs) || 0
    } catch {
      // sessionStorage may be unavailable — fall through to manual UI
    }

    const now = Date.now()
    const route = window.location.pathname
    // Use lastReloadAt as a proxy for last activity; if no prior reload, default
    // to 0 so idle-protected routes are conservatively denied.
    const lastActivityAt = lastReloadAt > 0 ? lastReloadAt : 0

    const decision = evaluateChunkAutoReloadPolicy({
      now,
      lastReloadAt,
      reloadCount,
      maxPerSession: MAX_PER_SESSION,
      cooldownMs: COOLDOWN_MS,
      route,
      lastActivityAt,
    })

    if (decision.allow) {
      // Persist updated reload state before reloading
      try {
        window.sessionStorage.setItem(SS_RELOAD_COUNT, String(reloadCount + 1))
        window.sessionStorage.setItem(SS_RELOAD_TS, String(now))
        window.sessionStorage.setItem(SS_RELOAD_GUARD, '1')
        window.sessionStorage.removeItem(LEGACY_SS_RELOAD_COUNT)
        window.sessionStorage.removeItem(LEGACY_SS_RELOAD_TS)
        window.sessionStorage.removeItem(LEGACY_SS_RELOAD_GUARD)
      } catch {
        // best effort persistence
      }
      logChunkReloadWarning('Auto-reloading due to stale chunk...', { route, reloadCount: reloadCount + 1 })
      window.location.reload()
    } else {
      logChunkReloadWarning('Chunk auto-reload denied by policy', { cause: decision.cause, context: decision.context })
    }
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
