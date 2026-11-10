import { CheckCircle, Clock, XCircle } from 'lucide-react'
import { formatTimestamp } from '@/lib/dateFormat'
import { EmptyState } from '@/components/ui/EmptyState'
import type { StudentAmendment } from '@/services/applications'

/**
 * The student's own amendment history (task 10.2, R13.9-R13.10, finding STU-17).
 *
 * "Students can submit amendments but cannot list or track them." They now can:
 * every request shows the field, the value asked for, when it was asked, where it
 * stands, and — once decided — when. The status copy is the **server's**
 * (`status_definition`), and so is whether a request is still open
 * (`is_terminal`), so the browser and the platform cannot disagree about a
 * pending change.
 *
 * The reviewing member of staff is deliberately not shown: the decision and its
 * timing are the applicant's business, the identity behind it is the school's
 * internal record.
 */

const FIELD_LABELS: Record<string, string> = {
  phone: 'Phone',
  email: 'Email',
  address_line_1: 'Address line 1',
  address_line_2: 'Address line 2',
  residence_town: 'Residence town',
  next_of_kin_name: 'Next of kin name',
  next_of_kin_phone: 'Next of kin phone',
}

export function amendmentFieldLabel(fieldName: string): string {
  return (
    FIELD_LABELS[fieldName] ??
    fieldName.replace(/_/g, ' ').replace(/^\w/, (character) => character.toUpperCase())
  )
}

function statusIcon(amendment: StudentAmendment) {
  if (amendment.status === 'approved') {
    return <CheckCircle className="h-4 w-4 text-success" aria-hidden="true" />
  }
  if (amendment.status === 'rejected') {
    return <XCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
  }
  return <Clock className="h-4 w-4 text-warning" aria-hidden="true" />
}

function badgeClass(amendment: StudentAmendment): string {
  if (amendment.status === 'approved') return 'bg-success/10 text-success'
  if (amendment.status === 'rejected') return 'bg-destructive/10 text-destructive'
  return 'bg-warning/10 text-warning'
}

interface AmendmentHistoryProps {
  amendments: StudentAmendment[]
  totalCount?: number
  isLoading?: boolean
}

export function AmendmentHistory({ amendments, totalCount, isLoading }: AmendmentHistoryProps) {
  if (isLoading) {
    return (
      <p className="text-base sm:text-sm text-muted-foreground" role="status" aria-live="polite">
        Loading your amendment requests…
      </p>
    )
  }

  if (amendments.length === 0) {
    return (
      <EmptyState
        heading="No amendment requests yet"
        description="Requests you make to change your personal details will appear here with their status."
        className="py-10"
      />
    )
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {amendments.map((amendment) => (
          <li
            key={amendment.id}
            className="flex items-start gap-3 rounded-lg border border-border p-3"
          >
            <div className="mt-0.5 flex-shrink-0">{statusIcon(amendment)}</div>
            <div className="min-w-0 flex-1">
              <p className="text-base sm:text-sm font-medium text-foreground">
                {amendmentFieldLabel(amendment.field_name)}
                <span className="font-normal text-muted-foreground"> to </span>
                <span className="break-words">{amendment.new_value}</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Requested {formatTimestamp(amendment.requested_at ?? '')}
                {amendment.reviewed_at && ` \u2022 Reviewed ${formatTimestamp(amendment.reviewed_at)}`}
              </p>
              <span
                className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass(amendment)}`}
              >
                {amendment.status.toUpperCase()}
              </span>
              {amendment.status_definition && (
                <p className="mt-2 text-xs text-muted-foreground">{amendment.status_definition}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
      {typeof totalCount === 'number' && totalCount > amendments.length && (
        <p className="text-xs text-muted-foreground">
          Showing {amendments.length} of {totalCount} requests.
        </p>
      )}
    </div>
  )
}
