import React from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

interface AdminTableSkeletonProps {
  className?: string
  rows?: number
  columns?: number
}

/**
 * Route-level skeleton for admin table pages.
 * Mirrors: page header + filter bar + data table rows.
 * Respects prefers-reduced-motion via motion-reduce:animate-none.
 */
export function AdminTableSkeleton({ className, rows = 6, columns = 5 }: AdminTableSkeletonProps) {
  return (
    <div className={cn('p-4 md:p-6 lg:p-8 space-y-6', className)} role="status" aria-label="Loading table">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-40 motion-reduce:animate-none" />
        <Skeleton className="h-9 w-28 rounded-md motion-reduce:animate-none" />
      </div>

      {/* Filter bar */}
      <div className="flex gap-3">
        <Skeleton className="h-9 flex-1 max-w-xs rounded-md motion-reduce:animate-none" />
        <Skeleton className="h-9 w-28 rounded-md motion-reduce:animate-none" />
      </div>

      {/* Table header */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div
          className="grid gap-4 p-3 bg-muted/50 border-b border-border"
          style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
        >
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} className="h-4 motion-reduce:animate-none" />
          ))}
        </div>

        {/* Table rows */}
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div
            key={rowIdx}
            className="grid gap-4 p-3 border-b border-border last:border-b-0"
            style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
          >
            {Array.from({ length: columns }).map((_, colIdx) => (
              <Skeleton key={colIdx} className="h-4 motion-reduce:animate-none" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
