import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { PageHeader } from '@/components/ui/PageHeader'
import { PageSkeleton } from '@/components/ui/PageSkeleton'
import { SectionCard } from '@/components/ui/SectionCard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatRelativeTime, labelize } from '@/lib/format'
import { listAutomationRuns } from '@/services/api/automation'
import { listJobApplications } from '@/services/api/job-applications'

function statusTone(status: string) {
  if (status === 'submitted') return 'success' as const
  if (status === 'awaiting_approval') return 'warning' as const
  if (status === 'watch_only') return 'insight' as const
  return 'danger' as const
}

export function JobApplicationsPage() {
  const applicationsQuery = useQuery({
    queryKey: ['job-applications'],
    queryFn: listJobApplications,
  })
  const automationRunsQuery = useQuery({
    queryKey: ['automation-runs'],
    queryFn: listAutomationRuns,
  })

  const isLoading = applicationsQuery.isLoading || automationRunsQuery.isLoading
  const errorQuery = applicationsQuery.isError ? applicationsQuery : automationRunsQuery.isError ? automationRunsQuery : null

  if (isLoading) return <PageSkeleton />
  if (errorQuery) return <ErrorDisplay message={errorQuery.error?.message ?? 'Failed to load data'} onRetry={() => errorQuery.refetch()} />

  const applications = applicationsQuery.data?.results ?? []
  const runs = automationRunsQuery.data?.results ?? []

  const columns = [
    {
      title: 'Needs approval',
      status: 'awaiting_approval',
      tone: 'warning' as const,
    },
    {
      title: 'Submitted',
      status: 'submitted',
      tone: 'success' as const,
    },
    {
      title: 'Watch only',
      status: 'watch_only',
      tone: 'insight' as const,
    },
  ]

  const blockedRuns = runs.filter((run) => run.status === 'blocked')

  return (
    <div className="min-h-full">
      <PageHeader
        eyebrow="Job applications"
        title="Application pursuit board"
        description="The application surface is now a real pursuit board: status lanes, evidence counts, automation context, and direct continuity back into role review."
        actions={
          <>
            <StatusBadge tone="warning">
              {applications.filter((item) => item.status === 'awaiting_approval').length} approvals
            </StatusBadge>
            <StatusBadge tone="danger">{blockedRuns.length} blocked runs</StatusBadge>
          </>
        }
      />

      <div className="grid gap-5 px-6 py-6 xl:grid-cols-[minmax(0,1.35fr)_320px]">
        <SectionCard
          title="Pursuit lanes"
          description="Applications are grouped by operational state so approvals, active submissions, and watch-only opportunities stay clearly separated."
        >
          <div className="grid gap-4 xl:grid-cols-3">
            {columns.map((column) => {
              const items = applications.filter((application) => application.status === column.status)

              return (
                <div key={column.status} className="rounded-[28px] border border-line/70 bg-canvas/55 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-display text-xl font-semibold tracking-tight text-ink">{column.title}</h2>
                    <StatusBadge tone={column.tone}>{items.length}</StatusBadge>
                  </div>

                  <div className="mt-4 grid gap-3">
                    {items.map((application) => (
                      <div key={application.id} className="rounded-[24px] border border-line/70 bg-white/90 p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-ink">{application.title}</p>
                            <p className="mt-1 text-sm text-muted">{application.company}</p>
                          </div>
                          <StatusBadge tone={statusTone(application.status)}>
                            {labelize(application.status)}
                          </StatusBadge>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <StatusBadge tone="neutral">{labelize(application.automationMode)}</StatusBadge>
                          <StatusBadge tone="insight">{application.evidenceCount} evidence</StatusBadge>
                        </div>
                        <p className="mt-3 text-sm text-muted">
                          Updated {formatRelativeTime(application.updatedAt)}
                        </p>
                        <Link
                          className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-line/70 bg-canvas/55 px-4 py-2 text-sm font-medium text-ink transition hover:border-primary/35 hover:text-primary"
                          to={`/jobs/${application.jobId}`}
                        >
                          Open source job
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </SectionCard>

        <div className="grid gap-5">
          <SectionCard title="Automation blockers">
            <div className="grid gap-3">
              {blockedRuns.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-line bg-canvas/60 px-4 py-5 text-sm text-muted">
                  No automation blockers right now.
                </div>
              ) : (
                blockedRuns.map((run) => (
                  <div key={run.id} className="rounded-[24px] border border-line/70 bg-white/90 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-ink">{labelize(run.runType)}</p>
                      <StatusBadge tone="danger">{labelize(run.status)}</StatusBadge>
                    </div>
                    <p className="mt-2 text-sm text-muted">{run.blockedReason}</p>
                  </div>
                ))
              )}
            </div>
          </SectionCard>

          <SectionCard title="Endpoint inventory">
            <ul className="grid gap-2 text-xs text-muted">
              {[
                '/api/v1/job-applications/',
                '/api/v1/job-applications/{id}/submit/',
                '/api/v1/job-applications/{id}/pause/',
                '/api/v1/job-applications/{id}/resume/',
                '/api/v1/job-applications/{id}/approve/',
                '/api/v1/job-applications/{id}/reject/',
              ].map((route) => (
                <li key={route} className="rounded-[20px] border border-line/70 bg-canvas/60 px-3 py-3 font-mono text-ink">
                  {route}
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
