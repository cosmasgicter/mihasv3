import { useState, useEffect } from 'react'

const DEFAULT_MOBILE_BREAKPOINT = 768
const DEFAULT_TABLET_BREAKPOINT = 1024

/**
 * Hook to detect if the current viewport is mobile-sized
 * Uses matchMedia API for better performance and SSR compatibility
 * 
 * @param breakpoint - The width threshold for mobile detection (default: 768px)
 * @returns boolean indicating if viewport is mobile-sized
 */
export function useIsMobile(breakpoint: number = DEFAULT_MOBILE_BREAKPOINT): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    // SSR-safe initialization
    if (typeof window !== 'undefined') {
      return window.innerWidth < breakpoint
    }
    return false
  })

  useEffect(() => {
    // Use matchMedia for better performance
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    
    const onChange = () => {
      setIsMobile(window.innerWidth < breakpoint)
    }
    
    // Set initial value
    onChange()
    
    // Modern browsers
    if (mql.addEventListener) {
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    } else {
      // Fallback for older browsers
      // @ts-ignore - deprecated but needed for compatibility
      mql.addListener(onChange)
      // @ts-ignore
      return () => mql.removeListener(onChange)
    }
  }, [breakpoint])

  return isMobile
}

/**
 * Hook to detect if the current viewport is tablet-sized
 * @returns boolean indicating if viewport is tablet-sized (768px - 1024px)
 */
export function useIsTablet(): boolean {
  const [isTablet, setIsTablet] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const width = window.innerWidth
      return width >= DEFAULT_MOBILE_BREAKPOINT && width < DEFAULT_TABLET_BREAKPOINT
    }
    return false
  })

  useEffect(() => {
    const checkIsTablet = () => {
      const width = window.innerWidth
      setIsTablet(width >= DEFAULT_MOBILE_BREAKPOINT && width < DEFAULT_TABLET_BREAKPOINT)
    }

    checkIsTablet()
    window.addEventListener('resize', checkIsTablet)
    return () => window.removeEventListener('resize', checkIsTablet)
  }, [])

  return isTablet
}

/**
 * Hook to get current viewport size category
 * @returns 'mobile' | 'tablet' | 'desktop'
 */
export function useViewportSize(): 'mobile' | 'tablet' | 'desktop' {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()

  if (isMobile) return 'mobile'
  if (isTablet) return 'tablet'
  return 'desktop'
}