import React from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from '../skeleton'

interface WizardSkeletonProps {
  className?: string
}

/**
 * Route-level skeleton for the application wizard.
 * Mirrors: progress bar + form card with fields.
 * Respects prefers-reduced-motion via motion-reduce:animate-none.
 */
export function WizardSkeleton({ className }: WizardSkeletonProps) {
  return (
    <div className={cn('max-w-2xl mx-auto p-4 md:p-6 space-y-6', className)} role="status" aria-label="Loading wizard">
      {/* Progress indicator */}
      <div className="flex items-center gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <React.Fragment key={i}>
            <Skeleton className="h-8 w-8 rounded-full flex-shrink-0 motion-reduce:animate-none" />
            {i < 3 && <Skeleton className="h-0.5 flex-1 motion-reduce:animate-none" />}
          </React.Fragment>
        ))}
      </div>

      {/* Form card */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-6">
        <Skeleton className="h-6 w-48 motion-reduce:animate-none" />

        {/* Form fields */}
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24 motion-reduce:animate-none" />
            <Skeleton className="h-10 w-full rounded-md motion-reduce:animate-none" />
          </div>
        ))}

        {/* Action buttons */}
        <div className="flex justify-between pt-4">
          <Skeleton className="h-10 w-24 rounded-md motion-reduce:animate-none" />
          <Skeleton className="h-10 w-24 rounded-md motion-reduce:animate-none" />
        </div>
      </div>
    </div>
  )
}
