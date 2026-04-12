import React from 'react'
import { cn } from '@/lib/utils'

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md bg-skeleton before:absolute before:inset-y-0 before:left-0 before:w-1/2 before:-translate-x-full before:bg-gradient-to-r before:from-transparent before:via-white/45 before:to-transparent before:animate-[skeleton-shimmer_1.6s_ease-in-out_infinite] motion-reduce:before:animate-none',
        className
      )}
      {...props}
    />
  )
}

interface SkeletonTextProps {
  lines?: number
  className?: string
}

export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn('h-4', i === lines - 1 ? 'w-3/4' : 'w-full')}
        />
      ))}
    </div>
  )
}

// Preset skeleton components for common use cases

export function SkeletonCard() {
  return (
    <div className="p-4 border border-border rounded-lg space-y-3">
      <Skeleton className="h-5 w-3/5" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
      </div>
      <Skeleton className="h-3.5 w-2/5" />
    </div>
  )
}

export function SkeletonTable({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-3">
      <div className="flex space-x-4">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4" style={{ width: `${100 / columns}%` }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex space-x-4">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={colIndex} className="h-3.5" style={{ width: `${100 / columns}%` }} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonAvatar({ size = 40 }: { size?: number }) {
  return (
    <Skeleton
      className="rounded-full"
      style={{ height: size, width: size }}
    />
  )
}

// ─── Page-level skeleton components ───────────────────────────────────────────

/**
 * DashboardSkeleton — extracted from Dashboard.tsx isInitialLoading block.
 * Matches the student dashboard layout: status grid, applications card, sidebar.
 * Requirements: 13.1
 */
export function DashboardSkeleton() {
  return (
    <div className="space-y-6 sm:space-y-8" role="status" aria-label="Loading dashboard">
      {/* Status overview grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4">
            <Skeleton className="h-3 w-16 mb-3" />
            <Skeleton className="h-8 w-12" />
          </div>
        ))}
      </div>

      {/* Main grid: applications + sidebar */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
        {/* Applications card */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card">
          <div className="p-6 border-b border-border">
            <Skeleton className="h-5 w-36 mb-2" />
            <Skeleton className="h-3 w-64" />
          </div>
          <div className="divide-y divide-border">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="p-6 flex items-center gap-4">
                <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Profile summary skeleton */}
          <div className="rounded-xl border border-border bg-card p-6">
            <Skeleton className="h-5 w-32 mb-4" />
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="rounded-xl bg-muted px-4 py-3">
                  <Skeleton className="h-2 w-16 mb-2 bg-muted/60" />
                  <Skeleton className="h-4 w-28 bg-muted/60" />
                </div>
              ))}
            </div>
          </div>

          {/* Deadlines skeleton */}
          <div className="rounded-xl border border-border bg-card p-6">
            <Skeleton className="h-5 w-40 mb-4" />
            <div className="space-y-3">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="rounded-xl bg-muted/30 px-4 py-3">
                  <Skeleton className="h-4 w-36 mb-2" />
                  <Skeleton className="h-3 w-28" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <span className="sr-only" aria-live="polite">Loading dashboard</span>
    </div>
  )
}

/**
 * AuthSkeleton — mimics AuthLayout structure.
 * Desktop: split layout with gradient left panel + right form card.
 * Mobile: gradient bar + centered card with form field placeholders.
 * Requirements: 13.2
 */
export function AuthSkeleton() {
  return (
    <div className="min-h-screen bg-background" role="status" aria-label="Loading authentication page">
      <div className="flex min-h-screen">
        {/* Desktop branding panel placeholder */}
        <div className="hidden lg:flex lg:w-1/2 xl:w-[55%]">
          <div className="relative flex w-full flex-col justify-center px-12 xl:px-16">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-700 via-indigo-700 to-slate-900" />
            <div className="relative z-10 max-w-lg space-y-6">
              {/* Badge placeholder */}
              <Skeleton className="h-8 w-48 rounded-full bg-white/10" />
              {/* Hero title */}
              <div className="space-y-3">
                <Skeleton className="h-10 w-full bg-white/15" />
                <Skeleton className="h-10 w-3/4 bg-white/15" />
              </div>
              {/* Description */}
              <div className="space-y-2">
                <Skeleton className="h-5 w-full bg-white/10" />
                <Skeleton className="h-5 w-5/6 bg-white/10" />
              </div>
              {/* Feature cards grid */}
              <div className="grid grid-cols-2 gap-4 mt-8">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="rounded-2xl border border-white/20 bg-white/10 p-4">
                    <Skeleton className="h-6 w-6 rounded bg-white/20 mb-2" />
                    <Skeleton className="h-4 w-24 bg-white/15 mb-1" />
                    <Skeleton className="h-3 w-full bg-white/10" />
                  </div>
                ))}
              </div>
              {/* Stats row */}
              <div className="flex items-center gap-8 mt-8">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center gap-8">
                    {i > 0 && <div className="h-12 w-px bg-white/20" />}
                    <div>
                      <Skeleton className="h-8 w-14 bg-white/15 mb-1" />
                      <Skeleton className="h-3 w-20 bg-white/10" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Form panel */}
        <div className="flex flex-1 flex-col overflow-y-auto lg:w-1/2 xl:w-[45%]">
          {/* Mobile gradient bar */}
          <div className="h-1.5 bg-gradient-to-r from-blue-700 via-indigo-600 to-slate-900 lg:hidden" />

          <div className="flex flex-1 flex-col justify-center px-4 py-8 sm:px-6 sm:py-12 lg:px-12 xl:px-16">
            <div className="mx-auto w-full max-w-2xl">
              {/* Back link */}
              <Skeleton className="h-4 w-28 mb-4" />

              {/* Mobile logo */}
              <div className="flex items-center mt-4 lg:hidden">
                <Skeleton className="h-12 w-12 rounded-xl" />
                <Skeleton className="h-5 w-16 ml-3" />
              </div>

              {/* Mobile summary card */}
              <div className="mt-4 rounded-2xl border border-border bg-muted/30 p-4 lg:hidden">
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-3/4 mb-3" />
                <div className="flex gap-3">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-4 w-24" />
                  ))}
                </div>
              </div>

              {/* Form card */}
              <div className="mt-6 rounded-[28px] border border-border/70 bg-background/90 p-5 shadow-xl sm:p-8 lg:p-9">
                <div className="space-y-5">
                  {/* Badge */}
                  <Skeleton className="h-6 w-40 rounded-full" />
                  {/* Heading */}
                  <div>
                    <Skeleton className="h-8 w-56 mb-2" />
                    <Skeleton className="h-4 w-72" />
                  </div>
                  {/* Form fields */}
                  <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="space-y-1.5">
                        <Skeleton className="h-3.5 w-20" />
                        <Skeleton className="h-10 w-full rounded-lg" />
                      </div>
                    ))}
                  </div>
                  {/* Submit button */}
                  <Skeleton className="h-11 w-full rounded-lg" />
                  {/* Footer */}
                  <div className="border-t border-border pt-5">
                    <Skeleton className="h-4 w-48 mx-auto" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <span className="sr-only" aria-live="polite">Loading authentication page</span>
    </div>
  )
}

