import { useEffect, useRef, useState } from 'react'
import { logReloadEvent, performReload, resolveBuildKey } from '@/lib/reloadControl'
import { resolveServiceWorkerUpdateTrigger } from '@/lib/serviceWorkerUpdatePolicy'

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
  const currentVersionRef = useRef<string | null>(null)
  const SW_RELOAD_PENDING_KEY = 'mihas_sw_reload_pending'
  const SW_RELOAD_HANDLED_KEY = 'mihas_sw_reload_handled'
  const SW_RELOAD_REQUESTED_AT_KEY = 'mihas_sw_reload_requested_at'
  const SW_RELOAD_REQUEST_TOKEN_KEY = 'mihas_sw_reload_request_token'
  const SW_RELOAD_REQUEST_TTL_MS = 30_000
  const buildKey = resolveBuildKey()

  const clearReloadIntent = () => {
    sessionStorage.removeItem(SW_RELOAD_PENDING_KEY)
    sessionStorage.removeItem(SW_RELOAD_REQUESTED_AT_KEY)
    sessionStorage.removeItem(SW_RELOAD_REQUEST_TOKEN_KEY)
  }

  const applyDiscoveredVersion = (version: string | null, worker: ServiceWorker | null) => {
    if (!version) {
      return
    }

    if (currentVersionRef.current && version === currentVersionRef.current) {
      setWaitingWorker(null)
      setNewVersion(null)
      setUpdateAvailable(false)
      return
    }

    setWaitingWorker(worker)
    setNewVersion(version)
    setUpdateAvailable(true)
  }

  useEffect(() => {
    if (!currentVersion || !newVersion || currentVersion !== newVersion) {
      return
    }

    setWaitingWorker(null)
    setNewVersion(null)
    setUpdateAvailable(false)
  }, [currentVersion, newVersion])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return
    }

    const getCurrentVersion = async () => {
      const registration = await navigator.serviceWorker.getRegistration()
      if (registration?.active) {
        const messageChannel = new MessageChannel()

        messageChannel.port1.onmessage = (event) => {
          if (event.data.appVersion) {
            setCurrentVersion(event.data.appVersion)
            currentVersionRef.current = event.data.appVersion
          }
        }

        registration.active.postMessage({ type: 'GET_VERSION' }, [messageChannel.port2])
      }
    }

    getCurrentVersion()

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
        console.log('[SW Update] New service worker available')

        const messageChannel = new MessageChannel()
        messageChannel.port1.onmessage = (event) => {
          if (event.data.appVersion) {
            applyDiscoveredVersion(event.data.appVersion, trackedInstallingWorker)
          }
        }

        trackedInstallingWorker.postMessage({ type: 'GET_VERSION' }, [messageChannel.port2])
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
          details: { ignored: true, cause: 'updatefound-debounced' },
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

    const hasFreshUserIntent = () => {
      const requestedAt = Number.parseInt(sessionStorage.getItem(SW_RELOAD_REQUESTED_AT_KEY) ?? '0', 10) || 0
      const requestToken = sessionStorage.getItem(SW_RELOAD_REQUEST_TOKEN_KEY)
      const isFresh = Boolean(requestToken) && Date.now() - requestedAt <= SW_RELOAD_REQUEST_TTL_MS

      return { isFresh, requestedAt }
    }

    const handleControllerChange = () => {
      if (sessionStorage.getItem(SW_RELOAD_PENDING_KEY) !== '1') {
        logReloadEvent({
          reason: 'sw_controller_change',
          mode: 'auto',
          buildKey,
          details: { ignored: true, cause: 'pending-flag-missing' },
        })
        return
      }

      const intent = hasFreshUserIntent()
      if (!intent.isFresh) {
        logReloadEvent({
          reason: 'sw_controller_change',
          mode: 'auto',
          buildKey,
          details: {
            ignored: true,
            cause: 'missing-or-stale-user-intent',
            requestedAt: intent.requestedAt,
            ttlMs: SW_RELOAD_REQUEST_TTL_MS,
          },
        })
        clearReloadIntent()
        return
      }

      if (sessionStorage.getItem(SW_RELOAD_HANDLED_KEY) === '1') {
        logReloadEvent({
          reason: 'sw_controller_change',
          mode: 'auto',
          buildKey,
          details: { ignored: true, cause: 'already-handled' },
        })
        return
      }

      sessionStorage.setItem(SW_RELOAD_HANDLED_KEY, '1')
      clearReloadIntent()
      performReload({
        reason: 'sw_controller_change',
        mode: 'user',
        buildKey,
        details: { source: 'controllerchange', explicitUserAction: true },
      })
    }

    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data.type === 'cache-updated') {
        console.log('[SW Update] Cache updated to version:', event.data.version)
        applyDiscoveredVersion(event.data.appVersion ?? null, waitingWorker)
      }
    }

    const setupRegistration = async () => {
      const reg = await navigator.serviceWorker.getRegistration()
      if (!reg || !isEffectActive) {
        return
      }
      registration = reg

      if (registration.waiting) {
        console.log('[SW Update] Service worker already waiting')
        const waiting = registration.waiting
        const messageChannel = new MessageChannel()
        messageChannel.port1.onmessage = (event) => {
          if (event.data.appVersion) {
            applyDiscoveredVersion(event.data.appVersion, waiting)
          }
        }

        waiting.postMessage({ type: 'GET_VERSION' }, [messageChannel.port2])
      }

      registration.addEventListener('updatefound', handleUpdateFound)

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

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)
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
  }, [waitingWorker])

  const updateServiceWorker = async () => {
    const action = resolveServiceWorkerUpdateTrigger({
      hasWaitingWorker: Boolean(waitingWorker),
      updateAvailable,
    })

    if (action === 'noop') {
      console.warn('[SW Update] No waiting worker available')
      return
    }

    setIsUpdating(true)

    try {
      if (action === 'reload') {
        performReload({
          reason: 'sw_controller_change',
          mode: 'user',
          buildKey,
          details: { source: 'cache-updated-message', explicitUserAction: true },
        })
        return
      }

      if (!waitingWorker) {
        console.warn('[SW Update] Waiting worker disappeared before activation')
        setIsUpdating(false)
        return
      }

      sessionStorage.setItem(SW_RELOAD_PENDING_KEY, '1')
      sessionStorage.removeItem(SW_RELOAD_HANDLED_KEY)
      sessionStorage.setItem(SW_RELOAD_REQUESTED_AT_KEY, String(Date.now()))
      sessionStorage.setItem(SW_RELOAD_REQUEST_TOKEN_KEY, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)

      waitingWorker.postMessage({ type: 'SKIP_WAITING' })

      window.setTimeout(() => {
        if (sessionStorage.getItem(SW_RELOAD_PENDING_KEY) !== '1') {
          return
        }

        const requestedAt = Number.parseInt(sessionStorage.getItem(SW_RELOAD_REQUESTED_AT_KEY) ?? '0', 10) || 0
        const token = sessionStorage.getItem(SW_RELOAD_REQUEST_TOKEN_KEY)
        const staleIntent = !token || Date.now() - requestedAt > SW_RELOAD_REQUEST_TTL_MS

        if (staleIntent) {
          logReloadEvent({
            reason: 'sw_controller_change',
            mode: 'auto',
            buildKey,
            details: {
              ignored: true,
              cause: 'fallback-stale-user-intent',
              requestedAt,
              ttlMs: SW_RELOAD_REQUEST_TTL_MS,
            },
          })
          clearReloadIntent()
          return
        }

        if (sessionStorage.getItem(SW_RELOAD_HANDLED_KEY) === '1') {
          return
        }

        sessionStorage.setItem(SW_RELOAD_HANDLED_KEY, '1')
        clearReloadIntent()
        performReload({
          reason: 'sw_controller_change',
          mode: 'user',
          buildKey,
          details: { source: 'skip-waiting-timeout-fallback', explicitUserAction: true },
        })
      }, 8000)

      console.log('[SW Update] Activating new service worker...')
    } catch (error) {
      console.error('[SW Update] Failed to update service worker:', error)
      clearReloadIntent()
      setIsUpdating(false)

      logReloadEvent({
        reason: 'sw_controller_change',
        mode: 'user',
        buildKey,
        details: { updateFailed: true },
      })
    }
  }

  const dismissUpdate = () => {
    setUpdateAvailable(false)
    setWaitingWorker(null)
    setNewVersion(null)
  }

  return {
    updateAvailable,
    currentVersion,
    newVersion,
    isUpdating,
    updateServiceWorker,
    dismissUpdate,
  }
}
