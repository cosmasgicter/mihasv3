import { useEffect, useState } from 'react'

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
    const handleUpdateFound = (registration: ServiceWorkerRegistration) => {
      const newWorker = registration.installing
      
      if (!newWorker) return

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // New service worker is installed and waiting
          console.log('[SW Update] New service worker available')
          setWaitingWorker(newWorker)
          setUpdateAvailable(true)
          
          // Try to get new version
          const messageChannel = new MessageChannel()
          messageChannel.port1.onmessage = (event) => {
            if (event.data.appVersion) {
              setNewVersion(event.data.appVersion)
            }
          }
          
          newWorker.postMessage(
            { type: 'GET_VERSION' },
            [messageChannel.port2]
          )
        }
      })
    }

    // Check for updates on registration
    navigator.serviceWorker.getRegistration().then((registration) => {
      if (!registration) return

      // Check if there's already a waiting worker
      if (registration.waiting) {
        console.log('[SW Update] Service worker already waiting')
        setWaitingWorker(registration.waiting)
        setUpdateAvailable(true)
      }

      // Listen for new updates
      registration.addEventListener('updatefound', () => {
        handleUpdateFound(registration)
      })

      // Check for updates periodically (every 60 seconds)
      const updateInterval = setInterval(() => {
        registration.update().catch((error) => {
          console.error('[SW Update] Failed to check for updates:', error)
        })
      }, 60000)

      return () => clearInterval(updateInterval)
    })

    // Listen for controller change (new SW activated)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('[SW Update] Controller changed, reloading page')
      window.location.reload()
    })

    // Listen for messages from service worker
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data.type === 'cache-updated') {
        console.log('[SW Update] Cache updated to version:', event.data.version)
        setNewVersion(event.data.appVersion)
      }
    })
  }, [])

  const updateServiceWorker = async () => {
    if (!waitingWorker) {
      console.warn('[SW Update] No waiting worker available')
      return
    }

    setIsUpdating(true)

    try {
      // Tell the waiting service worker to skip waiting
      waitingWorker.postMessage({ type: 'SKIP_WAITING' })
      
      // The controllerchange event will trigger a reload
      console.log('[SW Update] Activating new service worker...')
    } catch (error) {
      console.error('[SW Update] Failed to update service worker:', error)
      setIsUpdating(false)
      
      // Fallback: force reload
      window.location.reload()
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
