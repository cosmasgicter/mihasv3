import { useState, useEffect, useCallback } from 'react'

export interface ResponsiveBreakpoints {
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
  isLarge: boolean
  isXLarge: boolean
  isTouch: boolean
  isLandscape: boolean
  isPortrait: boolean
  devicePixelRatio: number
  viewportHeight: number
  viewportWidth: number
  safeAreaInsets: {
    top: number
    bottom: number
    left: number
    right: number
  }
}

export interface ResponsiveConfig {
  mobile: number
  tablet: number
  desktop: number
  large: number
  xlarge: number
}

const defaultBreakpoints: ResponsiveConfig = {
  mobile: 768,
  tablet: 1024,
  desktop: 1280,
  large: 1536,
  xlarge: 1920
}

/**
 * Enhanced responsive hook with device detection, orientation, and safe area support
 * Optimized for mobile-first design and PWA capabilities
 */
export function useEnhancedResponsive(customBreakpoints?: Partial<ResponsiveConfig>) {
  const breakpoints = { ...defaultBreakpoints, ...customBreakpoints }
  
  const [responsive, setResponsive] = useState<ResponsiveBreakpoints>(() => {
    const width = window.innerWidth
    const height = window.innerHeight
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    const devicePixelRatio = window.devicePixelRatio || 1
    
    return {
      isMobile: width < breakpoints.mobile,
      isTablet: width >= breakpoints.mobile && width < breakpoints.tablet,
      isDesktop: width >= breakpoints.tablet && width < breakpoints.desktop,
      isLarge: width >= breakpoints.desktop && width < breakpoints.large,
      isXLarge: width >= breakpoints.large,
      isTouch,
      isLandscape: width > height,
      isPortrait: height >= width,
      devicePixelRatio,
      viewportHeight: height,
      viewportWidth: width,
      safeAreaInsets: getSafeAreaInsets()
    }
  })

  const updateResponsive = useCallback(() => {
    const width = window.innerWidth
    const height = window.innerHeight
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    const devicePixelRatio = window.devicePixelRatio || 1

    setResponsive({
      isMobile: width < breakpoints.mobile,
      isTablet: width >= breakpoints.mobile && width < breakpoints.tablet,
      isDesktop: width >= breakpoints.tablet && width < breakpoints.desktop,
      isLarge: width >= breakpoints.desktop && width < breakpoints.large,
      isXLarge: width >= breakpoints.large,
      isTouch,
      isLandscape: width > height,
      isPortrait: height >= width,
      devicePixelRatio,
      viewportHeight: height,
      viewportWidth: width,
      safeAreaInsets: getSafeAreaInsets()
    })
  }, [breakpoints])

  useEffect(() => {
    // Throttled resize handler for better performance
    let timeoutId: NodeJS.Timeout
    
    const handleResize = () => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(updateResponsive, 100)
    }

    const handleOrientationChange = () => {
      // Delay to ensure viewport dimensions are updated
      setTimeout(updateResponsive, 200)
    }

    window.addEventListener('resize', handleResize, { passive: true })
    window.addEventListener('orientationchange', handleOrientationChange, { passive: true })
    
    // Listen for safe area changes (iOS)
    const mediaQuery = window.matchMedia('(display-mode: standalone)')
    mediaQuery.addEventListener('change', updateResponsive)

    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleOrientationChange)
      mediaQuery.removeEventListener('change', updateResponsive)
    }
  }, [updateResponsive])

  return responsive
}

/**
 * Get safe area insets for devices with notches/rounded corners
 */
function getSafeAreaInsets() {
  const style = getComputedStyle(document.documentElement)
  
  return {
    top: parseInt(style.getPropertyValue('env(safe-area-inset-top)') || '0', 10),
    bottom: parseInt(style.getPropertyValue('env(safe-area-inset-bottom)') || '0', 10),
    left: parseInt(style.getPropertyValue('env(safe-area-inset-left)') || '0', 10),
    right: parseInt(style.getPropertyValue('env(safe-area-inset-right)') || '0', 10)
  }
}

/**
 * Hook for responsive values based on current breakpoint
 */
export function useResponsiveValue<T>(values: {
  mobile?: T
  tablet?: T
  desktop?: T
  large?: T
  xlarge?: T
  default: T
}) {
  const responsive = useEnhancedResponsive()
  
  if (responsive.isXLarge && values.xlarge !== undefined) return values.xlarge
  if (responsive.isLarge && values.large !== undefined) return values.large
  if (responsive.isDesktop && values.desktop !== undefined) return values.desktop
  if (responsive.isTablet && values.tablet !== undefined) return values.tablet
  if (responsive.isMobile && values.mobile !== undefined) return values.mobile
  
  return values.default
}

/**
 * Hook for device-specific optimizations
 */
export function useDeviceOptimizations() {
  const responsive = useEnhancedResponsive()
  
  return {
    // Touch-friendly sizing
    minTouchTarget: responsive.isTouch ? 44 : 32,
    
    // Optimized spacing
    spacing: {
      xs: responsive.isMobile ? 8 : 12,
      sm: responsive.isMobile ? 12 : 16,
      md: responsive.isMobile ? 16 : 24,
      lg: responsive.isMobile ? 24 : 32,
      xl: responsive.isMobile ? 32 : 48
    },
    
    // Typography scaling
    fontSize: {
      xs: responsive.isMobile ? 12 : 14,
      sm: responsive.isMobile ? 14 : 16,
      base: responsive.isMobile ? 16 : 18,
      lg: responsive.isMobile ? 18 : 20,
      xl: responsive.isMobile ? 20 : 24,
      '2xl': responsive.isMobile ? 24 : 30,
      '3xl': responsive.isMobile ? 30 : 36
    },
    
    // Performance optimizations
    shouldReduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    shouldUseNativeScrolling: responsive.isTouch,
    shouldPreloadImages: !responsive.isMobile || navigator.connection?.effectiveType !== 'slow-2g'
  }
}