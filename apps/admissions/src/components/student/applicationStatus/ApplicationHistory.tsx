/**
 * The application's own canonical status history — the platform's rows, not a
 * timeline the browser assembled.
 *
 * admissions-v2 task 10.6 — R13.2 ("canonical status history … with precise
 * dates and actors where permitted"), R13.13 (the workspace owns history),
 * finding **STU-23**.
 *
 * There are two different things on this page that both look like a timeline,
 * and the distinction is the point:
 *
 * * `StatusTimeline` is a **progress indicator**. It is derived in the browser
 *   from the application's own timestamp columns and it answers "how far along
 *   am I", including steps that have not happened yet.
 * * this component is the **record**. Every row is an `ApplicationStatusHistory`
 *   row the server wrote when a transition actually committed, with the
 *   transition it recorded, the note the actor left, the actor's name where the
 *   reader is permitted it, and the timestamp the platform stored.
 *
 * Before 10.6 the student had the first and not the second: the record existed
 * on `GET /applications/{id}/summary/` and no student surface read it, so "who
 * changed my application to under review, and when, and did they say why" was
 * unanswerable from the workspace. Nothing is computed here — the rows arrive
 * ordered newest-first from the server and are rendered in that order.
 */
import { History as HistoryIcon, User as UserIcon } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatTimestamp } from '@/lib/dateFormat'
import { formatApplicationStatus } from '@/types/applicationStatus'

/**
 * One server-written status-history row.
 *
 * Deliberately a read of the platform's published shape rather than a new type:
 * these are the keys `ApplicationSummaryView` emits, normalised once in
 * `services/applications.ts`. Every field except the id is optional because a
 * legacy row genuinely may not have them — a history row written before the
 * `notes` column was populated is still a real transition and must still render.
 */
export interface ApplicationHistoryRow {
  id: string
  status?: string | null
  old_status?: string | null
  new_status?: string | null
  notes?: string | null
  created_at?: string | null
  changed_by_name?: string | null
}

/** Narrow the service's `unknown[]` to the rows this component can render. */
export function toApplicationHistoryRows(history: unknown): ApplicationHistoryRow[] {
  if (!Array.isArray(history)) return []
  return history.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const row = entry as Record<string, unknown>
    const id = row.id
    if (typeof id !== 'string' && typeof id !== 'number') return []
    return [
      {
        id: String(id),
        status: typeof row.status === 'string' ? row.status : null,
        old_status: typeof row.old_status === 'string' ? row.old_status : null,
        new_status: typeof row.new_status === 'string' ? row.new_status : null,
        notes: typeof row.notes === 'string' ? row.notes : null,
        created_at: typeof row.created_at === 'string' ? row.created_at : null,
        changed_by_name: typeof row.changed_by_name === 'string' ? row.changed_by_name : null,
      },
    ]
  })
}

/**
 * The transition a row records.
 *
 * `old_status → new_status` when the server recorded both, and just the arrival
 * state when it did not. A missing `old_status` is the first transition (there
 * was nothing before it), so inventing a "from" would be a claim the platform
 * never made.
 */
function transitionLabel(row: ApplicationHistoryRow): string {
  const to = row.new_status ?? row.status
  if (!to) return 'Status recorded'
  const label = formatApplicationStatus(to)
  if (!row.old_status) return label
  return `${formatApplicationStatus(row.old_status)} \u2192 ${label}`
}

interface ApplicationHistoryProps {
  rows: ApplicationHistoryRow[]
  isLoading?: boolean
}

export function ApplicationHistory({ rows, isLoading }: ApplicationHistoryProps) {
  if (isLoading) {
    return (
      <p className="text-base sm:text-sm text-muted-foreground" role="status" aria-live="polite">
        Loading this application&rsquo;s history&hellip;
      </p>
    )
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<HistoryIcon className="h-10 w-10" />}
        heading="No recorded changes yet"
        description="Every change the admissions team makes to this application is recorded here with its date."
        className="py-10"
      />
    )
  }

  return (
    <ol className="space-y-3" data-testid="application-status-history">
      {rows.map((row) => (
        <li key={row.id} className="rounded-lg border border-border px-4 py-3">
          <p className="text-base sm:text-sm font-semibold text-foreground">{transitionLabel(row)}</p>
          {/*
            The server's own timestamp, rendered through the repo's single
            formatter. `formatTimestamp` answers "Not available" for a null,
            which is the honest reading of a legacy row with no recorded time —
            not today's date.
          */}
          <p className="mt-0.5 text-base sm:text-sm text-muted-foreground">
            {formatTimestamp(row.created_at ?? '')}
          </p>
          {row.changed_by_name && (
            <p className="mt-1 flex items-center gap-1.5 text-base sm:text-sm text-muted-foreground">
              <UserIcon className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
              <span>{row.changed_by_name}</span>
            </p>
          )}
          {row.notes && (
            <p className="mt-2 break-words rounded-md bg-muted px-3 py-2 text-base sm:text-sm text-foreground">
              {row.notes}
            </p>
          )}
        </li>
      ))}
    </ol>
  )
}

export default ApplicationHistory
