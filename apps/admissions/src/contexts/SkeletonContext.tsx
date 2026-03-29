/**
 * Skeleton Loading Context
 * 
 * Provides consistent loading states across the application.
 * Implements Requirement 1.5: Display skeleton placeholders that match final layout
 * 
 * Usage:
 * 1. Wrap your app with SkeletonProvider
 * 2. Use useSkeletonContext() to access loading state
 * 3. Use SkeletonWrapper component for automatic skeleton display
 */
import React, { createContext, useContext, useState, useCallback, useMemo } from 'react'

export type SkeletonVariant = 
  | 'card' 
  | 'table' 
  | 'form' 
  | 'hero' 
  | 'dashboard' 
  | 'list' 
  | 'profile'
  | 'stats'
  | 'timeline'
  | 'navigation'

interface SkeletonState {
  isLoading: boolean
  variant: SkeletonVariant
  itemCount?: number
}

interface SkeletonContextValue {
  // Global loading state
  globalLoading: boolean
  setGlobalLoading: (loading: boolean) => void
  
  // Component-specific loading states
  loadingStates: Map<string, SkeletonState>
  setLoadingState: (key: string, state: SkeletonState) => void
  clearLoadingState: (key: string) => void
  isLoading: (key: string) => boolean
  
  // Animation preferences
  reducedMotion: boolean
  animationType: 'pulse' | 'wave' | 'none'
  setAnimationType: (type: 'pulse' | 'wave' | 'none') => void
}

const SkeletonContext = createContext<SkeletonContextValue | undefined>(undefined)

interface SkeletonProviderProps {
  children: React.ReactNode
  defaultAnimationType?: 'pulse' | 'wave' | 'none'
}

export function SkeletonProvider({ 
  children, 
  defaultAnimationType = 'pulse' 
}: SkeletonProviderProps) {
  const [globalLoading, setGlobalLoading] = useState(false)
  const [loadingStates, setLoadingStates] = useState<Map<string, SkeletonState>>(new Map())
  const [animationType, setAnimationType] = useState<'pulse' | 'wave' | 'none'>(defaultAnimationType)
  
  // Check for reduced motion preference
  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])
  
  const setLoadingState = useCallback((key: string, state: SkeletonState) => {
    setLoadingStates(prev => {
      const next = new Map(prev)
      next.set(key, state)
      return next
    })
  }, [])
  
  const clearLoadingState = useCallback((key: string) => {
    setLoadingStates(prev => {
      const next = new Map(prev)
      next.delete(key)
      return next
    })
  }, [])
  
  const isLoading = useCallback((key: string) => {
    return loadingStates.get(key)?.isLoading ?? false
  }, [loadingStates])
  
  const value = useMemo(() => ({
    globalLoading,
    setGlobalLoading,
    loadingStates,
    setLoadingState,
    clearLoadingState,
    isLoading,
    reducedMotion,
    animationType: reducedMotion ? 'none' : animationType,
    setAnimationType
  }), [
    globalLoading, 
    loadingStates, 
    setLoadingState, 
    clearLoadingState, 
    isLoading, 
    reducedMotion, 
    animationType
  ])
  
  return (
    <SkeletonContext.Provider value={value}>
      {children}
    </SkeletonContext.Provider>
  )
}

export function useSkeletonContext() {
  const context = useContext(SkeletonContext)
  if (!context) {
    throw new Error('useSkeletonContext must be used within a SkeletonProvider')
  }
  return context
}

/**
 * Hook for managing component-specific loading state
 */
export function useSkeletonState(key: string, variant: SkeletonVariant = 'card') {
  const { setLoadingState, clearLoadingState, isLoading } = useSkeletonContext()
  
  const startLoading = useCallback((itemCount?: number) => {
    setLoadingState(key, { isLoading: true, variant, itemCount })
  }, [key, variant, setLoadingState])
  
  const stopLoading = useCallback(() => {
    clearLoadingState(key)
  }, [key, clearLoadingState])
  
  return {
    isLoading: isLoading(key),
    startLoading,
    stopLoading
  }
}

export default SkeletonContext
