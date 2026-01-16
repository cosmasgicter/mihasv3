/**
 * Responsive Layout Components
 * 
 * Provides layout components that adapt to different screen sizes,
 * orientations, and safe areas.
 * 
 * Requirements: 9.3, 9.4, 9.5, 9.6, 9.7
 */

import React, { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useEnhancedResponsive } from '@/hooks/useEnhancedResponsive'

/**
 * Responsive Container
 * 
 * A container that adapts padding and max-width based on viewport.
 */
interface ResponsiveContainerProps {
  children: ReactNode
  className?: string
  /** Maximum width constraint */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
  /** Whether to add safe area padding */
  safeArea?: boolean
  /** Custom padding */
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const maxWidthClasses = {
  sm: 'max-w-screen-sm',
  md: 'max-w-screen-md',
  lg: 'max-w-screen-lg',
  xl: 'max-w-screen-xl',
  '2xl': 'max-w-screen-2xl',
  full: 'max-w-full',
}

const paddingClasses = {
  none: '',
  sm: 'px-3 sm:px-4 lg:px-6',
  md: 'px-4 sm:px-6 lg:px-8',
  lg: 'px-6 sm:px-8 lg:px-12',
}

export function ResponsiveContainer({
  children,
  className,
  maxWidth = 'xl',
  safeArea = false,
  padding = 'md',
}: ResponsiveContainerProps) {
  return (
    <div
      className={cn(
        'mx-auto w-full',
        maxWidthClasses[maxWidth],
        paddingClasses[padding],
        safeArea && 'safe-area-left safe-area-right',
        className
      )}
    >
      {children}
    </div>
  )
}

/**
 * Responsive Stack
 * 
 * A stack that changes direction based on viewport.
 */
interface ResponsiveStackProps {
  children: ReactNode
  className?: string
  /** Direction on mobile */
  mobileDirection?: 'row' | 'column'
  /** Direction on desktop */
  desktopDirection?: 'row' | 'column'
  /** Gap between items */
  gap?: 'none' | 'sm' | 'md' | 'lg' | 'xl'
  /** Alignment */
  align?: 'start' | 'center' | 'end' | 'stretch'
  /** Justify content */
  justify?: 'start' | 'center' | 'end' | 'between' | 'around'
}

const gapClasses = {
  none: 'gap-0',
  sm: 'gap-2 sm:gap-3',
  md: 'gap-3 sm:gap-4 lg:gap-6',
  lg: 'gap-4 sm:gap-6 lg:gap-8',
  xl: 'gap-6 sm:gap-8 lg:gap-12',
}

const alignClasses = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
}

const justifyClasses = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
  around: 'justify-around',
}

export function ResponsiveStack({
  children,
  className,
  mobileDirection = 'column',
  desktopDirection = 'row',
  gap = 'md',
  align = 'stretch',
  justify = 'start',
}: ResponsiveStackProps) {
  const mobileClass = mobileDirection === 'row' ? 'flex-row' : 'flex-col'
  const desktopClass = desktopDirection === 'row' ? 'md:flex-row' : 'md:flex-col'

  return (
    <div
      className={cn(
        'flex',
        mobileClass,
        desktopClass,
        gapClasses[gap],
        alignClasses[align],
        justifyClasses[justify],
        className
      )}
    >
      {children}
    </div>
  )
}

/**
 * Responsive Grid
 * 
 * A grid that adapts columns based on viewport.
 */
interface ResponsiveGridProps {
  children: ReactNode
  className?: string
  /** Columns on mobile */
  mobileCols?: 1 | 2
  /** Columns on tablet */
  tabletCols?: 1 | 2 | 3 | 4
  /** Columns on desktop */
  desktopCols?: 1 | 2 | 3 | 4 | 5 | 6
  /** Gap between items */
  gap?: 'none' | 'sm' | 'md' | 'lg' | 'xl'
}

export function ResponsiveGrid({
  children,
  className,
  mobileCols = 1,
  tabletCols = 2,
  desktopCols = 3,
  gap = 'md',
}: ResponsiveGridProps) {
  const mobileColClass = `grid-cols-${mobileCols}`
  const tabletColClass = `sm:grid-cols-${tabletCols}`
  const desktopColClass = `lg:grid-cols-${desktopCols}`

  return (
    <div
      className={cn(
        'grid',
        mobileColClass,
        tabletColClass,
        desktopColClass,
        gapClasses[gap],
        className
      )}
    >
      {children}
    </div>
  )
}