/**
 * WizardSkeleton — mimics the application wizard layout.
 * Progress bar, step title/description, form area with field skeletons,
 * navigation buttons, and sidebar with checklist.
 * Requirements: 13.3
 */
export function WizardSkeleton() {
  return (
    <div className="min-h-screen bg-background" role="status" aria-label="Loading application wizard">
      <div className="w-full">
        {/* Header area */}
        <div className="mx-auto max-w-4xl py-4 px-4 sm:py-8">
          {/* Page title */}
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-80 mb-8" />

          {/* Back link */}
          <Skeleton className="h-8 w-40 rounded-full mb-4" />
          <Skeleton className="h-4 w-48 mb-6" />
        </div>

        {/* Progress bar + step info */}
        <div className="mx-auto max-w-4xl px-4 mb-6 lg:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex-1">
              {/* Step title */}
              <Skeleton className="h-5 w-44 mb-2" />
              {/* Step description */}
              <Skeleton className="h-4 w-72 mb-3" />
              {/* Progress bar */}
              <div className="flex items-center gap-2">
                <div className="flex-1 overflow-hidden rounded-full bg-border">
                  <div className="h-2 w-1/4 bg-muted rounded-full" />
                </div>
                <Skeleton className="h-4 w-10" />
              </div>
              {/* Field completion */}
              <div className="flex items-center gap-2 mt-2">
                <Skeleton className="h-3.5 w-3.5 rounded-full" />
                <Skeleton className="h-3 w-36" />
              </div>
            </div>
            {/* Auto-save indicator */}
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>

          {/* Step indicators */}
          <div className="flex items-center gap-2">
            {[...Array(4)].map((_, i) => (
              <React.Fragment key={i}>
                <Skeleton className={cn('h-8 w-8 rounded-full', i === 0 ? 'bg-primary/20' : '')} />
                {i < 3 && <Skeleton className="h-0.5 flex-1" />}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Main content grid */}
        <div className="mx-auto max-w-4xl px-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
            {/* Form area */}
            <div className="lg:col-span-2 space-y-6">
              {/* Form card */}
              <div className="rounded-xl border border-border bg-card p-6 space-y-5">
                {/* Section heading */}
                <Skeleton className="h-6 w-48 mb-4" />
                {/* Form fields */}
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-10 w-full rounded-lg" />
                  </div>
                ))}
              </div>

              {/* Navigation buttons */}
              <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-6 border-t border-border">
                <Skeleton className="h-10 w-full sm:w-32 rounded-lg" />
                <Skeleton className="h-10 w-full sm:w-32 rounded-lg" />
              </div>
            </div>

            {/* Sidebar */}
            <aside className="lg:col-span-1 space-y-4">
              {/* Application preview */}
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <Skeleton className="h-5 w-36 mb-3" />
                {[...Array(3)].map((_, i) => (
                  <div key={i}>
                    <Skeleton className="h-3 w-20 mb-1" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                ))}
              </div>

              {/* Step checklist */}
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <Skeleton className="h-5 w-28 mb-3" />
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Skeleton className="h-4 w-4 rounded-full" />
                    <Skeleton className="h-3.5 w-28" />
                  </div>
                ))}
              </div>

              {/* Quick tips */}
              <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                <Skeleton className="h-5 w-24 mb-3" />
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-3 w-full" />
                ))}
              </div>
            </aside>
          </div>
        </div>
      </div>
      <span className="sr-only" aria-live="polite">Loading application wizard</span>
    </div>
  )
}
