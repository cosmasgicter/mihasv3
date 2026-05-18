import { useCallback, useEffect, useRef, useState } from 'react'
import { logger } from '@/lib/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LencoWidgetConfig {
  publicKey: string
  reference: string
  amount: number
  currency: string
  customerEmail: string
  customerFirstName: string
  customerLastName: string
  customerPhone?: string
  onSuccess: (response: LencoSuccessResponse) => void
  onConfirmationPending?: (response: LencoPendingResponse) => void
  onClose: () => void
}

export interface LencoSuccessResponse {
  reference: string
  status: string
  [key: string]: unknown
}

export interface LencoPendingResponse {
  reference: string
  status: string
  [key: string]: unknown
}

// Extend Window to include the Lenco global
declare global {
  interface Window {
    LencoPay?: {
      getPaid: (config: Record<string, unknown>) => void
    }
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRODUCTION_WIDGET_URL = 'https://pay.lenco.co/js/v1/inline.js'
const SANDBOX_WIDGET_URL = 'https://pay.sandbox.lenco.co/js/v1/inline.js'
const WIDGET_URL =
  import.meta.env.VITE_LENCO_WIDGET_URL ||
  (import.meta.env.PROD ? PRODUCTION_WIDGET_URL : SANDBOX_WIDGET_URL)
const WIDGET_SCRIPT_ID = 'mihas-lenco-inline-widget'
const SCRIPT_LOAD_TIMEOUT_MS = 15_000

let scriptLoadPromise: Promise<void> | null = null

function loadLencoScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Payment widget is not available during server rendering.'))
  }

  if (window.LencoPay) {
    return Promise.resolve()
  }

  if (scriptLoadPromise) {
    return scriptLoadPromise
  }

  scriptLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script#${WIDGET_SCRIPT_ID}, script[src="${WIDGET_URL}"]`
    )
    const script = existing ?? document.createElement('script')
    let timeoutId: number | null = null

    const cleanup = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
        timeoutId = null
      }
      script.removeEventListener('load', handleLoad)
      script.removeEventListener('error', handleError)
    }

    const handleLoad = () => {
      cleanup()
      if (window.LencoPay) {
        resolve()
        return
      }
      scriptLoadPromise = null
      reject(new Error('Payment widget loaded but did not initialize.'))
    }

    const handleError = () => {
      cleanup()
      scriptLoadPromise = null
      if (script.parentNode) {
        script.parentNode.removeChild(script)
      }
      reject(new Error('Payment widget could not be loaded. Check your connection and try again.'))
    }

    timeoutId = window.setTimeout(handleError, SCRIPT_LOAD_TIMEOUT_MS)

    script.addEventListener('load', handleLoad)
    script.addEventListener('error', handleError)

    if (!existing) {
      script.id = WIDGET_SCRIPT_ID
      script.src = WIDGET_URL
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }
  })

  return scriptLoadPromise
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useLencoWidget() {
  const [isLoading, setIsLoading] = useState(true)
  const [isScriptLoaded, setIsScriptLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const mountedRef = useRef(false)
  const loadAttemptRef = useRef(0)

  const loadWidget = useCallback(() => {
    const attempt = loadAttemptRef.current + 1
    loadAttemptRef.current = attempt
    setIsLoading(true)
    setLoadError(null)

    void loadLencoScript()
      .then(() => {
        if (!mountedRef.current || loadAttemptRef.current !== attempt) return
        setIsScriptLoaded(true)
        setLoadError(null)
      })
      .catch((error) => {
        if (!mountedRef.current || loadAttemptRef.current !== attempt) return
        setIsScriptLoaded(false)
        setLoadError(error instanceof Error ? error.message : 'Payment widget could not be loaded.')
      })
      .finally(() => {
        if (!mountedRef.current || loadAttemptRef.current !== attempt) return
        setIsLoading(false)
      })
  }, [])

  // Load the Lenco widget script once on mount. The module-level promise
  // deduplicates concurrent payment surfaces.
  useEffect(() => {
    mountedRef.current = true
    loadWidget()
    return () => {
      mountedRef.current = false
    }
  }, [loadWidget])

  const retryLoad = useCallback(() => {
    if (!window.LencoPay) {
      scriptLoadPromise = null
    }
    loadWidget()
  }, [loadWidget])

  const openWidget = useCallback(
    (config: LencoWidgetConfig) => {
      if (!window.LencoPay) {
        logger.error('[useLencoWidget] LencoPay not available')
        setLoadError('Payment widget is not ready. Please try again.')
        config.onClose()
        return
      }

      setIsLoading(true)

      // Safety timeout: if no Lenco callback fires within 30s, the widget
      // likely failed to open (popup blocked, CSP, network). Reset state.
      const safetyTimeout = window.setTimeout(() => {
        setIsLoading(false)
        config.onClose()
      }, 30_000)

      const clearSafety = () => window.clearTimeout(safetyTimeout)

      try {
        window.LencoPay.getPaid({
          key: config.publicKey,
          reference: config.reference,
          email: config.customerEmail,
          amount: config.amount,
          currency: config.currency,
          channels: ['card', 'mobile-money'],
          bearer: 'customer',
          customer: {
            firstName: config.customerFirstName,
            lastName: config.customerLastName,
            ...(config.customerPhone ? { phone: config.customerPhone } : {}),
          },
          onSuccess: (response: Record<string, unknown>) => {
            clearSafety()
            setIsLoading(false)
            config.onSuccess(response as unknown as LencoSuccessResponse)
          },
          onConfirmationPending: (response: Record<string, unknown>) => {
            clearSafety()
            setIsLoading(false)
            config.onConfirmationPending?.(
              response as unknown as LencoPendingResponse
            )
          },
          onClose: () => {
            clearSafety()
            setIsLoading(false)
            config.onClose()
          },
        })
      } catch (err) {
        logger.error('[useLencoWidget] Error opening widget:', err)
        setLoadError(err instanceof Error ? err.message : 'Payment widget could not be opened.')
        setIsLoading(false)
        config.onClose()
      }
    },
    []
  )

  return { openWidget, isLoading, isScriptLoaded, loadError, retryLoad }
}
