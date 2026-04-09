import { useEffect, useState } from 'react'

export function useDeferredHydration(enabled: boolean, delayMs: number) {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setHydrated(false)
      return
    }

    let timeoutId: number | null = null
    let idleId: number | null = null

    const mountDeferred = () => {
      timeoutId = window.setTimeout(() => setHydrated(true), delayMs)
    }

    const afterFirstPaint = () => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if ('requestIdleCallback' in window) {
            idleId = window.requestIdleCallback(mountDeferred, { timeout: 2000 })
            return
          }
          mountDeferred()
        })
      })
    }

    afterFirstPaint()

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
      if (idleId !== null && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId)
      }
    }
  }, [delayMs, enabled])

  return hydrated
}

export default useDeferredHydration
