/**
 * Safe Area Provider Component
 * 
 * Provides safe area inset support for notched devices (iPhone X+, etc.)
 * and handles responsive utilities for different orientations.
 * 
 * Requirements: 9.5, 9.6, 9.7
 */

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface SafeAreaInsets {
  top: number
  bottom: number
  left: number
  right: number
}

interface SafeAreaContextValue {
  insets: SafeAreaInsets
  isLandscape: boolean
  isPortrait: boolean
  hasNotch: boolean
  viewportHeight: number
  viewportWidth: number
}

const defaultInsets: SafeAreaInsets = {
  top: 0,
  bottom: 0,
  left: 0,
  right: 0,
}

const SafeAreaContext = createContext<SafeAreaContextValue>({
  insets: defaultInsets,
  isLandscape: false,
  isPortrait: true,
  hasNotch: false,
  viewportHeight: 0,
  viewportWidth: 0,
})

interface SafeAreaProviderProps {
  children: ReactNode
}

/**
 * Provider component that tracks safe area insets and orientation
 */
export function SafeAreaProvider({ children }: SafeAreaProviderProps) {
  const [insets, setInsets] = useState<SafeAreaInsets>(defaultInsets)
  const [isLandscape, setIsLandscape] = useState(false)
  const [viewportHeight, setViewportHeight] = useState(0)
  const [viewportWidth, setViewportWidth] = useState(0)

  useEffect(() => {
    // Function to get safe area insets from CSS environment variables
    const getSafeAreaInsets = (): SafeAreaInsets => {
      const computedStyle = getComputedStyle(document.documentElement)
      
      const parseInset = (value: string): number => {
        const parsed = parseFloat(value)
        return isNaN(parsed) ? 0 : parsed
      }

      return {
        top: parseInset(computedStyle.getPropertyValue('--safe-area-inset-top') || '0'),
        bottom: parseInset(computedStyle.getPropertyValue('--safe-area-inset-bottom') || '0'),
        left: parseInset(computedStyle.getPropertyValue('--safe-area-inset-left') || '0'),
        right: parseInset(computedStyle.getPropertyValue('--safe-area-inset-right') || '0'),
      }
    }

    const updateDimensions = () => {
      setViewportHeight(window.innerHeight)
      setViewportWidth(window.innerWidth)
      setIsLandscape(window.innerWidth > window.innerHeight)
      setInsets(getSafeAreaInsets())
    }

    // Initial update
    updateDimensions()

    // Listen for resize and orientation changes
    window.addEventListener('resize', updateDimensions)
    window.addEventListener('orientationchange', updateDimensions)

    // Also listen for viewport changes (iOS Safari address bar)
    if ('visualViewport' in window && window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateDimensions)
    }

    return () => {
      window.removeEventListener('resize', updateDimensions)
      window.removeEventListener('orientationchange', updateDimensions)
      if ('visualViewport' in window && window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateDimensions)
      }
    }
  }, [])

  const hasNotch = insets.top > 20 || insets.bottom > 20

  const value: SafeAreaContextValue = {
    insets,
    isLandscape,
    isPortrait: !isLandscape,
    hasNotch,
    viewportHeight,
    viewportWidth,
  }

  return (
    <SafeAreaContext.Provider value={value}>
      {children}
    </SafeAreaContext.Provider>
  )
}

/**
 * Hook to access safe area context
 */
export function useSafeArea(): SafeAreaContextValue {
  return useContext(SafeAreaContext)
}

/**
 * Safe area view wrapper component
 */
interface SafeAreaViewProps {
  children: ReactNode
  className?: string
  /** Which edges to apply safe area padding */
  edges?: ('top' | 'bottom' | 'left' | 'right')[]
  /** Additional padding beyond safe area */
  padding?: number
}

export function SafeAreaView({
  children,
  className,
  edges = ['top', 'bottom', 'left', 'right'],
  padding = 0,
}: SafeAreaViewProps) {
  const { insets } = useSafeArea()

  const style: React.CSSProperties = {
    paddingTop: edges.includes('top') ? `max(${padding}px, ${insets.top}px)` : padding,
    paddingBottom: edges.includes('bottom') ? `max(${padding}px, ${insets.bottom}px)` : padding,
    paddingLeft: edges.includes('left') ? `max(${padding}px, ${insets.left}px)` : padding,
    paddingRight: edges.includes('right') ? `max(${padding}px, ${insets.right}px)` : padding,
  }

  return (
    <div className={className} style={style}>
      {children}
    </div>
  )
}

/**
 * Bottom navigation wrapper with safe area support
 */
interface BottomNavigationWrapperProps {
  children: ReactNode
  className?: string
}

export function BottomNavigationWrapper({
  children,
  className,
}: BottomNavigationWrapperProps) {
  return (
    <div
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50',
        'bg-background border-t border-border',
        'safe-area-bottom',
        className
      )}
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
      }}
    >
      {children}
    </div>
  )
}

/**
 * Landscape-aware container that adjusts layout for landscape orientation
 */
interface LandscapeAwareContainerProps {
  children: ReactNode
  className?: string
  /** Class to apply in landscape mode */
  landscapeClassName?: string
  /** Class to apply in portrait mode */
  portraitClassName?: string
}

export function LandscapeAwareContainer({
  children,
  className,
  landscapeClassName,
  portraitClassName,
}: LandscapeAwareContainerProps) {
  const { isLandscape } = useSafeArea()

  return (
    <div
      className={cn(
        className,
        isLandscape ? landscapeClassName : portraitClassName
      )}
    >
      {children}
    </div>
  )
}

export { SafeAreaContext }
