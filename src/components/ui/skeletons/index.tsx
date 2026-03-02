/**
 * Skeleton Loading Components
 * 
 * Comprehensive skeleton system for consistent loading states.
 * Implements Requirement 1.5: Display skeleton placeholders that match final layout
 * 
 * Variants:
 * - Card: For card-based content
 * - Table: For data tables
 * - Form: For form layouts
 * - Hero: For hero sections
 * - Dashboard: For dashboard layouts
 * - Stats: For statistics displays
 * - Timeline: For timeline/activity feeds
 * - Navigation: For navigation elements
 */
import React from 'react'
import { cn } from '@/lib/utils'

// Base Skeleton Component
interface SkeletonBaseProps {
  className?: string
  animation?: 'pulse' | 'wave' | 'none'
  width?: string | number
  height?: string | number
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full'
}

export function SkeletonBase({
  className,
  animation = 'pulse',
  width,
  height,
  rounded = 'md'
}: SkeletonBaseProps) {
  const roundedClasses = {
    none: '',
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    full: 'rounded-full'
  }
  
  const animationClasses = {
    pulse: 'animate-pulse',
    wave: 'animate-pulse',
    none: ''
  }
  
  return (
    <div
      className={cn(
        'bg-muted',
        roundedClasses[rounded],
        animationClasses[animation],
        className
      )}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height
      }}
      role="status"
      aria-label="Loading..."
    />
  )
}

// Card Skeleton
interface SkeletonCardProps {
  className?: string
  showAvatar?: boolean
  lines?: number
}

export function SkeletonCard({ 
  className, 
  showAvatar = true, 
  lines = 3 
}: SkeletonCardProps) {
  return (
    <div className={cn(
      'bg-card rounded-xl border border-border p-4 sm:p-6 space-y-4',
      className
    )}>
      <div className="flex items-start gap-3 sm:gap-4">
        {showAvatar && (
          <SkeletonBase 
            className="w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0" 
            rounded="full" 
          />
        )}
        <div className="flex-1 min-w-0 space-y-2">
          <SkeletonBase className="h-5 w-3/4" />
          {Array.from({ length: lines }).map((_, i) => (
            <SkeletonBase 
              key={i} 
              className={cn('h-4', i === lines - 1 ? 'w-1/2' : 'w-full')} 
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// Table Skeleton
interface SkeletonTableProps {
  rows?: number
  columns?: number
  className?: string
  showHeader?: boolean
}

export function SkeletonTable({ 
  rows = 5, 
  columns = 4, 
  className,
  showHeader = true 
}: SkeletonTableProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {showHeader && (
        <div 
          className="grid gap-3 sm:gap-4 pb-3 border-b border-border" 
          style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
        >
          {Array.from({ length: columns }).map((_, i) => (
            <SkeletonBase key={i} className="h-8 sm:h-10" />
          ))}
        </div>
      )}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div 
          key={rowIndex} 
          className="grid gap-3 sm:gap-4" 
          style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
        >
          {Array.from({ length: columns }).map((_, colIndex) => (
            <SkeletonBase key={colIndex} className="h-10 sm:h-12" />
          ))}
        </div>
      ))}
    </div>
  )
}

// Form Skeleton
interface SkeletonFormProps {
  fields?: number
  className?: string
  showSubmitButton?: boolean
}

export function SkeletonForm({ 
  fields = 4, 
  className,
  showSubmitButton = true 
}: SkeletonFormProps) {
  return (
    <div className={cn('space-y-6', className)}>
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <SkeletonBase className="h-4 w-24" />
          <SkeletonBase className="h-10 w-full" rounded="lg" />
        </div>
      ))}
      {showSubmitButton && (
        <div className="pt-4">
          <SkeletonBase className="h-11 w-full sm:w-32" rounded="lg" />
        </div>
      )}
    </div>
  )
}

// Hero Section Skeleton
interface SkeletonHeroProps {
  className?: string
  showStats?: boolean
  showCTA?: boolean
}

