/**
 * useOptimizedAnimation Hook
 * 
 * Provides animation configuration that adapts to device capabilities and user preferences.
 * Disables animations on mobile devices and when user prefers reduced motion.
 * 
 * @requirements 6.2, 6.5 - Animation optimization for mobile performance
 */

import { useState, useEffect, useMemo } from 'react'

export interface UseOptimizedAnimationReturn {
  /** Whether to animate at all (false on mobile or reduced motion) */
  shouldAnimate: boolean
  /** User prefers reduced motion */
  prefersReducedMotion: boolean
  /** Device is mobile (viewport < 768px) */
  isMobile: boolean
  /** CSS transition properties for animated elements */
  transitionProps: {
    transition: string
    willChange: string
  }
  /** CSS class for fade-in animation */
  fadeInClass: string
  /** CSS class for slide-in animation */
  slideInClass: string
  /** Get animation props - returns empty object if animations disabled */
  getAnimationProps: (type: 'fade' | 'slide' | 'scale') => Record<string, string>
}

const MOBILE_BREAKPOINT = 768

/**
 * Hook for optimized animations based on device and user preferences
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { shouldAnimate, fadeInClass, getAnimationProps } = useOptimizedAnimation()
 *   
 *   return (
 *     <div className={shouldAnimate ? fadeInClass : ''}>
 *       Content
 *     </div>
 *   )
 * }
 * ```
 */
export function useOptimizedAnimation(): UseOptimizedAnimationReturn {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < MOBILE_BREAKPOINT
  })

  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  // Listen for viewport changes
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleResize = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }

    // Use matchMedia for more efficient resize detection
    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    
    const handleMediaChange = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches)
    }

    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleMediaChange)
    } else {
      // Fallback for older browsers
      window.addEventListener('resize', handleResize)
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleMediaChange)
      } else {
        window.removeEventListener('resize', handleResize)
      }
    }
  }, [])

  // Listen for reduced motion preference changes
  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    
    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches)
    }

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange)
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleChange)
      }
    }
  }, [])

  const shouldAnimate = useMemo(() => {
    return !isMobile && !prefersReducedMotion
  }, [isMobile, prefersReducedMotion])

  const transitionProps = useMemo(() => ({
    transition: shouldAnimate ? 'all 300ms ease-out' : 'none',
    willChange: shouldAnimate ? 'transform, opacity' : 'auto'
  }), [shouldAnimate])

  const fadeInClass = useMemo(() => {
    return shouldAnimate ? 'animate-fade-in' : ''
  }, [shouldAnimate])

  const slideInClass = useMemo(() => {
    return shouldAnimate ? 'animate-slide-in' : ''
  }, [shouldAnimate])

  const getAnimationProps = useMemo(() => {
    return (type: 'fade' | 'slide' | 'scale'): Record<string, string> => {
      if (!shouldAnimate) return {}

      switch (type) {
        case 'fade':
          return { className: 'transition-opacity duration-300 ease-out' }
        case 'slide':
          return { className: 'transition-all duration-300 ease-out' }
        case 'scale':
          return { className: 'transition-transform duration-200 ease-out' }
        default:
          return {}
      }
    }
  }, [shouldAnimate])

  return {
    shouldAnimate,
    prefersReducedMotion,
    isMobile,
    transitionProps,
    fadeInClass,
    slideInClass,
    getAnimationProps
  }
}

export default useOptimizedAnimation
