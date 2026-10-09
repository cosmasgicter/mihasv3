/**
 * Amendments and conditions — the two review paths that had no control (R8.3).
 * Extracted from `ApplicationDetailModal.tsx` by admissions-v2 task **12.1**
 * (MAINT-01), verbatim.
 *
 * Task 9.4 added both: pending amendments used to be rendered read-only with no
 * way to act on them, and offer conditions were not shown at all, even though both
 * commands existed on the backend. Each decision is still a versioned command
 * issued through the callback the workspace supplies, and each is still gated on
 * the server's own published capability rather than a role tier.
 */
import { useState } from 'react'
import { AlertTriangle, ClipboardCheck, ClipboardList } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { formatDate } from '@/lib/dateFormat'
import type { ReviewWorkspace } from '@/services/admin/reviewWorkspace'


export function AmendmentReviewList({
  workspace,
  canReview,
  busy,
  onDecide,
}: {
  workspace: ReviewWorkspace
  canReview: boolean
  busy: boolean
  onDecide: (amendmentId: string, status: 'approved' | 'rejected') => void
}) {
  const records = workspace.amendments.records
  if (records.length === 0) return null

  return (
    <div className="rounded-lg border border-warning/30 bg-card p-6" data-testid="amendment-review">
      <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
        <ClipboardList className="h-5 w-5 text-warning" aria-hidden="true" />
        Amendment requests
        <span className="text-sm font-normal text-muted-foreground">
          ({workspace.amendments.pending_count} pending)
        </span>
      </h3>
      <div className="space-y-3">
        {records.map((amendment) => (
          <div
            key={amendment.id}
            data-testid={`amendment-${amendment.id}`}
            className="rounded-lg border border-warning/20 bg-warning/5 p-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium capitalize text-foreground">
                  {amendment.field_name.replace(/_/g, ' ')}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  New value: <span className="font-medium text-foreground">{amendment.new_value}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">Reason: {amendment.reason}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {amendment.created_at ? formatDate(amendment.created_at) : 'Date not available'}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-md border border-warning/25 bg-warning/10 px-2 py-1 text-xs font-medium text-warning">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                {amendment.status}
              </span>
            </div>
            {amendment.status === 'pending' && canReview && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  disabled={busy}
                  data-testid={`amendment-approve-${amendment.id}`}
                  onClick={() => onDecide(amendment.id, 'approved')}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  data-testid={`amendment-reject-${amendment.id}`}
                  onClick={() => onDecide(amendment.id, 'rejected')}
                >
                  Reject
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/** The floor the server puts on a reviewer's reason (`ConditionStateMachine`). */
const CONDITION_REASON_MIN_CHARS = 10

/** Outcomes the server requires a reason for. */
const CONDITION_OUTCOMES_REQUIRING_REASON = new Set(['changes_required', 'waived'])

export function ConditionReviewList({
  workspace,
  canVerify,
  busy,
  onReview,
}: {
  workspace: ReviewWorkspace
  canVerify: boolean
  busy: boolean
  onReview: (
    conditionId: string,
    outcome: 'met' | 'changes_required' | 'waived',
    reason?: string,
  ) => void
}) {
  const records = workspace.conditions.records
  /*
    Task 10.6: the reason a reviewer is about to give, per condition.

    Held here rather than in the modal because it belongs to one row's pending
    decision and is discarded with it. The minimum length is mirrored from the
    server's `ConditionStateMachine.MIN_REASON_CHARS` so the reviewer is told
    before the request rather than by a 400 — the server remains the authority
    and still enforces it.
  */
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const reasonFor = (conditionId: string) => (reasons[conditionId] ?? '').trim()
  const canSubmit = (conditionId: string, outcome: string) =>
    !busy &&
    (!CONDITION_OUTCOMES_REQUIRING_REASON.has(outcome) ||
      reasonFor(conditionId).length >= CONDITION_REASON_MIN_CHARS)

  if (records.length === 0) return null

  return (
    <div className="rounded-lg border border-border bg-card p-6" data-testid="condition-review">
      <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
        <ClipboardCheck className="h-5 w-5 text-primary" aria-hidden="true" />
        Offer conditions
        <span className="text-sm font-normal text-muted-foreground">
          ({workspace.conditions.open_count} open)
        </span>
      </h3>
      <div className="space-y-3">
        {records.map((condition) => (
          <div
            key={condition.id}
            data-testid={`condition-${condition.id}`}
            className="rounded-lg border border-border bg-muted/40 p-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{condition.description}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Due {condition.deadline ? formatDate(condition.deadline) : 'not set'} ·{' '}
                  {condition.condition_type.replace(/_/g, ' ')}
                </p>
                {condition.verified_by?.name && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Verified by {condition.verified_by.name}
                  </p>
                )}
              </div>
              <span className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground">
                {condition.status.replace(/_/g, ' ')}
              </span>
            </div>
            {condition.status !== 'met' && condition.status !== 'waived' && canVerify && (
              <div className="mt-3 space-y-2">
                {/*
                  Task 10.6 (STU-16): the reviewer's reason, and the third
                  outcome it unlocks. "Ask for something else" is the outcome the
                  two-outcome front door could not express, and without a reason
                  it would be the same dead end — the student would be told to try
                  again with no statement of what was wrong.
                */}
                <label
                  className="block text-xs font-medium text-foreground"
                  htmlFor={`condition-reason-${condition.id}`}
                >
                  Reason (required to waive or ask for something else)
                </label>
                <textarea
                  id={`condition-reason-${condition.id}`}
                  data-testid={`condition-reason-${condition.id}`}
                  value={reasons[condition.id] ?? ''}
                  onChange={(event) =>
                    setReasons((current) => ({ ...current, [condition.id]: event.target.value }))
                  }
                  rows={2}
                  maxLength={1000}
                  placeholder="What the applicant needs to know."
                  className="w-full rounded-md border border-input bg-card px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={!canSubmit(condition.id, 'met')}
                    data-testid={`condition-met-${condition.id}`}
                    onClick={() => onReview(condition.id, 'met', reasonFor(condition.id) || undefined)}
                  >
                    Mark met
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!canSubmit(condition.id, 'changes_required')}
                    data-testid={`condition-changes-${condition.id}`}
                    onClick={() => onReview(condition.id, 'changes_required', reasonFor(condition.id))}
                  >
                    Ask for something else
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!canSubmit(condition.id, 'waived')}
                    data-testid={`condition-waive-${condition.id}`}
                    onClick={() => onReview(condition.id, 'waived', reasonFor(condition.id))}
                  >
                    Waive
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

