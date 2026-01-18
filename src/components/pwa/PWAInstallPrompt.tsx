import React, { useState, useEffect } from 'react'
import { Download, X } from 'lucide-react'
import { usePWA } from '@/hooks/usePWA'
import { cn } from '@/lib/utils'

/**
 * PWA Install Prompt Component - Sleek minimal banner
 * Requirements: 9.5 - Enhance app-like experience when installed as PWA
 */
export const PWAInstallPrompt: React.FC = () => {
  const { canInstall, isInstalled, promptInstall } = usePWA()
  const [showPrompt, setShowPrompt] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // Check if user has dismissed the prompt before
    const dismissedTime = localStorage.getItem('pwa_prompt_dismissed')
    if (dismissedTime) {
      const daysSinceDismissed = (Date.now() - parseInt(dismissedTime)) / (1000 * 60 * 60 * 24)
      if (daysSinceDismissed < 7) {
        setDismissed(true)
        return
      }
    }

    // Show prompt after a delay if app can be installed
    if (canInstall && !isInstalled && !dismissed) {
      const timer = setTimeout(() => {
        setShowPrompt(true)
        // Trigger animation after mount
        requestAnimationFrame(() => setIsVisible(true))
      }, 5000)

      return () => clearTimeout(timer)
    }
  }, [canInstall, isInstalled, dismissed])

  const handleInstall = async () => {
    const success = await promptInstall()
    if (success) {
      handleClose()
    }
  }

  const handleClose = () => {
    setIsVisible(false)
    setTimeout(() => setShowPrompt(false), 200)
  }

  const handleDismiss = () => {
    handleClose()
    setDismissed(true)
    localStorage.setItem('pwa_prompt_dismissed', Date.now().toString())
  }

  if (!showPrompt || isInstalled) {
    return null
  }

  return (
    <div
      className={cn(
        'fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-50',
        'transform transition-all duration-200 ease-out',
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      )}
    >
      <div className="flex items-center gap-3 bg-card/95 backdrop-blur-sm border border-border rounded-full shadow-lg px-4 py-2.5">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Download className="h-4 w-4 text-primary" />
          </div>
          <span className="text-sm font-medium truncate">Install MIHAS App</span>
        </div>
        
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={handleInstall}
            className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            Install
          </button>
          <button
            onClick={handleDismiss}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted/50 transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default PWAInstallPrompt
