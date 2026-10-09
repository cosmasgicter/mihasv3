import { cn } from '@/lib/utils'
import { formatRelative } from '@/lib/dateFormat'

interface DraftBadgeProps {
  /**
   * How complete the draft is, or `null` when the roster does not know.
   *
   * Readiness is a per-application evaluation the server owns, not a list fact,
   * so the scoped roster contract (task 9.1) does not carry it. Rendering an
   * unknown as `0%` would state that the applicant has done nothing — a healthy
   * zero pointing the wrong way (R8.6), so an unknown says nothing instead.
   */
  completionPercentage: number | null
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
        {typeof completionPercentage === 'number' ? `Draft (${completionPercentage}%)` : 'Draft'}
      </span>
      <span className="text-xs text-muted-foreground">
        Last updated: {formatRelativeTime(lastUpdated)}
      </span>
    </div>
  )
}
