/**
 * EnhancedLoadingSpinner — minimal stub replacing the deleted original.
 * Provides the named exports consumed by EnhancedFileUpload and legacy tests.
 */

import React from 'react'
import { cn } from '@/lib/utils'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  color?: string
  className?: string
}

export function EnhancedLoadingSpinner({ size = 'md', className }: SpinnerProps) {
  const sizeClass = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-8 w-8' : 'h-6 w-6'
  return (
    <div
      className={cn('animate-spin rounded-full border-2 border-current border-t-transparent', sizeClass, className)}
      role="status"
      aria-label="Loading"
    />
  )
}

export function SkeletonCard({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-muted h-32', className)} />
}

export function SkeletonTable({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded bg-muted h-8" />
      ))}
    </div>
  )
}

export function SkeletonForm({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-4', className)}>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded bg-muted h-10" />
      ))}
    </div>
  )
}
