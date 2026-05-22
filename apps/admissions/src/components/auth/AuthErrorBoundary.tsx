import React, { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Trash2, Home, Key } from 'lucide-react'
import { logger } from '@/lib/logger'
import { clearSession } from '@/lib/secureStorage'
import { resetCache } from '@/lib/localStorageCache'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  clearedSession: boolean
}

export class AuthErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      clearedSession: false
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error('AuthErrorBoundary caught error:', error, errorInfo)
  }

  private handleReload = () => {
    window.location.reload()
  }

  private handleClearData = async () => {
    try {
      await clearSession()
      resetCache()
      sessionStorage.clear()
      this.setState({ clearedSession: true })
    } catch (err) {
      logger.error('AuthErrorBoundary failed to clear session:', err)
    }
  }

  private handleGoHome = () => {
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-tr from-slate-950 via-slate-900 to-slate-950 p-6 text-slate-100">
          <div
            role="alert"
            aria-live="assertive"
            className="w-full max-w-md rounded-2xl border border-slate-800/80 bg-slate-900/60 backdrop-blur-xl p-8 text-center shadow-2xl transition-all duration-300 hover:border-indigo-500/30"
          >
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/10 text-rose-400 ring-8 ring-rose-500/5 animate-pulse">
              <AlertTriangle className="h-8 w-8" />
            </div>

            <h1 className="mb-3 text-2xl font-bold tracking-tight text-slate-100">
              Authentication Error
            </h1>
            
            <p className="mb-6 text-sm text-slate-400 leading-relaxed">
              We encountered a secure session initialization issue. This is usually caused by transient network interruptions or stale credential caches.
            </p>

            {this.state.error && (
              <div className="mb-6 rounded-lg bg-slate-950/80 p-4 text-left border border-slate-800/50">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Error Diagnostics</p>
                <code className="text-xs text-rose-300 break-words block font-mono">
                  {this.state.error.message || 'Unknown secure channel fault'}
                </code>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <button
                onClick={this.handleReload}
                className="flex items-center justify-center gap-2 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 active:scale-[0.98] transition-all duration-150 cursor-pointer"
              >
                <RefreshCw className="h-4 w-4" />
                Retry Connection
              </button>

              <button
                onClick={this.handleClearData}
                disabled={this.state.clearedSession}
                className={`flex items-center justify-center gap-2 w-full rounded-xl border border-slate-800 px-4 py-3 text-sm font-semibold text-slate-300 hover:bg-slate-800/40 active:scale-[0.98] transition-all duration-150 cursor-pointer ${
                  this.state.clearedSession ? 'opacity-60 cursor-not-allowed border-emerald-500/30 text-emerald-400 bg-emerald-950/10' : ''
                }`}
              >
                {this.state.clearedSession ? (
                  <>
                    <Key className="h-4 w-4" />
                    Caches Cleared Successfully
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Clear Cache & Reset Session
                  </>
                )}
              </button>

              <button
                onClick={this.handleGoHome}
                className="flex items-center justify-center gap-2 w-full rounded-xl px-4 py-3 text-sm font-semibold text-slate-400 hover:text-white transition-all duration-150 cursor-pointer"
              >
                <Home className="h-4 w-4" />
                Return to Home
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
