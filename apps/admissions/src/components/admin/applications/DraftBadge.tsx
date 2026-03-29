import React from 'react'
import { cn } from '@/lib/utils'
import { formatRelative } from '@/lib/dateFormat'

interface DraftBadgeProps {
  completionPercentage: number
  lastUpdated: string
  className?: string
}

/**
 * Formats a date string to a relative time format (e.g., "2 hours ago")
 */
function formatRelativeTime(dateString: string): string {
  return formatRelative(dateString)
}

export function DraftBadge({ completionPercentage, lastUpdated, className }: DraftBadgeProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="px-2 py-1 text-xs font-medium bg-amber-100 text-amber-800 rounded-full">
        Draft ({completionPercentage}%)
      </span>
      <span className="text-xs text-muted-foreground">
        Last updated: {formatRelativeTime(lastUpdated)}
      </span>
    </div>
  )
}
