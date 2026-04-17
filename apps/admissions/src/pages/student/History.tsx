import { useState, useCallback } from 'react'
import { Clock, History as HistoryIcon, ArrowRight, User } from 'lucide-react'
import { Seo } from '@/components/seo/Seo'
import { PageShell } from '@/components/ui/PageShell'
import { SectionCard } from '@/components/ui/SectionCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { Button } from '@/components/ui/Button'
import { useTimeline } from '@/hooks/useTimeline'
import { formatRelative } from '@/lib/dateFormat'

// ─── Status color mapping ───

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800/40 dark:text-gray-400',
  submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  under_review: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  waitlisted: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
}

const UNKNOWN_STATUS_COLOR = 'bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-400'

/**
 * Returns a CSS class string for a given application status.
 * Always returns a non-empty string, falling back to a neutral color for unknown statuses.
 */
export function getStatusColor(status: string | null | undefined): string {
  if (!status) return UNKNOWN_STATUS_COLOR
  return STATUS_COLORS[status] ?? UNKNOWN_STATUS_COLOR
}

/**
 * Formats a snake_case status string for display.
 * e.g. "under_review" → "Under Review"
 */
function formatStatus(status: string | null | undefined): string {
  if (!status) return 'Unknown'
  return status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export default function History() {
  const [page, setPage] = useState(1)

  const { groupedEntries, isLoading, error, pagination } = useTimeline({ page, pageSize: 20 })

  const totalPages = Math.max(1, Math.ceil(pagination.totalCount / pagination.pageSize))
  const isEmpty = !isLoading && !error && groupedEntries.length === 0

  const refetch = useCallback(() => {
    // Reset to page 1 on retry
    setPage(1)
  }, [])

  return (
    <>
      <Seo
        title="Activity History | MIHAS-KATC Admissions"
        description="View the chronological timeline of your application activity."
        path="/student/history"
        noindex
      />
      <PageShell
        title="Activity History"
        subtitle="A chronological timeline of all activity on your applications."
      >
        <div className="space-y-6">
          {/* Error state */}
          {error && (
            <ErrorDisplay
              title="Failed to load activity history"
              message={error.message || 'Something went wrong while fetching your activity history.'}
              onRetry={refetch}
            />
          )}

          {/* Loading state */}
          {isLoading && !error && (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-xl border border-border bg-card p-4"
                >
                  <div className="h-4 w-1/4 rounded bg-muted" />
                  <div className="mt-3 h-3 w-2/3 rounded bg-muted" />
                  <div className="mt-2 h-3 w-1/2 rounded bg-muted" />
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {isEmpty && (
            <EmptyState
              icon={<Clock className="h-12 w-12" />}
              heading="No activity history"
              description="There is no activity history for your applications yet. Updates will appear here as your applications progress."
            />
          )}

          {/* Grouped timeline entries */}
          {!isLoading && !error && groupedEntries.length > 0 && (
            <>
              {groupedEntries.map((group) => (
                <SectionCard
                  key={group.applicationNumber}
                  icon={<HistoryIcon className="h-5 w-5" />}
                  title={`Application ${group.applicationNumber}`}
                  padding="sm"
                >
                  <ul className="divide-y divide-border/50" role="list">
                    {group.entries.map((entry) => (
                      <li
                        key={entry.id}
                        className="flex items-start gap-3 px-3 py-4"
                      >
                        {/* Status transition indicator */}
                        <div className="mt-0.5 flex shrink-0 items-center gap-1.5">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(entry.old_status)}`}
                          >
                            {formatStatus(entry.old_status)}
                          </span>
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-label="to" />
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(entry.new_status)}`}
                          >
                            {formatStatus(entry.new_status)}
                          </span>
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          {entry.notes && (
                            <p className="text-sm text-foreground/80">
                              {entry.notes}
                            </p>
                          )}
                          <div className="mt-1 flex flex-wrap items-center gap-3">
                            <time
                              className="text-xs text-muted-foreground"
                              dateTime={entry.created_at}
                            >
                              {formatRelative(entry.created_at)}
                            </time>
                            {entry.changed_by_name && (
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <User className="h-3 w-3" />
                                {entry.changed_by_name}
                              </span>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              ))}
            </>
          )}

          {/* Pagination */}
          {!isLoading && !error && totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {pagination.page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </PageShell>
    </>
  )
}
