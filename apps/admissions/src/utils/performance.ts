export { debounce, throttle } from '@/lib/utils'

// Check if device prefers reduced motion
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Check if device is low-end
export function isLowEndDevice(): boolean {
  if ('deviceMemory' in navigator) {
    // deviceMemory is a non-standard API (Chrome only), not in standard TS lib
    return (navigator as Navigator & { deviceMemory?: number }).deviceMemory! < 4
  }
  return false
}

// Request idle callback wrapper
export function requestIdleCallback(callback: () => void, timeout = 2000) {
  if ('requestIdleCallback' in window) {
    return window.requestIdleCallback(callback, { timeout })
  }
  return setTimeout(callback, 1)
}
