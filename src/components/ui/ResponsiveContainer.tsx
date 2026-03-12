import React, { ReactNode, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { useResponsive } from '@/hooks/useResponsive'

/** Detect touch capability */
function getIsTouch() {
  return typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)
}

/** Derive device optimizations from responsive state */
function getDeviceOptimizations(isMobile: boolean, isTouch: boolean) {
  return {
    minTouchTarget: isTouch ? 44 : 32,
    spacing: {
      xs: isMobile ? 8 : 12,
      sm: isMobile ? 12 : 16,
      md: isMobile ? 16 : 24,
      lg: isMobile ? 24 : 32,
      xl: isMobile ? 32 : 48,
    },
  }
}

interface ResponsiveContainerProps {
  children: ReactNode
  className?: string
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl'
  safeArea?: boolean
  touchOptimized?: boolean
}

/**
 * Responsive container with safe area support and touch optimizations
 */
export function ResponsiveContainer({
  children,
  className,
  maxWidth = 'full',
  padding = 'md',
  safeArea = true,
  touchOptimized = true
}: ResponsiveContainerProps) {
  const responsive = useResponsive()
  const isTouch = useMemo(() => getIsTouch(), [])
  const optimizations = useMemo(() => getDeviceOptimizations(responsive.isMobile, isTouch), [responsive.isMobile, isTouch])

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    full: 'max-w-full'
  }

  const paddingClasses = {
    none: '',
    sm: 'px-3 py-2',
    md: 'px-4 py-3',
    lg: 'px-6 py-4',
    xl: 'px-8 py-6'
  }

  const safeAreaStyles = safeArea ? {
    paddingTop: `max(${optimizations.spacing.md}px, env(safe-area-inset-top))`,
    paddingBottom: `max(${optimizations.spacing.md}px, env(safe-area-inset-bottom))`,
    paddingLeft: `max(${optimizations.spacing.md}px, env(safe-area-inset-left))`,
    paddingRight: `max(${optimizations.spacing.md}px, env(safe-area-inset-right))`
  } : {}

  return (
    <div
      className={cn(
        'w-full mx-auto',
        maxWidthClasses[maxWidth],
        paddingClasses[padding],
        touchOptimized && isTouch && 'touch-manipulation',
        className
      )}
      style={safeAreaStyles}
    >
      {children}
    </div>
  )
}

interface ResponsiveGridProps {
  children: ReactNode
  className?: string
  columns?: {
    mobile?: number
    tablet?: number
    desktop?: number
    large?: number
  }
  gap?: 'sm' | 'md' | 'lg' | 'xl'
  touchOptimized?: boolean
}

/**
 * Responsive grid with touch-optimized spacing
 */
export function ResponsiveGrid({
  children,
  className,
  columns = { mobile: 1, tablet: 2, desktop: 3, large: 4 },
  gap = 'md',
  touchOptimized = true
}: ResponsiveGridProps) {
  const responsive = useResponsive()
  const isTouch = useMemo(() => getIsTouch(), [])
  const optimizations = useMemo(() => getDeviceOptimizations(responsive.isMobile, isTouch), [responsive.isMobile, isTouch])

  const getGridColumns = () => {
    if (responsive.isLarge && columns.large) return columns.large
    if (responsive.isDesktop && columns.desktop) return columns.desktop
    if (responsive.isTablet && columns.tablet) return columns.tablet
    return columns.mobile || 1
  }

  const gapClasses = {
    sm: 'gap-2',
    md: 'gap-4',
    lg: 'gap-6',
    xl: 'gap-8'
  }

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: `repeat(${getGridColumns()}, 1fr)`,
    gap: touchOptimized && isTouch 
      ? `${optimizations.spacing.md}px` 
      : undefined
  }

  return (
    <div
      className={cn(
        'grid',
        !touchOptimized && gapClasses[gap],
        touchOptimized && isTouch && 'touch-manipulation',
        className
      )}
      style={touchOptimized ? gridStyle : undefined}
    >
      {children}
    </div>
  )
}

interface ResponsiveStackProps {
  children: ReactNode
  className?: string
  direction?: 'vertical' | 'horizontal' | 'responsive'
  spacing?: 'sm' | 'md' | 'lg' | 'xl'
  align?: 'start' | 'center' | 'end' | 'stretch'
  justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly'
  wrap?: boolean
}

/**
 * Responsive stack layout with flexible direction and spacing
 */
export function ResponsiveStack({
  children,
  className,
  direction = 'vertical',
  spacing = 'md',
  align = 'stretch',
  justify = 'start',
  wrap = false
}: ResponsiveStackProps) {
  const responsive = useResponsive()
  const isTouch = useMemo(() => getIsTouch(), [])

  const isHorizontal = direction === 'horizontal' || 
    (direction === 'responsive' && !responsive.isMobile)

  const spacingClasses = {
    sm: isHorizontal ? 'space-x-2' : 'space-y-2',
    md: isHorizontal ? 'space-x-4' : 'space-y-4',
    lg: isHorizontal ? 'space-x-6' : 'space-y-6',
    xl: isHorizontal ? 'space-x-8' : 'space-y-8'
  }

  const alignClasses = {
    start: isHorizontal ? 'items-start' : 'items-start',
    center: isHorizontal ? 'items-center' : 'items-center',
    end: isHorizontal ? 'items-end' : 'items-end',
    stretch: isHorizontal ? 'items-stretch' : 'items-stretch'
  }

  const justifyClasses = {
    start: isHorizontal ? 'justify-start' : 'justify-start',
    center: isHorizontal ? 'justify-center' : 'justify-center',
    end: isHorizontal ? 'justify-end' : 'justify-end',
    between: isHorizontal ? 'justify-between' : 'justify-between',
    around: isHorizontal ? 'justify-around' : 'justify-around',
    evenly: isHorizontal ? 'justify-evenly' : 'justify-evenly'
  }

  return (
    <div
      className={cn(
        'flex',
        isHorizontal ? 'flex-row' : 'flex-col',
        spacingClasses[spacing],
        alignClasses[align],
        justifyClasses[justify],
        wrap && 'flex-wrap',
        isTouch && 'touch-manipulation',
        className
      )}
    >
      {children}
    </div>
  )
}
