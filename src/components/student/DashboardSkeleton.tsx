/**
 * DashboardSkeleton Component
 * Enhanced skeleton loading states for the student dashboard
 * 
 * @requirements 5.5, 5.6 - Skeleton loading states for data fetching
 */

import React from 'react';
import { Skeleton } from '@/components/ui';
import { cn } from '@/lib/utils';

interface DashboardSkeletonProps {
  className?: string;
}

// Metric card skeleton
function MetricCardSkeleton() {
  return (
    <div className="rounded-xl border border-border/50 p-4 border-l-4 border-l-border bg-muted/20">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-12" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
      </div>
    </div>
  );
}

// Status overview skeleton
function StatusOverviewSkeleton() {
  return (
    <div className="space-y-6">
      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <MetricCardSkeleton key={i} />
        ))}
      </div>

      {/* Latest Status Card */}
      <div className="rounded-lg border border-border/50 bg-card p-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-3 w-3 rounded-full" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
      </div>
    </div>
  );
}

// Timeline skeleton
function TimelineSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex gap-4">
          <div className="relative">
            <Skeleton className="h-8 w-8 rounded-full" />
            {i < 3 && (
              <div className="absolute left-[15px] top-8 w-0.5 h-12 bg-border" />
            )}
          </div>
          <div className="flex-1 space-y-2 pt-1">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Application card skeleton
function ApplicationCardSkeleton() {
  return (
    <div className="p-6 border-b border-border last:border-b-0">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1">
            <Skeleton className="h-5 w-5 rounded-full mt-1" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>

        {/* Details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2 border-t border-border/50">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
    </div>
  );
}

// Quick action skeleton
function QuickActionSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full rounded-lg" />
      ))}
    </div>
  );
}

// Profile summary skeleton
function ProfileSummarySkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl bg-muted/50 p-3 space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
      <Skeleton className="h-10 w-full mt-4" />
    </div>
  );
}

// Deadlines skeleton
function DeadlinesSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-orange-200 bg-orange-50/50 p-3 space-y-2">
          <Skeleton className="h-4 w-32 bg-orange-200/50" />
          <Skeleton className="h-3 w-24 bg-orange-200/50" />
        </div>
      ))}
    </div>
  );
}

// Full dashboard skeleton
export function DashboardSkeleton({ className }: DashboardSkeletonProps) {
  return (
    <div className={cn('space-y-6 sm:space-y-8', className)}>
      {/* Page Header Skeleton */}
      <div className="bg-gradient-to-r from-blue-600/80 to-purple-600/80 rounded-3xl p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-4">
            <Skeleton className="h-14 w-14 rounded-2xl bg-white/30" />
            <div className="space-y-3">
              <Skeleton className="h-8 w-48 bg-white/40" />
              <Skeleton className="h-4 w-64 bg-white/30" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-24 bg-white/30" />
            <Skeleton className="h-10 w-10 rounded-full bg-white/30" />
          </div>
        </div>
      </div>

      {/* Status Overview Skeleton */}
      <StatusOverviewSkeleton />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
        {/* Applications Section */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-border/70 bg-card shadow-lg">
            {/* Section Header */}
            <div className="px-6 py-5 border-b border-border/70 bg-gradient-to-r from-muted to-blue-50/50">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-xl" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-48" />
                </div>
              </div>
            </div>
            
            {/* Application Cards */}
            <div>
              {Array.from({ length: 3 }).map((_, i) => (
                <ApplicationCardSkeleton key={i} />
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Timeline Section */}
          <div className="rounded-2xl border border-border/70 bg-card shadow-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-4 w-44" />
              </div>
            </div>
            <TimelineSkeleton />
          </div>

          {/* Profile Summary */}
          <div className="rounded-2xl border border-border/70 bg-card shadow-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-4 w-40" />
              </div>
            </div>
            <ProfileSummarySkeleton />
          </div>

          {/* Deadlines */}
          <div className="rounded-2xl border border-border/70 bg-card shadow-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-4 w-48" />
              </div>
            </div>
            <DeadlinesSkeleton />
          </div>

          {/* Quick Actions */}
          <div className="rounded-2xl border border-border/70 bg-card shadow-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-4 w-44" />
              </div>
            </div>
            <QuickActionSkeleton />
          </div>
        </div>
      </div>
    </div>
  );
}

// Export individual skeletons for reuse
export {
  MetricCardSkeleton,
  StatusOverviewSkeleton,
  TimelineSkeleton,
  ApplicationCardSkeleton,
  QuickActionSkeleton,
  ProfileSummarySkeleton,
  DeadlinesSkeleton,
};

export default DashboardSkeleton;
