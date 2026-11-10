/**
 * The deterministic reviewer readiness checklist (Admissions V2, task 9.4).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 9.4
 * Requirements: **R11.3** (the reviewer readiness query returns the payment gate,
 * required-document state, identity verification state, grade/eligibility
 * results, duplicate/late flags, and allowed next actions from *deterministic*
 * services), **R11.1** (no generative call), **R8.6** (missing data must not
 * become a healthy zero).
 * Findings: STU-06 (the AI touchpoint), AUTH-01.
 *
 * What this replaces
 * ------------------
 *
 * `AISummaryPanel` rendered a paragraph of model-generated prose under an "AI"
 * tab, fetched from `GET /applications/{id}/admin-summary/`. Task 7.4 deleted
 * that endpoint from the backend (R11.1), so by the time this task started the
 * panel was fetching a route that returned 404 and rendering "No AI summary
 * available for this application." every time — a tab that could only ever say
 * nothing.
 *
 * What a reviewer needs instead is not a paragraph: it is the list of facts the
 * server would itself act on. Every row here is one deterministic evaluator's
 * answer, carried in the workspace read, in the same three states the backend
 * publishes:
 *
 * * **blocked** — a registered blocker names this check;
 * * **attention** — not satisfied, but does not block (an advisory eligibility
 *   rule, a late or duplicate flag);
 * * **satisfied** — the evaluator is satisfied.
 *
 * There is no score and no recommendation. A reviewer reads facts and decides.
 */
import { AlertTriangle, CheckCircle2, HelpCircle, XCircle } from 'lucide-react'

import type { ReadinessCheck, WorkspaceReadiness } from '@/services/admin/reviewWorkspace'

interface ReviewReadinessPanelProps {
  readiness: WorkspaceReadiness | null
  /** The sentence the server ships for the readiness section (R8.6). */
  definition?: string
}

const STATE_PRESENTATION: Record<
  ReadinessCheck['state'],
  { label: string; tone: string; Icon: typeof CheckCircle2 }
> = {
  satisfied: {
    label: 'Satisfied',
    tone: 'border-success/30 bg-success/5 text-success',
    Icon: CheckCircle2,
  },
  attention: {
    label: 'Needs attention',
    tone: 'border-warning/30 bg-warning/5 text-warning',
    Icon: AlertTriangle,
  },
  blocked: {
    label: 'Blocked',
    tone: 'border-destructive/30 bg-destructive/5 text-destructive',
    Icon: XCircle,
  },
}

/** Render one check's own detail as label/value pairs, without interpreting it. */
function CheckDetail({ detail }: { detail: Record<string, unknown> }) {
  const entries = Object.entries(detail).filter(([key, value]) => {
    // `requirements` is the full per-requirement list the documents tab renders;
    // repeating it here would duplicate a section rather than summarise it.
    if (key === 'requirements') return false
    if (value === null || value === undefined || value === '') return false
    if (Array.isArray(value) && value.length === 0) return false
    return true
  })
  if (entries.length === 0) return null

  return (
    <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <div key={key} className="flex flex-wrap items-baseline gap-1.5 text-xs">
          <dt className="font-medium text-muted-foreground">
            {key.replace(/_/g, ' ')}
          </dt>
          <dd className="font-semibold text-foreground">
            {Array.isArray(value)
              ? value.map((item) => String(item).replace(/_/g, ' ')).join(', ')
              : typeof value === 'boolean'
                ? value
                  ? 'Yes'
                  : 'No'
                : String(value).replace(/_/g, ' ')}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function ReviewReadinessPanel({ readiness, definition }: ReviewReadinessPanelProps) {
  // R8.6 / R11.6: an unevaluable configuration is *not* an empty checklist. The
  // server sends null rather than a satisfied-looking shape, and this says so
  // rather than rendering a clean screen a reviewer would read as "nothing
  // outstanding".
  if (readiness === null) {
    return (
      <div
        className="rounded-lg border border-warning/30 bg-warning/5 p-6"
        role="status"
        data-testid="readiness-unavailable"
      >
        <div className="flex items-start gap-3">
          <HelpCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-warning" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-foreground">
              Review readiness is unavailable
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              The programme configuration for this application could not be evaluated, so
              the readiness checklist cannot be produced. This is not the same as "nothing
              outstanding". Reload shortly, and escalate if it persists.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const blocked = readiness.checks.filter((check) => check.state === 'blocked')
  const attention = readiness.checks.filter((check) => check.state === 'attention')

  return (
    <div className="space-y-4" data-testid="review-readiness">
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground">Review readiness</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {definition ??
            'A deterministic checklist of verified facts. No summary is generated and no recommendation is made.'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
          <span
            className="inline-flex items-center gap-1.5 rounded-md border border-destructive/25 bg-destructive/10 px-2.5 py-1 text-destructive"
            data-testid="readiness-blocked-count"
          >
            <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
            {blocked.length} blocked
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-warning/25 bg-warning/10 px-2.5 py-1 text-warning">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            {attention.length} needing attention
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2.5 py-1 text-muted-foreground">
            {readiness.checks.length - blocked.length - attention.length} satisfied
          </span>
        </div>
      </div>

      <ul className="space-y-3">
        {readiness.checks.map((check) => {
          const presentation = STATE_PRESENTATION[check.state]
          const { Icon } = presentation
          return (
            <li
              key={check.code}
              data-testid={`readiness-check-${check.code}`}
              data-state={check.state}
              className={`rounded-lg border p-4 ${presentation.tone}`}
            >
              <div className="flex items-start gap-3">
                <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">{check.label}</p>
                    {/* Status is never colour alone — the label travels with it. */}
                    <span className="text-xs font-semibold">{presentation.label}</span>
                  </div>
                  <CheckDetail detail={check.detail} />
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      {readiness.allowed_next_actions.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h4 className="text-sm font-semibold text-foreground">Allowed next actions</h4>
          <ul className="mt-2 space-y-1.5">
            {readiness.allowed_next_actions.map((action, index) => (
              <li
                key={String(action.type ?? index)}
                className="text-sm text-muted-foreground"
              >
                <span className="font-medium text-foreground">
                  {String(action.label ?? action.type ?? 'Action').replace(/_/g, ' ')}
                </span>
                {action.message ? <> — {String(action.message)}</> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
