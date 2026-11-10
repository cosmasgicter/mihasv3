/**
 * `/student/status` with no application id — the canonical student workspace
 * route entered from navigation rather than from a row.
 *
 * Closes **GATE-13.3-09** (13.6 §8.1 item L5, blocking item **B7**), and with it
 * register finding **STU-23**, which task 10.6 was checked against.
 *
 * ## What was wrong
 *
 * Task 10.6 (R13.13) chose `/student/status` as *the* one canonical application
 * workspace and made `/student/application/:id` redirect to it. Three of the
 * route's four registered paths carry an `:id`
 * (`/application/:id`, `/student/application/:id/status`, and the redirect
 * target), and the fourth — the bare `/student/status`, which is what the nav
 * item and the `/student/application-status` redirect both point at — carries
 * none.
 *
 * The page read that id with `useParams` and handed it to
 * `useApplicationWorkspace(id, …)`, whose read is `enabled: !!id && enabled`. So
 * on the bare route the query never ran: `application` stayed `null`, `loading`
 * stayed `false` (a disabled query is pending but not fetching), and the page
 * fell straight through `if (error || !application)` into its **error** branch.
 * A student who owned two applications was told *"Application Not Found —
 * Application not found or access denied"*.
 *
 * It was never a data-fetch failure, a permission failure, or an empty-state
 * bug. It was a missing branch: the route had no answer for "no id supplied",
 * and an absent parameter was reported as an absent application.
 *
 * ## What it does now
 *
 * Reads the student's own applications — the same `applicationService.list({
 * mine: true })` the dashboard and `/student/payment` already use, under its own
 * cache key — and then:
 *
 * | owned | behaviour |
 * |---|---|
 * | 0 | a genuine empty state that offers the one thing there is to do: start an application |
 * | 1 | `replace`-navigate to that application's workspace, so there is still exactly one workspace URL per application (R13.13) |
 * | 2+ | **a chooser** — every application, its status, and a link to its own workspace |
 *
 * The chooser is deliberate rather than convenient. `.kiro/steering/enterprise-tenancy.md`
 * ("Student Draft Lifecycle") already settles the same question for the wizard:
 * *"Direct wizard visits with existing drafts must show a choice or follow a
 * documented deterministic contract; they must not silently pick an old draft by
 * timestamp."* Picking one of two applications by recency here would be that
 * same silent choice, on the surface whose whole job is telling a student where
 * each application stands.
 *
 * Nothing about the workspace itself changed: rendering is still
 * `ApplicationStatus`'s one implementation, reached with an id.
 */
import { useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, FilePlus2, Inbox } from 'lucide-react'

import { Seo } from '@/components/seo/Seo'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { PageShell } from '@/components/ui/PageShell'
import { SectionCard } from '@/components/ui/SectionCard'
import { Skeleton, SkeletonCard } from '@/components/ui'
import { StatusPill } from '@/components/ui/StatusPill'
import { useAuth } from '@/contexts/AuthContext'
import { usePortalBrand } from '@/hooks/usePortalBrand'
import { CACHE_CONFIG } from '@/hooks/queries/useQueryConfig'
import { formatDate } from '@/lib/utils'
import { brandedPageTitle } from '@/lib/tenantBrandCopy'
import {
  pathFor,
  studentApplicationNewPath,
  studentApplicationWorkspacePath,
} from '@/routes/routeRegistry'
import { applicationService, sortApplicationsByActivity } from '@/services/applications'
import type { Application } from '@/types/database'

/** One row of the chooser — only what identifies an application and where it stands. */
export interface WorkspaceChoice {
  id: string
  status: string
  program: string
  applicationNumber: string
  intake: string
  updatedAt: string | null
}

/**
 * The chooser's rows, in the order the rest of the product already uses.
 *
 * Exported so the ordering can be tested without a browser: `sortApplicationsByActivity`
 * is the canonical student ordering (`services/applications`), and a draft leads
 * a submitted application of the same recency because the draft is the one the
 * student still owes work on.
 */
export function toWorkspaceChoices(applications: Application[]): WorkspaceChoice[] {
  const drafts = sortApplicationsByActivity(applications.filter((app) => app.status === 'draft'))
  const rest = sortApplicationsByActivity(applications.filter((app) => app.status !== 'draft'))
  return [...drafts, ...rest].map((app) => ({
    id: String(app.id),
    status: String(app.status ?? ''),
    program: String(app.program ?? '') || 'Programme not recorded',
    applicationNumber: String(app.application_number ?? ''),
    intake: String(app.intake ?? ''),
    updatedAt: (app.updated_at ?? app.submitted_at ?? app.created_at ?? null) as string | null,
  }))
}

