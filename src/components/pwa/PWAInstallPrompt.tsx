import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, X, Smartphone, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { usePWA } from '@/hooks/usePWA'

/**
 * PWA Install Prompt Component
 * Requirements: 9.5 - Enhance app-like experience when installed as PWA
 */
export const PWAInstallPrompt: React.FC = () => {
  const { canInstall, isInstalled, capabilities, promptInstall } = usePWA()
  const [showPrompt, setShowPrompt] = useState(false)
  const [dismissed, setDismissed] = useState(false)

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
      }, 5000) // Show after 5 seconds

      return () => clearTimeout(timer)
    }
  }, [canInstall, isInstalled, dismissed])

  const handleInstall = async () => {
    const success = await promptInstall()
    if (success) {
      setShowPrompt(false)
    }
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    setDismissed(true)
    localStorage.setItem('pwa_prompt_dismissed', Date.now().toString())
  }

  if (!showPrompt || isInstalled) {
    return null
  }

  const platformIcon = capabilities.platform === 'ios' || capabilities.platform === 'android' 
    ? <Smartphone className="h-5 w-5" />
    : <Monitor className="h-5 w-5" />

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50"
      >
        <Card className="shadow-lg border-2 border-primary/20">
          <div className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                {platformIcon}
                <h3 className="font-semibold text-lg">Install MIHAS App</h3>
              </div>
              <button
                onClick={handleDismiss}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Dismiss"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              Install the MIHAS app for a better experience with offline access, 
              faster loading, and push notifications.
            </p>

            <div className="flex gap-2">
              <Button
                onClick={handleInstall}
                className="flex-1"
                size="sm"
              >
                <Download className="h-4 w-4 mr-2" />
                Install App
              </Button>
              <Button
                onClick={handleDismiss}
                variant="outline"
                size="sm"
              >
                Not Now
              </Button>
            </div>
          </div>
        </Card>
      </motion.div>
    </AnimatePresence>
  )
}

export default PWAInstallPrompt
