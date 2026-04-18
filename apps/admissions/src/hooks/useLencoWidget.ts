import { useCallback, useEffect, useRef, useState } from 'react'

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

const WIDGET_URL =
  import.meta.env.VITE_LENCO_WIDGET_URL ||
  'https://pay.sandbox.lenco.co/js/v1/inline.js'

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useLencoWidget() {
  const [isLoading, setIsLoading] = useState(true)
  const [isScriptLoaded, setIsScriptLoaded] = useState(false)
  const scriptLoadedRef = useRef(false)

  // Load the Lenco widget script once on mount
  useEffect(() => {
    // Already loaded in a previous render
    if (window.LencoPay) {
      setIsScriptLoaded(true)
      setIsLoading(false)
      scriptLoadedRef.current = true
      return
    }

    // Check if script tag already exists (e.g. from HMR)
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${WIDGET_URL}"]`
    )
    if (existing) {
      // Script tag exists — wait for it to finish loading
      const onLoad = () => {
        setIsScriptLoaded(true)
        setIsLoading(false)
        scriptLoadedRef.current = true
      }
      if (window.LencoPay) {
        onLoad()
      } else {
        existing.addEventListener('load', onLoad)
        return () => existing.removeEventListener('load', onLoad)
      }
      return
    }

    const script = document.createElement('script')
    script.src = WIDGET_URL
    script.async = true

    script.onload = () => {
      setIsScriptLoaded(true)
      setIsLoading(false)
      scriptLoadedRef.current = true
    }

    script.onerror = () => {
      console.error('[useLencoWidget] Failed to load Lenco widget script')
      setIsScriptLoaded(false)
      setIsLoading(false)
      scriptLoadedRef.current = false
    }

    document.head.appendChild(script)

    return () => {
      // Don't remove the script on unmount — it's a global singleton
    }
  }, [])

  const openWidget = useCallback(
    (config: LencoWidgetConfig) => {
      if (!window.LencoPay) {
        console.error('[useLencoWidget] LencoPay not available')
        config.onClose()
        return
      }

      setIsLoading(true)

      try {
        window.LencoPay.getPaid({
          key: config.publicKey,
          reference: config.reference,
          amount: config.amount,
          currency: config.currency,
          customer: {
            email: config.customerEmail,
            firstName: config.customerFirstName,
            lastName: config.customerLastName,
            ...(config.customerPhone ? { phone: config.customerPhone } : {}),
          },
          onSuccess: (response: Record<string, unknown>) => {
            setIsLoading(false)
            config.onSuccess(response as unknown as LencoSuccessResponse)
          },
          onConfirmationPending: (response: Record<string, unknown>) => {
            setIsLoading(false)
            config.onConfirmationPending?.(
              response as unknown as LencoPendingResponse
            )
          },
          onClose: () => {
            setIsLoading(false)
            config.onClose()
          },
        })
      } catch (err) {
        console.error('[useLencoWidget] Error opening widget:', err)
        setIsLoading(false)
        config.onClose()
      }
    },
    []
  )

  return { openWidget, isLoading, isScriptLoaded }
}
