import React from 'react'
import { cn } from '@/lib/utils'

interface DraftBadgeProps {
  completionPercentage: number
  lastUpdated: string
  className?: string
}

/**
 * Formats a date string to a relative time format (e.g., "2 hours ago")
 */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMinutes < 1) return 'just now'
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
  
  return date.toLocaleDateString()
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