/**
 * Landscape Compact Container
 * 
 * Reduces vertical spacing in landscape orientation on small screens.
 */
interface LandscapeCompactProps {
  children: ReactNode
  className?: string
  /** Normal padding */
  normalPadding?: string
  /** Compact padding for landscape */
  compactPadding?: string
}

export function LandscapeCompact({
  children,
  className,
  normalPadding = 'py-4',
  compactPadding = 'landscape:py-2',
}: LandscapeCompactProps) {
  return (
    <div className={cn(normalPadding, compactPadding, className)}>
      {children}
    </div>
  )
}

/**
 * Hide on Landscape
 * 
 * Hides content in landscape orientation on small screens.
 */
interface HideOnLandscapeProps {
  children: ReactNode
  className?: string
  /** Only hide on small landscape screens */
  smallOnly?: boolean
}

export function HideOnLandscape({
  children,
  className,
  smallOnly = true,
}: HideOnLandscapeProps) {
  const responsive = useEnhancedResponsive()
  
  // Hide in landscape on small screens (height < 500px)
  if (smallOnly && responsive.isLandscape && responsive.viewportHeight < 500) {
    return null
  }
  
  // Hide in all landscape orientations
  if (!smallOnly && responsive.isLandscape) {
    return null
  }

  return <div className={className}>{children}</div>
}

/**
 * Show on Landscape
 * 
 * Shows content only in landscape orientation.
 */
interface ShowOnLandscapeProps {
  children: ReactNode
  className?: string
}

export function ShowOnLandscape({ children, className }: ShowOnLandscapeProps) {
  const responsive = useEnhancedResponsive()
  
  if (!responsive.isLandscape) {
    return null
  }

  return <div className={className}>{children}</div>
}

/**
 * Mobile Only
 * 
 * Shows content only on mobile devices.
 */
interface MobileOnlyProps {
  children: ReactNode
  className?: string
}

export function MobileOnly({ children, className }: MobileOnlyProps) {
  return (
    <div className={cn('md:hidden', className)}>
      {children}
    </div>
  )
}

/**
 * Desktop Only
 * 
 * Shows content only on desktop devices.
 */
interface DesktopOnlyProps {
  children: ReactNode
  className?: string
}

export function DesktopOnly({ children, className }: DesktopOnlyProps) {
  return (
    <div className={cn('hidden md:block', className)}>
      {children}
    </div>
  )
}

/**
 * Safe Area Spacer
 * 
 * Adds spacing for safe areas (notches, home indicators).
 */
interface SafeAreaSpacerProps {
  position: 'top' | 'bottom' | 'left' | 'right'
  className?: string
  /** Minimum height/width */
  minSize?: number
}

export function SafeAreaSpacer({
  position,
  className,
  minSize = 0,
}: SafeAreaSpacerProps) {
  const style: React.CSSProperties = {}
  
  switch (position) {
    case 'top':
      style.height = `max(${minSize}px, env(safe-area-inset-top, 0px))`
      break
    case 'bottom':
      style.height = `max(${minSize}px, env(safe-area-inset-bottom, 0px))`
      break
    case 'left':
      style.width = `max(${minSize}px, env(safe-area-inset-left, 0px))`
      break
    case 'right':
      style.width = `max(${minSize}px, env(safe-area-inset-right, 0px))`
      break
  }

  return <div className={className} style={style} aria-hidden="true" />
}

/**
 * Page Layout with Safe Areas
 * 
 * A full-page layout that handles safe areas and bottom navigation.
 */
interface PageLayoutProps {
  children: ReactNode
  className?: string
  /** Whether to show bottom navigation */
  hasBottomNav?: boolean
  /** Header height */
  headerHeight?: number
}

export function PageLayout({
  children,
  className,
  hasBottomNav = false,
  headerHeight = 64,
}: PageLayoutProps) {
  return (
    <div
      className={cn(
        'min-h-screen flex flex-col',
        'safe-area-top safe-area-left safe-area-right',
        className
      )}
      style={{
        paddingTop: `max(${headerHeight}px, calc(${headerHeight}px + env(safe-area-inset-top, 0px)))`,
        paddingBottom: hasBottomNav 
          ? 'calc(64px + env(safe-area-inset-bottom, 0px))' 
          : 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {children}
    </div>
  )
}