export function ApplicationWorkspaceIndex() {
  const { user } = useAuth()
  const { brandName } = usePortalBrand()
  const navigate = useNavigate()

  const {
    data: applications = [],
    isLoading,
    error,
    refetch,
  } = useQuery<Application[]>({
    // Its own key: this is the route's index read, not the dashboard's page-1 read
    // and not the workspace's single-application read.
    queryKey: ['student-status-index', user?.id],
    queryFn: async () => {
      const response = await applicationService.list({
        page: 1,
        pageSize: 50,
        sortBy: 'date',
        sortOrder: 'desc',
        mine: true,
      })
      return (response?.applications ?? []) as Application[]
    },
    enabled: !!user?.id,
    ...CACHE_CONFIG.applications,
  })

  const choices = useMemo(() => toWorkspaceChoices(applications), [applications])
  const onlyChoice = choices.length === 1 ? choices[0] : null

  /*
    Exactly one application: hand the student to its workspace rather than making
    them tap through a list of one. `replace` so Back returns to wherever they
    came from instead of bouncing between the index and the workspace.
  */
  useEffect(() => {
    if (!onlyChoice) return
    navigate(studentApplicationWorkspacePath(onlyChoice.id), { replace: true })
  }, [navigate, onlyChoice])

  const seo = (
    <Seo
      title={brandedPageTitle('Application status', brandName)}
      description="Track the status and progress of your admissions applications."
      path={pathFor('student.status')}
      siteName={brandName}
      noindex
    />
  )

  if (isLoading || onlyChoice) {
    return (
      <>
        {seo}
        <PageShell title="Application status" eyebrow="Application status" tone="student">
          <div className="space-y-6" role="status" aria-label="Loading your applications">
            <Skeleton className="h-8 w-40 rounded-full" />
            <SkeletonCard />
            <span className="sr-only">Loading your applications</span>
          </div>
        </PageShell>
      </>
    )
  }

  if (error) {
    return (
      <>
        {seo}
        <PageShell title="Application status" eyebrow="Application status" tone="student">
          <ErrorDisplay
            variant="section"
            title="We could not load your applications"
            message="Your applications are safe. Please try again in a moment."
            onRetry={() => void refetch()}
            className="max-w-2xl"
          />
        </PageShell>
      </>
    )
  }

  if (choices.length === 0) {
    return (
      <>
        {seo}
        <PageShell
          title="Application status"
          eyebrow="Application status"
          subtitle="You have not started an application yet."
          tone="student"
        >
          <SectionCard title="Your applications">
            <EmptyState
              icon={<Inbox />}
              headingLevel="h3"
              heading="No application to track yet"
              description="Once you start an application, its status and next action appear here."
            />
            <div className="flex justify-center pb-6">
              <Button asChild variant="primary" className="min-h-touch-lg px-6">
                <Link to={studentApplicationNewPath()} data-testid="status-index-start-application">
                  <FilePlus2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  Start an application
                </Link>
              </Button>
            </div>
          </SectionCard>
        </PageShell>
      </>
    )
  }

  return (
    <>
      {seo}
      <PageShell
        title="Application status"
        eyebrow="Application status"
        subtitle={`You have ${choices.length} applications. Choose the one you want to open.`}
        tone="student"
      >
        <SectionCard
          title="Your applications"
          description="Each one opens its own workspace. Status, next action, documents and history."
        >
          <ul className="divide-y divide-border" data-testid="status-index-choices">
            {choices.map((choice) => (
              <li key={choice.id} className="px-4 py-4 sm:px-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    {/*
                      Status is never colour alone — `StatusPill` is the canonical
                      renderer and always pairs the tone with an icon and the
                      label, at AA on its own wash (task 11.5).
                    */}
                    <StatusPill status={choice.status} />
                    <p className="mt-1 break-words text-base font-semibold text-foreground">
                      {choice.program}
                    </p>
                    <p className="mt-0.5 break-words text-xs text-muted-foreground">
                      {choice.applicationNumber ? `#${choice.applicationNumber}` : 'Not yet submitted'}
                      {choice.intake ? `: ${choice.intake}` : ''}
                      {choice.updatedAt ? `: last activity ${formatDate(choice.updatedAt)}` : ''}
                    </p>
                  </div>
                  <Button asChild variant="outline" className="min-h-touch w-full shrink-0 sm:w-auto">
                    <Link
                      to={studentApplicationWorkspacePath(choice.id)}
                      data-testid="status-index-choice-link"
                      aria-label={`Open ${choice.program}${
                        choice.applicationNumber ? ` (#${choice.applicationNumber})` : ''
                      }`}
                    >
                      Open
                      <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      </PageShell>
    </>
  )
}

export default ApplicationWorkspaceIndex