export function SkeletonHero({ 
  className,
  showStats = true,
  showCTA = true 
}: SkeletonHeroProps) {
  return (
    <div className={cn(
      'relative py-16 sm:py-24 lg:py-32 px-4 sm:px-6 lg:px-8',
      className
    )}>
      <div className="max-w-4xl mx-auto text-center space-y-6">
        {/* Title */}
        <SkeletonBase className="h-10 sm:h-14 lg:h-16 w-3/4 mx-auto" />
        
        {/* Subtitle */}
        <div className="space-y-2 max-w-2xl mx-auto">
          <SkeletonBase className="h-5 sm:h-6 w-full" />
          <SkeletonBase className="h-5 sm:h-6 w-4/5 mx-auto" />
        </div>
        
        {/* CTA Buttons */}
        {showCTA && (
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <SkeletonBase className="h-12 w-40 mx-auto sm:mx-0" rounded="lg" />
            <SkeletonBase className="h-12 w-36 mx-auto sm:mx-0" rounded="lg" />
          </div>
        )}
        
        {/* Stats */}
        {showStats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 pt-8 max-w-3xl mx-auto">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="text-center space-y-2">
                <SkeletonBase className="h-8 sm:h-10 w-20 mx-auto" />
                <SkeletonBase className="h-4 w-16 mx-auto" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Dashboard Skeleton
interface SkeletonDashboardProps {
  className?: string
  statsCount?: number
  cardsCount?: number
}

export function SkeletonDashboard({ 
  className,
  statsCount = 4,
  cardsCount = 3 
}: SkeletonDashboardProps) {
  return (
    <div className={cn('space-y-6 sm:space-y-8', className)}>
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {Array.from({ length: statsCount }).map((_, i) => (
          <SkeletonStats key={i} />
        ))}
      </div>
      
      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {Array.from({ length: cardsCount }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <div className="space-y-4">
          <SkeletonTimeline events={5} />
        </div>
      </div>
    </div>
  )
}

// Stats Card Skeleton
interface SkeletonStatsProps {
  className?: string
}

export function SkeletonStats({ className }: SkeletonStatsProps) {
  return (
    <div className={cn(
      'bg-card rounded-xl border border-border p-4 sm:p-6',
      className
    )}>
      <div className="flex items-center justify-between mb-3">
        <SkeletonBase className="h-4 w-20" />
        <SkeletonBase className="h-8 w-8" rounded="lg" />
      </div>
      <SkeletonBase className="h-8 sm:h-10 w-24 mb-2" />
      <SkeletonBase className="h-3 w-16" />
    </div>
  )
}

// Timeline Skeleton
interface SkeletonTimelineProps {
  events?: number
  className?: string
}

export function SkeletonTimeline({ events = 5, className }: SkeletonTimelineProps) {
  return (
    <div className={cn(
      'bg-card rounded-xl border border-border p-4 sm:p-6',
      className
    )}>
      <SkeletonBase className="h-6 w-32 mb-4" />
      <div className="space-y-4">
        {Array.from({ length: events }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <SkeletonBase className="w-2 h-2 mt-2 flex-shrink-0" rounded="full" />
            <div className="flex-1 space-y-1">
              <SkeletonBase className="h-4 w-3/4" />
              <SkeletonBase className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Navigation Skeleton
interface SkeletonNavigationProps {
  items?: number
  className?: string
  variant?: 'horizontal' | 'vertical'
}

export function SkeletonNavigation({ 
  items = 5, 
  className,
  variant = 'horizontal' 
}: SkeletonNavigationProps) {
  const isHorizontal = variant === 'horizontal'
  
  return (
    <div className={cn(
      'flex gap-2',
      isHorizontal ? 'flex-row' : 'flex-col',
      className
    )}>
      {Array.from({ length: items }).map((_, i) => (
        <SkeletonBase 
          key={i} 
          className={cn(
            isHorizontal ? 'h-8 w-20' : 'h-10 w-full'
          )} 
          rounded="lg" 
        />
      ))}
    </div>
  )
}

// List Skeleton
interface SkeletonListProps {
  items?: number
  className?: string
  showAvatar?: boolean
}

export function SkeletonList({ 
  items = 5, 
  className,
  showAvatar = true 
}: SkeletonListProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-border">
          {showAvatar && (
            <SkeletonBase className="w-10 h-10 flex-shrink-0" rounded="full" />
          )}
          <div className="flex-1 space-y-2">
            <SkeletonBase className="h-4 w-3/4" />
            <SkeletonBase className="h-3 w-1/2" />
          </div>
          <SkeletonBase className="h-8 w-16" rounded="lg" />
        </div>
      ))}
    </div>
  )
}

// Profile Skeleton
interface SkeletonProfileProps {
  className?: string
}

export function SkeletonProfile({ className }: SkeletonProfileProps) {
  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center gap-4">
        <SkeletonBase className="w-20 h-20 sm:w-24 sm:h-24" rounded="full" />
        <div className="space-y-2">
          <SkeletonBase className="h-6 w-40" />
          <SkeletonBase className="h-4 w-32" />
          <SkeletonBase className="h-4 w-24" />
        </div>
      </div>
      
      {/* Details */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <SkeletonBase className="h-3 w-20" />
            <SkeletonBase className="h-5 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

// Skeleton Wrapper Component
interface SkeletonWrapperProps {
  isLoading: boolean
  skeleton: React.ReactNode
  children: React.ReactNode
  className?: string
  minHeight?: string | number
}

export function SkeletonWrapper({
  isLoading,
  skeleton,
  children,
  className,
  minHeight
}: SkeletonWrapperProps) {
  return (
    <div 
      className={className}
      style={{ minHeight: typeof minHeight === 'number' ? `${minHeight}px` : minHeight }}
    >
      {isLoading ? skeleton : children}
    </div>
  )
}

// Export all components
export {
  SkeletonBase as Skeleton
}
