/**
 * The student's next required action, first on the page (admissions-v2 task
 * 11.1).
 *
 * Requirements: R13.1 ("order each student's next required action before passive
 * metrics and derive it from backend allowed-next-action data"), R16.1, R16.4,
 * R16.5. Finding: STU-04.
 *
 * Everything rendered here is the platform's: the heading is the server's own
 * blocker sentence, the button is the server's own action label, and the
 * secondary list is the rest of the server's `allowed_next_actions` in the
 * server's order. This component chooses no words about the application's state.
 *
 * It replaces `NextActionCard`, which built the same region out of three booleans
 * derived in the browser — a draft exists, a payment looks unpaid, an interview is
 * scheduled — and so could tell a student to finish a draft the platform would
 * have refused, for a reason the dashboard never showed.
 */
import { Link } from 'react-router-dom'
import { AlertCircle, ArrowRight, CheckCircle2, Clock, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { formatApplicationStatus } from '@/types/applicationStatus'
import type { StudentNextAction } from '@/lib/studentNextAction'

export interface NextActionPanelProps {
  nextAction: StudentNextAction | null
  /** True while the subject draft's readiness is still being read. */
  isLoading?: boolean
  /** True when the platform declined to evaluate the subject draft. */
  readinessUnavailable?: boolean
  /** Number of applications the student has, drafts included. */
  applicationCount: number
  /** The dashboard's own reload, for the states where retrying is the action. */
  onRetry?: () => void
  /** Where a student with no application starts one. */
  startApplicationHref: string
  /**
   * The path of the page this panel is rendered on, when it has one.
   *
   * Task **11.3** puts this panel first on the application workspace as well as
   * on the dashboard, and some of the platform's own verbs route *to* the
   * workspace — `confirm-enrollment`, `resolve-conditions`, `view-status`. On the
   * dashboard those are navigations; on the workspace they are the page you are
   * already on, and task 10.6 already established the rule for that case in
   * `NextActionCards`: **a self-link is not an action**. So when the server's
   * action resolves to this same path the panel states it and leaves the control
   * to the section that owns the command, rather than offering a button that
   * reloads the screen.
   */
  selfHref?: string | null
}

export function NextActionPanel({
  nextAction,
  isLoading = false,
  readinessUnavailable = false,
  applicationCount,
  onRetry,
  startApplicationHref,
  selfHref = null,
}: NextActionPanelProps) {
  const leadsElsewhere = Boolean(
    nextAction?.href && (!selfHref || nextAction.href !== selfHref),
  )
  const heading = resolveHeading({ nextAction, isLoading, readinessUnavailable, applicationCount })

  return (
    <section
      aria-labelledby="student-next-action-heading"
      data-testid="student-next-action"
      className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6"
    >
      {/*
        `flex-wrap` and `break-words` are the R16.8 reflow fix, found by running
        this panel at 200% text zoom in the harness: with rem-based padding, a
        320 px viewport at 32 px root font leaves the eyebrow row about two words
        of space, and an unwrapped row is *clipped* by the page shell's
        `overflow-x-hidden` rather than reflowed. Clipped text is the failure R16.8
        names; wrapped text is not.
      */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <p className="break-words text-base sm:text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Next action
        </p>
        {nextAction && (
          <span data-text-role="caption"
            data-testid="next-action-application"
            className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-sm sm:text-xs font-semibold text-muted-foreground"
          >
            <StateIcon status={nextAction.applicationStatus} />
            <span className="break-words">{formatApplicationStatus(nextAction.applicationStatus)}</span>
          </span>
        )}
      </div>

      <h2
        id="student-next-action-heading"
        className="mt-2 break-words text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
      >
        {heading.title}
      </h2>

      {/*
        The platform's own sentence for the blocker this action clears. R16.8: the
        student's next action has to remain understandable under 400% zoom, so it
        is prose at the body size rather than a badge whose meaning is its colour.
      */}
      {heading.detail && (
        <p
          data-testid="next-action-detail"
          className="mt-2 max-w-2xl break-words text-base sm:text-sm leading-6 text-muted-foreground"
        >
          {heading.detail}
        </p>
      )}

      {/*
        Announced politely so a polling refresh that changes the next action tells
        an assistive-technology user, which is what the removed metrics grid's
        live region used to do for counts nobody had to act on.
      */}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {heading.announcement}
      </p>

      {/*
        The action row reserves its own height while the answer is in flight
        (GATE-13.3-07, 13.6 §8.1 item L6; R16.7).

        Task 13.3 measured the dashboard's first paint at **CLS 0.1164 @ 375** and
        **0.1050 @ 390** against Core Web Vitals' 0.100 budget — one shift each, at
        t ~ 600 ms, reproducible across four runs (0.1172 / 0.1188 / 0.1164 /
        0.1164). This panel is the cause and the arithmetic says so: while
        `isLoading` it rendered an eyebrow and a heading and *nothing else*, and
        when readiness landed it grew by a two-line blocker sentence plus a 68 px
        primary control — ~90 px appearing at the very top of the page and pushing
        every section below it down. A distance fraction of 90/667 against an
        impact fraction near 0.85 is 0.11, which is the number.

        So the loading state now occupies the resolved state's box: `resolveHeading`
        gives it a real sentence (below), and this row holds a `min-h-touch-lg`
        placeholder — the same floor `size="lg"` uses — instead of collapsing to
        zero. The swap is then a repaint rather than a reflow.

        It is `aria-hidden` and carries no text: the panel already announces
        *"Checking what is outstanding on your application"* through its own
        `role="status"` live region, and a second silent box must not be announced
        as content.
      */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        {isLoading && !nextAction ? (
          <div
            aria-hidden="true"
            data-testid="next-action-reserved-space"
            className="min-h-touch-lg w-full max-w-xs animate-pulse rounded-lg bg-muted sm:w-64 motion-reduce:animate-none"
          />
        ) : nextAction?.href && !leadsElsewhere ? (
          // The action is on this page (task 11.3). Say where, and let the section
          // that owns the command own it — one action, one control.
          <p data-testid="next-action-on-this-page" className="text-base sm:text-sm text-muted-foreground">
            The control for this is on this page, below.
          </p>
        ) : nextAction?.href ? (
          <Button
            asChild
            variant="primary"
            size="lg"
            className="min-h-touch-lg px-6 text-base font-semibold shadow-sm"
          >
            <Link to={nextAction.href} data-testid="next-action-primary">
              {nextAction.label}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        ) : nextAction ? (
          // The platform published an action with nowhere to go — `retry` on an
          // unevaluable configuration. The label is still the server's; the
          // control is the page's own reload rather than a link back to the same
          // refusal.
          <Button
            variant="primary"
            size="lg"
            onClick={onRetry}
            disabled={!onRetry}
            className="min-h-touch-lg px-6 text-base font-semibold shadow-sm"
            data-testid="next-action-primary"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {nextAction.label}
          </Button>
        ) : applicationCount === 0 ? (
          <Button
            asChild
            variant="primary"
            size="lg"
            className="min-h-touch-lg px-6 text-base font-semibold shadow-sm"
          >
            <Link to={startApplicationHref} data-testid="next-action-primary">
              Start an application
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        ) : null}
      </div>

      {/*
        The rest of what the platform offered. A blocked student always has at
        least one action (6.5's rule), and often more than one; hiding the others
        would make the panel look like a single mandatory step when the student
        has a genuine choice — changing intake instead of joining a waitlist, for
        instance.
      */}
      {nextAction && nextAction.otherActions.length > 0 && (
        <ul data-testid="next-action-alternatives" className="mt-4 space-y-1.5">
          {nextAction.otherActions.map((action) => (
            <li key={action.action}>
              {action.href ? (
                <Link
                  to={action.href}
                  className="inline-flex min-h-touch items-center gap-2 rounded-md text-base sm:text-sm font-medium text-primary hover:text-link-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <Clock className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                  {action.label}
                </Link>
              ) : (
                <span className="inline-flex min-h-touch items-center gap-2 text-base sm:text-sm text-muted-foreground">
                  <Clock className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                  {action.label}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

interface HeadingInput {
  nextAction: StudentNextAction | null
  isLoading: boolean
  readinessUnavailable: boolean
  applicationCount: number
}

/**
 * The five honest states of this panel, in the order they are checked.
 *
 * The distinction that matters is the third against the fifth: "we could not
 * ask" is not "there is nothing to do". Collapsing them is the class of defect
 * STU-15 named on the enrollment card and STU-04 names here.
 */
function resolveHeading({
  nextAction,
  isLoading,
  readinessUnavailable,
  applicationCount,
}: HeadingInput): { title: string; detail: string | null; announcement: string } {
  if (nextAction) {
    return {
      title: nextAction.label,
      detail: nextAction.blockerMessage,
      announcement: `Next action: ${nextAction.label}`,
    }
  }
  if (isLoading) {
    return {
      title: 'Checking what is outstanding',
      /*
        A real sentence, not `null` (GATE-13.3-07, 13.6 §8.1 item L6).

        The resolved state always renders a blocker sentence here; leaving this
        `null` meant the paragraph appeared *after* readiness landed and moved the
        whole page down with it. It is also the more honest state to describe — a
        student watching this panel deserves to know their work is safe while it
        resolves, which is the same reassurance the `readinessUnavailable` state
        gives.
      */
      detail: 'Your saved work is safe while we check what is still outstanding.',
      announcement: 'Checking what is outstanding on your application',
    }
  }
  if (readinessUnavailable) {
    return {
      title: 'We could not check your application just now',
      detail:
        'Your saved work is safe. Refresh in a moment, or open the draft to keep going while we retry.',
      announcement: 'Your application could not be checked just now',
    }
  }
  if (applicationCount === 0) {
    return {
      title: 'Start an application',
      detail: 'Choose a programme and intake to begin. Your progress saves as you go.',
      announcement: 'Next action: start an application',
    }
  }
  return {
    title: 'Nothing needs you right now',
    detail: 'Your applications are with admissions. We will email you when something changes.',
    announcement: 'Nothing needs you right now',
  }
}

/** Status is never colour alone: every state carries an icon and its label. */
function StateIcon({ status }: { status: string }) {
  if (status === 'draft') return <Clock className="h-3 w-3" aria-hidden="true" />
  if (status === 'approved' || status === 'enrolled')
    return <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
  if (status === 'rejected' || status === 'withdrawn' || status === 'expired')
    return <AlertCircle className="h-3 w-3" aria-hidden="true" />
  return <Clock className="h-3 w-3" aria-hidden="true" />
}
