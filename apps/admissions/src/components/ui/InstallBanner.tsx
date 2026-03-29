/**
 * InstallBanner Component
 * Shows a PWA install call-to-action banner using the canonical Banner component.
 * - Uses the `useInstallPrompt` hook
 * - Shown at most once per session (sessionStorage flag)
 * - Dismissal remembered for 7 days via localStorage timestamp
 * - Not shown if browser doesn't support PWA (`canInstall` is false)
 *
 * Requirements: 19.4, 20.2
 */

import { useState, useEffect, useCallback } from 'react'
import { Download } from 'lucide-react'
import { useInstallPrompt } from '@/hooks/useInstallPrompt'
import { Banner } from '@/components/ui/Banner'

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

  useEffect(() => {
    if (!canInstall) return
    if (isDismissedRecently() || wasShownThisSession()) return

    // Small delay so the banner doesn't flash on page load
    const timer = setTimeout(() => {
      markShownThisSession()
      setVisible(true)
    }, 3000)

    return () => clearTimeout(timer)
  }, [canInstall])

  const handleInstall = useCallback(async () => {
    const outcome = await showPrompt()
    if (outcome === 'accepted' || outcome === 'dismissed') {
      markDismissed()
    }
    setVisible(false)
  }, [showPrompt])

  const handleDismiss = useCallback(() => {
    markDismissed()
    dismissPrompt()
    setVisible(false)
  }, [dismissPrompt])

  if (!visible) return null

  return (
    <Banner variant="pwa" dismissible onDismiss={handleDismiss}>
      <span className="flex items-center gap-3">
        <span>Install MIHAS for faster access and offline support.</span>
        <button
          type="button"
          onClick={handleInstall}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-colors duration-fast hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Install
        </button>
      </span>
    </Banner>
  )
}
