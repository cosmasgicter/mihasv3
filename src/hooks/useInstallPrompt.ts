/**
 * useInstallPrompt Hook
 * Captures the browser's `beforeinstallprompt` event and exposes
 * a clean API for showing/dismissing the PWA install prompt.
 *
 * Requirement 20: Implement Reliable PWA Install Prompts
 */

import { useState, useEffect, useCallback, useRef } from 'react'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
  prompt(): Promise<void>
}

interface UseInstallPromptReturn {
  /** True when the browser has fired `beforeinstallprompt` and the event is available */
  canInstall: boolean
  /** Triggers the native install prompt. Returns the user's choice outcome. */
  showPrompt: () => Promise<'accepted' | 'dismissed' | null>
  /** Clears the stored event, hiding any install UI */
  dismissPrompt: () => void
}

export function useInstallPrompt(): UseInstallPromptReturn {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null)

  // Keep ref in sync so callbacks always have the latest value
  useEffect(() => {
    promptRef.current = deferredPrompt
  }, [deferredPrompt])

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the browser's default mini-infobar
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }

    const handleAppInstalled = () => {
      // App was installed — clear the prompt
      setDeferredPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const showPrompt = useCallback(async (): Promise<'accepted' | 'dismissed' | null> => {
    const prompt = promptRef.current
    if (!prompt) return null

    try {
      await prompt.prompt()
      const { outcome } = await prompt.userChoice

      // The prompt can only be used once — clear it regardless of outcome
      setDeferredPrompt(null)

      return outcome
    } catch {
      return null
    }
  }, [])

  const dismissPrompt = useCallback(() => {
    setDeferredPrompt(null)
  }, [])

  return {
    canInstall: deferredPrompt !== null,
    showPrompt,
    dismissPrompt,
  }
}
