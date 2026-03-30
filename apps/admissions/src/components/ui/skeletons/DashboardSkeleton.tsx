import React from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from '../skeleton'

interface DashboardSkeletonProps {
  className?: string
}

/**
 * Route-level skeleton for student/admin dashboard pages.
 * Mirrors: stat cards row + content list below.
 * Respects prefers-reduced-motion via motion-reduce:animate-none.
 */
export function DashboardSkeleton({ className }: DashboardSkeletonProps) {
  return (
    <div className={cn('space-y-6 p-4 md:p-6 lg:p-8', className)} role="status" aria-label="Loading dashboard">
      {/* Stat cards row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4 space-y-3">
            <Skeleton className="h-4 w-20 motion-reduce:animate-none" />
            <Skeleton className="h-8 w-24 motion-reduce:animate-none" />
            <Skeleton className="h-3 w-16 motion-reduce:animate-none" />
          </div>
        ))}
      </div>

      {/* Content list */}
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4 flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded-full flex-shrink-0 motion-reduce:animate-none" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4 motion-reduce:animate-none" />
              <Skeleton className="h-3 w-1/2 motion-reduce:animate-none" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full motion-reduce:animate-none" />
          </div>
        ))}
      </div>
    </div>
  )
}
