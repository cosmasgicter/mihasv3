/**
 * The applications roster's page navigator (Admissions V2, task 9.1).
 *
 * Requirements: R8.1 · Findings: ADM-01.
 *
 * The roster used to grow a buffer: "Load more" appended the next page to the
 * rows already on screen, and a footer divided the loaded count by the total to
 * show a "% loaded" figure. Nothing about that told an operator *where they
 * were*, and it is what made the page-derived totals feel plausible — the list
 * really did contain everything it was counting.
 *
 * This renders one page of a report. The page number, the page count, and the
 * total are all the server's; the only arithmetic here is `page ± 1`, and the
 * bounds come from the server's `totalPages`.
 */

import { Button } from '@/components/ui/Button'

export interface RosterPaginationProps {
  page: number
  totalPages: number
  totalCount: number
  loadedCount: number
  isPaging: boolean
  onPageChange: (page: number) => void
}

export function RosterPagination({
  page,
  totalPages,
  totalCount,
  loadedCount,
  isPaging,
  onPageChange,
}: RosterPaginationProps) {
  const canGoBack = page > 1 && !isPaging
  const canGoForward = page < totalPages && !isPaging

  return (
    <nav
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
      aria-label="Applications pagination"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <p className="text-sm text-foreground">
          Showing <span className="font-semibold">{loadedCount}</span> of{' '}
          <span className="font-semibold">{totalCount}</span> applications
        </p>
        <span className="hidden h-4 w-px bg-muted sm:block" aria-hidden="true" />
        <p className="text-xs text-muted-foreground" data-testid="roster-page-indicator">
          Page {page} of {totalPages}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-touch"
          disabled={!canGoBack}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          type="button"
          size="sm"
          className="min-h-touch"
          disabled={!canGoForward}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </nav>
  )
}
