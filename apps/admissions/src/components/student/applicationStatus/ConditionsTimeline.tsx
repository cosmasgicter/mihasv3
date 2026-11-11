import React, { useRef, useState } from 'react'
import { CheckCircle, Clock, FileUp, History, XCircle } from 'lucide-react'
import { staggerChild, animateClasses } from '@/lib/animations'
import { formatDate, formatTimestamp } from '@/lib/dateFormat'
import { Button } from '@/components/ui/Button'
import type { StudentCondition } from '@/services/applications'

/**
 * Admission conditions, with the evidence workflow STU-16 found missing.
 *
 * Task 10.2 (R13.9). Before this, a conditionally approved student was told what
 * they owed and given nowhere to put it: this component rendered a description, a
 * deadline and an upper-cased status string, and there was no write path at all.
 * Now each condition shows the server's own words for its state, whose move it
 * is, the evidence attached to it, the reviewer's reason when they asked for
 * something different, and a control to send or replace the file.
 *
 * Two rules the component follows deliberately:
 *
 * * **it derives no copy and no permission.** `state_definition`, `waiting_on`
 *   and `allowed_actions` come from the server. A client-side status table is how
 *   the notification settings drifted away from the delivery path (STU-14), and a
 *   condition is a deadline that can cost a place.
 * * **a status is never colour alone** (`DESIGN.md`): every state renders an icon
 *   and a text label.
 */

interface ConditionsTimelineProps {
  conditions: StudentCondition[]
  /** Submit or replace one condition's evidence. Absent for a read-only view. */
  onSubmitEvidence?: (conditionId: string, file: File, comment: string) => void
  /** The condition currently being uploaded, if any. */
  pendingConditionId?: string | null
  /** A per-condition error message from the last attempt. */
  errors?: Record<string, string>
}

const TERMINAL_TONE = 'border-success/30 bg-success/5'
const BLOCKED_TONE = 'border-destructive/30 bg-destructive/5'
const WAITING_TONE = 'border-warning/30 bg-warning/5'

function toneFor(condition: StudentCondition): string {
  if (condition.status === 'met' || condition.status === 'waived') return TERMINAL_TONE
  if (condition.status === 'expired' || condition.status === 'changes_required') return BLOCKED_TONE
  return WAITING_TONE
}

function iconFor(condition: StudentCondition) {
  if (condition.status === 'met' || condition.status === 'waived') {
    return <CheckCircle className="h-5 w-5 text-success" aria-hidden="true" />
  }
  if (condition.status === 'expired') {
    return <XCircle className="h-5 w-5 text-destructive" aria-hidden="true" />
  }
  if (condition.status === 'changes_required') {
    return <FileUp className="h-5 w-5 text-destructive" aria-hidden="true" />
  }
  return <Clock className="h-5 w-5 text-warning" aria-hidden="true" />
}

function statusLabel(condition: StudentCondition): string {
  return (condition.state || condition.status).replace(/_/g, ' ')
}

function badgeClass(condition: StudentCondition): string {
  if (condition.status === 'met' || condition.status === 'waived') {
    return 'bg-success/10 text-success'
  }
  if (condition.status === 'expired' || condition.status === 'changes_required') {
    return 'bg-destructive/10 text-destructive'
  }
  return 'bg-warning/10 text-warning'
}

