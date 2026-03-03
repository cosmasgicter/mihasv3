/**
 * InstallBanner Component
 * Shows a PWA install call-to-action banner.
 * - Uses the `useInstallPrompt` hook (task 20.1)
 * - Shown at most once per session (sessionStorage flag)
 * - Dismissal remembered for 7 days via localStorage timestamp
 * - Not shown if browser doesn't support PWA (`canInstall` is false)
 *
 * Requirement 20: Implement Reliable PWA Install Prompts
 */

import { useState, useEffect, useCallback } from 'react'
import { Download, X } from 'lucide-react'
import { useInstallPrompt } from '@/hooks/useInstallPrompt'

const DISMISS_KEY = 'mihas_install_dismissed_at'
const SESSION_KEY = 'mihas_install_shown'
const DISMISS_DAYS = 7

function isDismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const ts = parseInt(raw, 10)
    if (Number.isNaN(ts)) return false
    const elapsed = Date.now() - ts
    return elapsed < DISMISS_DAYS * 24 * 60 * 60 * 1000
  } catch {
    return false
  }
}

function wasShownThisSession(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1'
  } catch {
    return false
  }
}

function markShownThisSession(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, '1')
  } catch {
    // sessionStorage unavailable — silently ignore
  }
}

function markDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, Date.now().toString())
  } catch {
    // localStorage unavailable — silently ignore
  }
  markShownThisSession()
}

export function InstallBanner() {
  const { canInstall, showPrompt, dismissPrompt } = useInstallPrompt()
  const [visible, setVisible] = useState(false)
  const [animateIn, setAnimateIn] = useState(false)

  useEffect(() => {
    if (!canInstall) return
    if (isDismissedRecently() || wasShownThisSession()) return

    // Small delay so the banner doesn't flash on page load
    const timer = setTimeout(() => {
      markShownThisSession()
      setVisible(true)
      requestAnimationFrame(() => setAnimateIn(true))
    }, 3000)

    return () => clearTimeout(timer)
  }, [canInstall])

  const handleInstall = useCallback(async () => {
    const outcome = await showPrompt()
    if (outcome === 'accepted' || outcome === 'dismissed') {
      markDismissed()
    }
    setAnimateIn(false)
    setTimeout(() => setVisible(false), 200)
  }, [showPrompt])

  const handleDismiss = useCallback(() => {
    markDismissed()
    dismissPrompt()
    setAnimateIn(false)
    setTimeout(() => setVisible(false), 200)
  }, [dismissPrompt])

  if (!visible) return null

  return (
    <div
      role="banner"
      aria-label="Install MIHAS application"
      className={[
        'fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-sm',
        'transform transition-all duration-200 ease-out',
        animateIn ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
      ].join(' ')}
    >
      <div className="rounded-xl border border-primary/20 bg-card p-4 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground">
              Install MIHAS
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Add to your home screen for faster access and offline support.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            aria-label="Dismiss install banner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={handleInstall}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Install
        </button>
      </div>
    </div>
  )
}
