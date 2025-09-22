import React, { useEffect, useRef, useCallback, useMemo } from 'react'

interface TurnstileProps {
  siteKey: string
  onVerify: (token: string) => void
  onError?: () => void
  onExpire?: () => void
  theme?: 'light' | 'dark' | 'auto'
  size?: 'normal' | 'compact'
}

declare global {
  interface Window {
    turnstile: {
      render: (element: HTMLElement, options: any) => string
      reset: (widgetId: string) => void
      remove: (widgetId: string) => void
    }
  }
}

export function Turnstile({ 
  siteKey, 
  onVerify, 
  onError, 
  onExpire, 
  theme = 'light', 
  size = 'normal' 
}: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const isLoadedRef = useRef(false)
  
  const handleVerify = useCallback((token: string) => {
    onVerify(token)
  }, [onVerify])

  const handleError = useCallback(() => {
    onError?.()
  }, [onError])

  const handleExpire = useCallback(() => {
    onExpire?.()
  }, [onExpire])

  useEffect(() => {
    if (isLoadedRef.current || !containerRef.current || !siteKey) return

    const loadTurnstile = () => {
      if (window.turnstile && containerRef.current && !widgetIdRef.current) {
        try {
          widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: siteKey,
            callback: handleVerify,
            'error-callback': handleError,
            'expired-callback': handleExpire,
            theme,
            size
          })
          isLoadedRef.current = true
        } catch (error) {
          console.error('Turnstile render error:', error)
          handleError()
        }
      }
    }

    if (window.turnstile) {
      loadTurnstile()
    } else {
      const existingScript = document.querySelector('script[src*="turnstile"]')
      if (existingScript) {
        existingScript.addEventListener('load', loadTurnstile)
      } else {
        const script = document.createElement('script')
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
        script.async = true
        script.defer = true
        script.onload = loadTurnstile
        script.onerror = () => {
          console.error('Failed to load Turnstile script')
          handleError()
        }
        document.head.appendChild(script)
      }
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current)
        } catch (error) {
          console.error('Turnstile cleanup error:', error)
        }
        widgetIdRef.current = null
        isLoadedRef.current = false
      }
    }
  }, [siteKey, handleVerify, handleError, handleExpire, theme, size])

  return <div ref={containerRef} />
}