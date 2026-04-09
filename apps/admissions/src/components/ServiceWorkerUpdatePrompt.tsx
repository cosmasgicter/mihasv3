import { useServiceWorkerUpdate } from '@/hooks/useServiceWorkerUpdate'
import { Button } from '@/components/ui/Button'
import { X, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'

export function ServiceWorkerUpdatePrompt() {
  const {
    updateAvailable,
    currentVersion,
    newVersion,
    isUpdating,
    updateServiceWorker,
    dismissUpdate
  } = useServiceWorkerUpdate()

  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    if (updateAvailable) {
      // Show prompt after a short delay to avoid disrupting user
      const timer = setTimeout(() => {
        setIsVisible(true)
      }, 2000)
      return () => clearTimeout(timer)
    } else {
      setIsVisible(false)
    }
  }, [updateAvailable])

  if (!isVisible) {
    return null
  }

  const handleUpdate = async () => {
    await updateServiceWorker()
  }

  const handleDismiss = () => {
    setIsVisible(false)
    dismissUpdate()
  }

  return (
    <div
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom,0px)+9rem)] z-[70] animate-in slide-in-from-bottom-5 pointer-events-none sm:inset-x-auto sm:bottom-4 sm:right-4 sm:max-w-md"
      role="alert"
      aria-live="polite"
    >
      <div className="pointer-events-auto rounded-xl border border-border bg-background p-4 shadow-xl sm:min-w-[22rem]">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <RefreshCw className="h-5 w-5 text-primary" />
          </div>
          
          <div className="flex-1 space-y-2">
            <div className="space-y-1">
              <h3 className="font-semibold text-sm">Update Available</h3>
              <p className="text-sm text-muted-foreground">
                A new version of the application is available.
                {currentVersion && newVersion && (
                  <span className="block mt-1 text-xs">
                    Current: v{currentVersion} → New: v{newVersion}
                  </span>
                )}
              </p>
            </div>
            
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                size="sm"
                onClick={handleUpdate}
                disabled={isUpdating}
                className="w-full sm:flex-1"
                loading={isUpdating}
              >
                {isUpdating ? 'Updating...' : 'Update Now'}
              </Button>
              
              <Button
                size="sm"
                variant="outline"
                onClick={handleDismiss}
                disabled={isUpdating}
                className="w-full sm:w-auto"
              >
                Later
              </Button>
            </div>
          </div>
          
          <button
            onClick={handleDismiss}
            disabled={isUpdating}
            className="flex-shrink-0 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none"
            aria-label="Dismiss update notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
