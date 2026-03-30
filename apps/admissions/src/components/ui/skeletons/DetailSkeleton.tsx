import React from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from '../skeleton'

interface DetailSkeletonProps {
  className?: string
}

/**
 * Route-level skeleton for detail view pages (application detail, profile, etc.).
 * Mirrors: header with title/badge + content sections.
 * Respects prefers-reduced-motion via motion-reduce:animate-none.
 */
export function DetailSkeleton({ className }: DetailSkeletonProps) {
  return (
    <div className={cn('max-w-3xl mx-auto p-4 md:p-6 lg:p-8 space-y-6', className)} role="status" aria-label="Loading details">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56 motion-reduce:animate-none" />
          <Skeleton className="h-4 w-36 motion-reduce:animate-none" />
        </div>
        <Skeleton className="h-6 w-20 rounded-full motion-reduce:animate-none" />
      </div>

      {/* Content sections */}
      {Array.from({ length: 3 }).map((_, sectionIdx) => (
        <div key={sectionIdx} className="rounded-lg border border-border bg-card p-5 space-y-4">
          <Skeleton className="h-5 w-32 motion-reduce:animate-none" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1">
                <Skeleton className="h-3 w-20 motion-reduce:animate-none" />
                <Skeleton className="h-5 w-full motion-reduce:animate-none" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
