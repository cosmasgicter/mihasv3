import { useServiceWorkerUpdate } from '@/hooks/useServiceWorkerUpdate'
import { Button } from '@/components/ui/button'
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
      className="fixed bottom-4 right-4 z-50 max-w-md animate-in slide-in-from-bottom-5"
      role="alert"
      aria-live="polite"
    >
      <div className="rounded-lg border border-border bg-background p-4 shadow-lg">
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
            
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleUpdate}
                disabled={isUpdating}
                className="flex-1"
              >
                {isUpdating ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  'Update Now'
                )}
              </Button>
              
              <Button
                size="sm"
                variant="outline"
                onClick={handleDismiss}
                disabled={isUpdating}
              >
                Later
              </Button>
            </div>
          </div>
          
          <button
            onClick={handleDismiss}
            disabled={isUpdating}
            className="flex-shrink-0 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
            aria-label="Dismiss update notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
