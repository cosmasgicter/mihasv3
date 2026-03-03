import { useEffect, useState } from 'react'
import { logReloadEvent, performReload, resolveBuildKey } from '@/lib/reloadControl'

interface ServiceWorkerUpdateState {
  updateAvailable: boolean
  currentVersion: string | null
  newVersion: string | null
  isUpdating: boolean
}

interface ServiceWorkerUpdateActions {
  updateServiceWorker: () => Promise<void>
  dismissUpdate: () => void
}

export function useServiceWorkerUpdate(): ServiceWorkerUpdateState & ServiceWorkerUpdateActions {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [currentVersion, setCurrentVersion] = useState<string | null>(null)
  const [newVersion, setNewVersion] = useState<string | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null)
  const SW_RELOAD_PENDING_KEY = 'mihas_sw_reload_pending'
  const SW_RELOAD_HANDLED_KEY = 'mihas_sw_reload_handled'
  const buildKey = resolveBuildKey()

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return
    }

    // Get current version from active service worker
    const getCurrentVersion = async () => {
      const registration = await navigator.serviceWorker.getRegistration()
      if (registration?.active) {
        const messageChannel = new MessageChannel()
        
        messageChannel.port1.onmessage = (event) => {
          if (event.data.appVersion) {
            setCurrentVersion(event.data.appVersion)
          }
        }
        
        registration.active.postMessage(
          { type: 'GET_VERSION' },
          [messageChannel.port2]
        )
      }
    }

    getCurrentVersion()

    // Listen for service worker updates
    let registration: ServiceWorkerRegistration | null = null
    let trackedInstallingWorker: ServiceWorker | null = null
    let updateInterval: ReturnType<typeof setInterval> | null = null
    let isEffectActive = true

    let lastUpdateCheckAt = 0
    let lastUpdateFoundAt = 0


    const handleInstallingStateChange = () => {
      if (!trackedInstallingWorker) {
        return
      }

      if (trackedInstallingWorker.state === 'installed' && navigator.serviceWorker.controller) {
        // New service worker is installed and waiting
        console.log('[SW Update] New service worker available')
        setWaitingWorker(trackedInstallingWorker)
        setUpdateAvailable(true)

        // Try to get new version
        const messageChannel = new MessageChannel()
        messageChannel.port1.onmessage = (event) => {
          if (event.data.appVersion) {
            setNewVersion(event.data.appVersion)
          }
        }

        trackedInstallingWorker.postMessage(
          { type: 'GET_VERSION' },
          [messageChannel.port2]
        )
      }
    }

    const handleUpdateFound = () => {
      if (!registration) {
        return
      }

      const now = Date.now()
      if (now - lastUpdateFoundAt < 5_000) {
        logReloadEvent({
          reason: 'sw_controller_change',
          mode: 'auto',
          buildKey,
          details: { ignored: true, cause: 'updatefound-debounced' }
        })
        return
      }
      lastUpdateFoundAt = now

      if (trackedInstallingWorker) {
        trackedInstallingWorker.removeEventListener('statechange', handleInstallingStateChange)
      }

      trackedInstallingWorker = registration.installing

      if (!trackedInstallingWorker) {
        return
      }

      trackedInstallingWorker.addEventListener('statechange', handleInstallingStateChange)
    }

    const handleControllerChange = () => {
      // Avoid unexpected reloads when SW controller is first attached on mobile.
      // Only reload when an update was explicitly triggered by the user.
      if (sessionStorage.getItem(SW_RELOAD_PENDING_KEY) !== '1') {
        logReloadEvent({
          reason: 'sw_controller_change',
          mode: 'auto',
          buildKey,
          details: { ignored: true, cause: 'pending-flag-missing' }
        })
        return
      }

      if (sessionStorage.getItem(SW_RELOAD_HANDLED_KEY) === '1') {
        logReloadEvent({
          reason: 'sw_controller_change',
          mode: 'auto',
          buildKey,
          details: { ignored: true, cause: 'already-handled' }
        })
        return
      }

      sessionStorage.setItem(SW_RELOAD_HANDLED_KEY, '1')
      sessionStorage.removeItem(SW_RELOAD_PENDING_KEY)
      performReload({
        reason: 'sw_controller_change',
        mode: 'user',
        buildKey,
        details: { source: 'controllerchange' }
      })
    }

    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data.type === 'cache-updated') {
        console.log('[SW Update] Cache updated to version:', event.data.version)
        setNewVersion(event.data.appVersion)
      }
    }

    const setupRegistration = async () => {
      const reg = await navigator.serviceWorker.getRegistration()
      if (!reg || !isEffectActive) {
        return
      }
      registration = reg

      // Check if there's already a waiting worker
      if (registration.waiting) {
        console.log('[SW Update] Service worker already waiting')
        setWaitingWorker(registration.waiting)
        setUpdateAvailable(true)
      }

      // Listen for new updates
      registration.addEventListener('updatefound', handleUpdateFound)

      // Check for updates periodically (every 60 seconds)
      updateInterval = setInterval(() => {
        if (!registration) {
          return
        }

        const now = Date.now()
        if (now - lastUpdateCheckAt < 30_000) {
          return
        }
        lastUpdateCheckAt = now

        registration.update().catch((error) => {
          console.error('[SW Update] Failed to check for updates:', error)
        })
      }, 60000)
    }

    setupRegistration().catch((error) => {
      console.error('[SW Update] Failed to initialize service worker registration:', error)
    })

    // Listen for controller change (new SW activated)
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)

    // Listen for messages from service worker
    navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage)

    return () => {
      isEffectActive = false

      if (updateInterval) {
        clearInterval(updateInterval)
      }

      if (trackedInstallingWorker) {
        trackedInstallingWorker.removeEventListener('statechange', handleInstallingStateChange)
      }

      if (registration) {
        registration.removeEventListener('updatefound', handleUpdateFound)
      }

      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
      navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage)
    }
  }, [])

  const updateServiceWorker = async () => {
    if (!waitingWorker) {
      console.warn('[SW Update] No waiting worker available')
      return
    }

    setIsUpdating(true)

    try {
      sessionStorage.setItem(SW_RELOAD_PENDING_KEY, '1')
      sessionStorage.removeItem(SW_RELOAD_HANDLED_KEY)

      // Tell the waiting service worker to skip waiting
      waitingWorker.postMessage({ type: 'SKIP_WAITING' })

      // Normally controllerchange triggers reload; keep a fallback for browsers
      // that occasionally miss the event during SW activation.
      window.setTimeout(() => {
        if (sessionStorage.getItem(SW_RELOAD_PENDING_KEY) !== '1') {
          return
        }

        if (sessionStorage.getItem(SW_RELOAD_HANDLED_KEY) === '1') {
          return
        }

        sessionStorage.setItem(SW_RELOAD_HANDLED_KEY, '1')
        sessionStorage.removeItem(SW_RELOAD_PENDING_KEY)
        performReload({
          reason: 'sw_controller_change',
          mode: 'user',
          buildKey,
          details: { source: 'skip-waiting-timeout-fallback' }
        })
      }, 8000)
      
      // The controllerchange event should trigger a reload immediately.
      console.log('[SW Update] Activating new service worker...')
    } catch (error) {
      console.error('[SW Update] Failed to update service worker:', error)
      sessionStorage.removeItem(SW_RELOAD_PENDING_KEY)
      setIsUpdating(false)
      
      // Fallback: keep prompt visible; avoid hard reload loops
      logReloadEvent({
        reason: 'sw_controller_change',
        mode: 'user',
        buildKey,
        details: { updateFailed: true }
      })
    }
  }

  const dismissUpdate = () => {
    setUpdateAvailable(false)
    setWaitingWorker(null)
  }

  return {
    updateAvailable,
    currentVersion,
    newVersion,
    isUpdating,
    updateServiceWorker,
    dismissUpdate
  }
}