function ConditionEvidenceForm({
  condition,
  isPending,
  error,
  onSubmit,
}: {
  condition: StudentCondition
  isPending: boolean
  error?: string
  onSubmit: (file: File, comment: string) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [comment, setComment] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const isReplacement = condition.allowed_actions.includes('replace_evidence')
  const fileInputId = `condition-evidence-${condition.id}`
  const commentInputId = `condition-comment-${condition.id}`

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!file) return
    onSubmit(file, comment)
    setFile(null)
    setComment('')
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-2 border-t border-border pt-3">
      <div>
        <label htmlFor={fileInputId} className="block text-base sm:text-sm font-medium text-foreground mb-1">
          {isReplacement ? 'Replace your evidence' : 'Attach your evidence'}
        </label>
        <input data-text-role="caption"
          id={fileInputId}
          ref={inputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="block w-full text-sm sm:text-xs text-muted-foreground file:mr-3 file:min-h-touch file:rounded-md file:border file:border-input file:bg-card file:px-3 file:py-2 file:text-xs file:font-medium"
        />
      </div>
      <div>
        <label htmlFor={commentInputId} className="block text-base sm:text-sm font-medium text-foreground mb-1">
          Add a note (optional)
        </label>
        <textarea data-text-role="caption"
          id={commentInputId}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="Explain what you have attached, if it helps."
          className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm sm:text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      {error && (
        <p className="text-base sm:text-sm text-destructive" role="alert" aria-live="assertive">
          {error}
        </p>
      )}
      <Button type="submit" variant="outline" size="sm" loading={isPending} disabled={!file}>
        <FileUp className="mr-2 h-4 w-4" aria-hidden="true" />
        {isReplacement ? 'Send a replacement' : 'Send evidence'}
      </Button>
    </form>
  )
}

export function ConditionsTimeline({
  conditions,
  onSubmitEvidence,
  pendingConditionId,
  errors,
}: ConditionsTimelineProps) {
  return (
    <div className="space-y-4">
      {conditions.map((condition, index) => {
        const canSubmit =
          !!onSubmitEvidence &&
          (condition.allowed_actions.includes('submit_evidence') ||
            condition.allowed_actions.includes('replace_evidence'))
        return (
          <div
            key={condition.id}
            className={`flex items-start gap-3 rounded-lg border p-3 ${toneFor(condition)} ${animateClasses.slideUp}`}
            style={staggerChild(index, 50)}
          >
            <div className="flex-shrink-0 mt-0.5">{iconFor(condition)}</div>
            <div className="flex-1 min-w-0">
              <p className="text-base sm:text-sm font-medium text-foreground">{condition.description}</p>
              <p className="text-base sm:text-sm text-muted-foreground mt-1">
                Deadline: {formatDate(condition.deadline ?? '')}
                {condition.met_at && ` \u2022 Fulfilled: ${formatDate(condition.met_at)}`}
              </p>
              <span data-text-role="caption"
                className={`inline-block mt-1 rounded-full px-2 py-0.5 text-sm sm:text-xs font-medium ${badgeClass(condition)}`}
              >
                {statusLabel(condition).toUpperCase()}
              </span>
              {condition.state_definition && (
                <p className="mt-2 text-base sm:text-sm text-muted-foreground">{condition.state_definition}</p>
              )}
              {condition.status === 'changes_required' && condition.review_reason && (
                <p className="mt-2 rounded-md bg-destructive/10 px-2 py-1 text-base sm:text-sm text-destructive">
                  <span className="font-medium">The admissions team asked for: </span>
                  {condition.review_reason}
                </p>
              )}
              {condition.evidence && (
                <p className="mt-2 text-base sm:text-sm text-muted-foreground">
                  Attached: <span className="font-medium">{condition.evidence.document_name}</span>
                  {` \u2022 version ${condition.evidence.version}`}
                  {condition.evidence.uploaded_at &&
                    ` \u2022 ${formatTimestamp(condition.evidence.uploaded_at)}`}
                </p>
              )}
              {condition.superseded_evidence.length > 0 && (
                <p className="mt-1 flex items-center gap-1 text-base sm:text-sm text-muted-foreground">
                  <History className="h-3 w-3" aria-hidden="true" />
                  {condition.superseded_evidence.length === 1
                    ? '1 earlier version kept'
                    : `${condition.superseded_evidence.length} earlier versions kept`}
                </p>
              )}
              {canSubmit && (
                <ConditionEvidenceForm
                  condition={condition}
                  isPending={pendingConditionId === condition.id}
                  error={errors?.[condition.id]}
                  onSubmit={(file, comment) => onSubmitEvidence?.(condition.id, file, comment)}
                />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
