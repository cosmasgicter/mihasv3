import React from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from '../skeleton'

interface AuthSkeletonProps {
  className?: string
}

/**
 * Route-level skeleton for auth pages (sign-in, sign-up, reset).
 * Mirrors: centered card with logo + form fields.
 * Respects prefers-reduced-motion via motion-reduce:animate-none.
 */
export function AuthSkeleton({ className }: AuthSkeletonProps) {
  return (
    <div className={cn('min-h-screen flex items-center justify-center p-4', className)} role="status" aria-label="Loading">
      <div className="max-w-md w-full space-y-6">
        {/* Logo + institution name */}
        <div className="flex flex-col items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-full motion-reduce:animate-none" />
          <Skeleton className="h-5 w-48 motion-reduce:animate-none" />
        </div>

        {/* Form card */}
        <div className="rounded-lg border border-border bg-card p-6 md:p-8 space-y-5">
          <Skeleton className="h-6 w-32 motion-reduce:animate-none" />

          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-20 motion-reduce:animate-none" />
              <Skeleton className="h-11 w-full rounded-md motion-reduce:animate-none" />
            </div>
          ))}

          <Skeleton className="h-11 w-full rounded-md motion-reduce:animate-none" />
          <Skeleton className="h-4 w-40 mx-auto motion-reduce:animate-none" />
        </div>
      </div>
    </div>
  )
}
