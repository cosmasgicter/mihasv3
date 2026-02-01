// @ts-nocheck
/**
 * PWA Management Hook
 * Handles PWA installation, native features, and app-like experience
 * Requirements: 9.5 - Enhance app-like experience, implement native device integrations, add offline-first architecture
 */

import { useState, useEffect, useCallback } from 'react'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
  prompt(): Promise<void>
}

interface PWACapabilities {
  canInstall: boolean
  isInstalled: boolean
  isStandalone: boolean
  supportsNotifications: boolean
  supportsBackgroundSync: boolean
  supportsFileHandling: boolean
  supportsWebShare: boolean
  platform: 'ios' | 'android' | 'desktop' | 'unknown'
}

interface InstallationStats {
  prompted: boolean
  promptedAt?: Date
  installed: boolean
  installedAt?: Date
  dismissed: boolean
  dismissedAt?: Date
  platform: string
}

export function usePWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [capabilities, setCapabilities] = useState<PWACapabilities>({
    canInstall: false,
    isInstalled: false,
    isStandalone: false,
    supportsNotifications: false,
    supportsBackgroundSync: false,
    supportsFileHandling: false,
    supportsWebShare: false,
    platform: 'unknown'
  })
  const [installationStats, setInstallationStats] = useState<InstallationStats | null>(null)

  // Detect PWA capabilities
  useEffect(() => {
    const detectCapabilities = () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                          (window.navigator as any).standalone === true ||
                          document.referrer.includes('android-app://')

      const platform = detectPlatform()
      
      const newCapabilities: PWACapabilities = {
        canInstall: !!deferredPrompt,
        isInstalled: isStandalone,
        isStandalone,
        supportsNotifications: 'Notification' in window && 'serviceWorker' in navigator,
        supportsBackgroundSync: 'serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype,
        supportsFileHandling: 'launchQueue' in window,
        supportsWebShare: 'share' in navigator,
        platform
      }

      setCapabilities(newCapabilities)
    }

    detectCapabilities()

    // Listen for display mode changes
    const mediaQuery = window.matchMedia('(display-mode: standalone)')
    mediaQuery.addEventListener('change', detectCapabilities)

    return () => {
      mediaQuery.removeEventListener('change', detectCapabilities)
    }
  }, [deferredPrompt])

  // Listen for beforeinstallprompt event
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }

    const handleAppInstalled = () => {
      setDeferredPrompt(null)
      setCapabilities(prev => ({ ...prev, isInstalled: true, canInstall: false }))
      
      // Track installation
      const stats: InstallationStats = {
        prompted: true,
        installed: true,
        installedAt: new Date(),
        dismissed: false,
        platform: detectPlatform()
      }
      setInstallationStats(stats)
      saveInstallationStats(stats)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    // Load existing installation stats
    loadInstallationStats()

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  // Prompt user to install PWA
  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) {
      return false
    }

    try {
      await deferredPrompt.prompt()
      const choiceResult = await deferredPrompt.userChoice

      const stats: InstallationStats = {
        prompted: true,
        promptedAt: new Date(),
        installed: choiceResult.outcome === 'accepted',
        installedAt: choiceResult.outcome === 'accepted' ? new Date() : undefined,
        dismissed: choiceResult.outcome === 'dismissed',
        dismissedAt: choiceResult.outcome === 'dismissed' ? new Date() : undefined,
        platform: choiceResult.platform
      }

      setInstallationStats(stats)
      saveInstallationStats(stats)

      if (choiceResult.outcome === 'accepted') {
        setDeferredPrompt(null)
        return true
      }

      return false
    } catch (error) {
      console.error('Failed to prompt install:', error)
      return false
    }
  }, [deferredPrompt])

  // Share content using Web Share API
  const shareContent = useCallback(async (data: {
    title?: string
    text?: string
    url?: string
    files?: File[]
  }): Promise<boolean> => {
    if (!capabilities.supportsWebShare) {
      return false
    }

    try {
      await navigator.share(data)
      return true
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Failed to share:', error)
      }
      return false
    }
  }, [capabilities.supportsWebShare])

  // Handle file drops (for PWA file handling)
  const handleFileDrop = useCallback((files: FileList) => {
    if (!capabilities.supportsFileHandling) {
      return false
    }

    // Process dropped files
    Array.from(files).forEach(file => {
      console.log('Handling file:', file.name, file.type)
      // Implement file handling logic here
    })

    return true
  }, [capabilities.supportsFileHandling])

  // Register for background sync
  const registerBackgroundSync = useCallback(async (tag: string): Promise<boolean> => {
    if (!capabilities.supportsBackgroundSync) {
      return false
    }

    try {
      const registration = await navigator.serviceWorker.ready
      await registration.sync.register(tag)
      return true
    } catch (error) {
      console.error('Failed to register background sync:', error)
      return false
    }
  }, [capabilities.supportsBackgroundSync])

  // Get app badge support
  const setBadge = useCallback(async (count?: number): Promise<boolean> => {
    if (!('setAppBadge' in navigator)) {
      return false
    }

    try {
      if (count !== undefined) {
        await (navigator as any).setAppBadge(count)
      } else {
        await (navigator as any).clearAppBadge()
      }
      return true
    } catch (error) {
      console.error('Failed to set app badge:', error)
      return false
    }
  }, [])

  // Handle app shortcuts
  const handleShortcut = useCallback((shortcutId: string) => {
    switch (shortcutId) {
      case 'new-application':
        window.location.href = '/apply'
        break
      case 'dashboard':
        window.location.href = '/dashboard'
        break
      default:
        console.log('Unknown shortcut:', shortcutId)
    }
  }, [])

  // Check if app was launched from shortcut
  useEffect(() => {
    if ('launchQueue' in window) {
      (window as any).launchQueue.setConsumer((launchParams: any) => {
        if (launchParams.targetURL) {
          const url = new URL(launchParams.targetURL)
          const shortcut = url.searchParams.get('shortcut')
          if (shortcut) {
            handleShortcut(shortcut)
          }
        }
      })
    }
  }, [handleShortcut])

  // Optimize for standalone mode
  useEffect(() => {
    if (capabilities.isStandalone) {
      // Add standalone-specific styles
      document.documentElement.classList.add('pwa-standalone')
      
      // Handle navigation in standalone mode
      const handleNavigation = (e: Event) => {
        const target = e.target as HTMLAnchorElement
        if (target.tagName === 'A' && target.href && !target.target) {
          // Keep navigation within the app
          if (target.href.startsWith(window.location.origin)) {
            e.preventDefault()
            window.location.href = target.href
          }
        }
      }

      document.addEventListener('click', handleNavigation)
      
      return () => {
        document.removeEventListener('click', handleNavigation)
        document.documentElement.classList.remove('pwa-standalone')
      }
    }
  }, [capabilities.isStandalone])

  return {
    capabilities,
    installationStats,
    canInstall: capabilities.canInstall,
    isInstalled: capabilities.isInstalled,
    isStandalone: capabilities.isStandalone,
    promptInstall,
    shareContent,
    handleFileDrop,
    registerBackgroundSync,
    setBadge,
    handleShortcut
  }
}

// Helper functions
function detectPlatform(): 'ios' | 'android' | 'desktop' | 'unknown' {
  const userAgent = navigator.userAgent.toLowerCase()
  
  if (/iphone|ipad|ipod/.test(userAgent)) {
    return 'ios'
  }
  
  if (/android/.test(userAgent)) {
    return 'android'
  }
  
  if (/windows|mac|linux/.test(userAgent)) {
    return 'desktop'
  }
  
  return 'unknown'
}

function saveInstallationStats(stats: InstallationStats): void {
  try {
    localStorage.setItem('pwa_installation_stats', JSON.stringify(stats))
  } catch (error) {
    console.error('Failed to save installation stats:', error)
  }
}

function loadInstallationStats(): InstallationStats | null {
  try {
    const stored = localStorage.getItem('pwa_installation_stats')
    return stored ? JSON.parse(stored) : null
  } catch (error) {
    console.error('Failed to load installation stats:', error)
    return null
  }
}