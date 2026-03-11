import { useCallback, useEffect, useRef } from 'react'

/**
 * Returns a debounced version of the provided callback.
 * The callback will only fire after `delay` ms of inactivity.
 * Cleans up pending timers on unmount.
 *
 * @param callback - The function to debounce
 * @param delay - Debounce delay in milliseconds (default 300)
 *
 * Requirements: 11.6
 */
export function useDebouncedCallback<T extends (...args: any[]) => void>(
  callback: T,
  delay: number = 300
): T {
  const callbackRef = useRef(callback)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep callback ref fresh without re-creating the debounced function
  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  const debouncedFn = useCallback(
    (...args: Parameters<T>) => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
      timerRef.current = setTimeout(() => {
        callbackRef.current(...args)
      }, delay)
    },
    [delay]
  ) as T

  return debouncedFn
}
