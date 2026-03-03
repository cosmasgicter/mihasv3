import React, { useEffect, useMemo, useState } from 'react'
import { Download, Monitor, Smartphone, X } from 'lucide-react'
import { usePWA } from '@/hooks/usePWA'
import { cn } from '@/lib/utils'
import { OptimizedImage } from '@/components/ui/OptimizedImage'

type PlatformHint = {
  title: string
  hint: string
  icon: typeof Smartphone
}

const getPlatformHint = (): PlatformHint => {
  if (typeof navigator === 'undefined') {
    return {
      title: 'Install the MIHAS app',
      hint: 'Use your browser install option for quick access.',
      icon: Download,
    }
  }

  const ua = navigator.userAgent.toLowerCase()
  const isIOS = /iphone|ipad|ipod/.test(ua)
  const isAndroid = /android/.test(ua)

  if (isIOS) {
    return {
      title: 'Install on iPhone or iPad',
      hint: 'Tap Share, then choose Add to Home Screen to install MIHAS.',
      icon: Smartphone,
    }
  }

  if (isAndroid) {
    return {
      title: 'Install on Android',
      hint: 'Tap Install in your browser banner to add MIHAS to your home screen.',
      icon: Smartphone,
    }
  }

  return {
    title: 'Install on desktop',
    hint: 'Use the install icon in the address bar for a dedicated MIHAS app window.',
    icon: Monitor,
  }
}

export const PWAInstallPrompt: React.FC = () => {
  const { canInstall, isInstalled, promptInstall } = usePWA()
  const [showPrompt, setShowPrompt] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [isVisible, setIsVisible] = useState(false)

  const platformHint = useMemo(() => getPlatformHint(), [])
  const PlatformIcon = platformHint.icon

  useEffect(() => {
    const dismissedTime = localStorage.getItem('pwa_prompt_dismissed')
    if (dismissedTime) {
      const daysSinceDismissed = (Date.now() - parseInt(dismissedTime, 10)) / (1000 * 60 * 60 * 24)
      if (daysSinceDismissed < 7) {
        setDismissed(true)
        return
      }
    }

    if (canInstall && !isInstalled && !dismissed) {
      const timer = setTimeout(() => {
        setShowPrompt(true)
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
        'fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-md z-50',
        'transform transition-all duration-200 ease-out',
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      )}
    >
      <div className="rounded-2xl border border-primary/20 bg-card/95 p-4 shadow-2xl backdrop-blur-sm">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <OptimizedImage src="/images/logos/mihas-logo.webp" alt="Mukuba Institute of Health and Allied Sciences logo" width={40} height={40} className="h-10 w-10 rounded-lg object-contain bg-white p-1" lazy={false} />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Mukuba Institute of Health & Allied Sciences</p>
              <h3 className="text-base font-bold text-foreground">Install MIHAS Student Portal</h3>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-3 text-sm text-muted-foreground">
          Get a faster sign-in experience, offline-ready access to key pages, and one-tap entry for your applications.
        </p>

        <div className="mb-4 flex items-start gap-2 rounded-xl bg-primary/10 px-3 py-2">
          <PlatformIcon className="mt-0.5 h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-medium text-foreground">{platformHint.title}</p>
            <p className="text-xs text-muted-foreground">{platformHint.hint}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleInstall}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Download className="h-4 w-4" />
            Install app
          </button>
          <button
            onClick={handleDismiss}
            className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}

export default PWAInstallPrompt
