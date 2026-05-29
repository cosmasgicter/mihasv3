import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, CircleCheckBig, MapPin, ShieldAlert } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingState } from '@/components/ui/LoadingState'
import { PageHeader } from '@/components/ui/PageHeader'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { SectionCard } from '@/components/ui/SectionCard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatRelativeTime, labelize, recommendationTone } from '@/lib/format'
import { listJobApplications } from '@/services/api/job-applications'
import { getJobDetail } from '@/services/api/jobs'

export function JobDetailPage() {
  const { jobId = '' } = useParams()
  const jobQuery = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => getJobDetail(jobId),
    enabled: Boolean(jobId),
  })
  const applicationsQuery = useQuery({
    queryKey: ['job-applications'],
    queryFn: listJobApplications,
  })

  const job = jobQuery.data
  const relatedApplication = applicationsQuery.data?.results.find((application) => application.jobId === jobId)

  if (jobQuery.isLoading && !job) {
    return (
      <div className="px-6 py-6">
        <LoadingState
          title="Loading job detail"
          message="Fetching the canonical role, fit explanation, and related application state."
        />
      </div>
    )
  }

  if (!job) {
    return (
      <div className="px-6 py-6">
        <EmptyState
          title="Job detail unavailable"
          message="When the detail endpoint is reachable, this page will show the canonical job record, fit explanation, and related pursuit state."
        />
      </div>
    )
  }

  return (
    <div className="min-h-full">
      <PageHeader
        eyebrow="Job detail"
        title={job.title}
        description={`${job.company} • ${job.location} • ${labelize(job.workMode)}.`}
        actions={
          <>
            <StatusBadge tone="success">{job.matchScore}% match</StatusBadge>
            <StatusBadge tone={recommendationTone(job.recommendation)}>
              {labelize(job.recommendation)}
            </StatusBadge>
          </>
        }
      />

      <div className="grid gap-5 px-6 py-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
        <div className="grid gap-5">
          <section className="rounded-[32px] border border-primary/15 bg-[linear-gradient(145deg,rgba(13,91,215,0.14),rgba(255,255,255,0.98)_42%,rgba(12,110,84,0.12))] p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <span className="eyebrow">Role brief</span>
                <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-ink">{job.title}</h2>
                <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted">
                  <span>{job.company}</span>
                  <span className="inline-flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    {job.location}
                  </span>
                  <span>{labelize(job.workMode)}</span>
                </div>
              </div>

              <a
                className="inline-flex min-h-[48px] items-center gap-2 rounded-2xl border border-line/70 bg-panel/85 px-4 py-3 text-sm font-medium text-ink transition hover:border-primary/35 hover:text-primary"
                href={job.applicationUrl}
                rel="noreferrer"
                target="_blank"
              >
                Open application URL
                <ArrowUpRight className="h-4 w-4" />
              </a>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-[24px] border border-panel/70 bg-panel/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Match score</p>
                <p className="mt-2 font-display text-3xl font-semibold text-ink">{job.matchScore}%</p>
                <div className="mt-3">
                  <ProgressBar tone="success" value={job.matchScore} />
                </div>
              </div>
              <div className="rounded-[24px] border border-panel/70 bg-panel/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Recommendation</p>
                <p className="mt-2 text-lg font-semibold text-ink">{labelize(job.recommendation)}</p>
                <p className="mt-2 text-sm text-muted">The system already exposes score, tailor, watch, and dismiss routes.</p>
              </div>
              <div className="rounded-[24px] border border-panel/70 bg-panel/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Sources</p>
                <p className="mt-2 text-lg font-semibold text-ink">{job.sourceNames.length}</p>
                <p className="mt-2 text-sm text-muted">Lineage stays visible so source quality is inspectable.</p>
              </div>
            </div>
          </section>

          <SectionCard title="Why this role fits" description="Fit explanations are presented as operator-legible evidence, not opaque scoring output.">
            <ul className="grid gap-3 text-sm text-muted">
              {job.fitReasons.map((reason) => (
                <li key={reason} className="rounded-[24px] border border-line/70 bg-panel/90 px-4 py-4">
                  <div className="flex items-start gap-3">
                    <CircleCheckBig className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    <span className="leading-6">{reason}</span>
                  </div>
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="Gaps to close before submission" description="Missing signals are framed as concrete resume or narrative improvements.">
            <ul className="grid gap-3 text-sm text-muted">
              {job.missingSignals.map((signal) => (
                <li key={signal} className="rounded-[24px] border border-line/70 bg-panel/90 px-4 py-4">
                  <div className="flex items-start gap-3">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    <span className="leading-6">{signal}</span>
                  </div>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>

        <div className="grid gap-5">
          <SectionCard title="Pursuit state" description="The role page links directly to the associated application record when it already exists.">
            {relatedApplication ? (
              <div className="rounded-[24px] border border-line/70 bg-canvas/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-ink">{relatedApplication.company}</p>
                  <StatusBadge tone="warning">{labelize(relatedApplication.status)}</StatusBadge>
                </div>
                <p className="mt-2 text-sm text-muted">
                  {labelize(relatedApplication.automationMode)} • {relatedApplication.evidenceCount} evidence artifacts
                </p>
                <p className="mt-2 text-sm text-muted">
                  Updated {formatRelativeTime(relatedApplication.updatedAt)}
                </p>
                <Link
                  className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-line/70 bg-panel px-4 py-2 text-sm font-medium text-ink transition hover:border-primary/35 hover:text-primary"
                  to="/job-applications"
                >
                  Open application queue
                </Link>
              </div>
            ) : (
              <div className="rounded-[24px] border border-dashed border-line bg-canvas/60 px-4 py-5 text-sm text-muted">
                No application record exists yet for this role.
              </div>
            )}
          </SectionCard>

          <SectionCard title="Source lineage">
            <div className="grid gap-3">
              {job.sourceNames.map((source) => (
                <div key={source} className="rounded-[24px] border border-line/70 bg-panel/85 px-4 py-4">
                  <p className="text-sm font-semibold text-ink">{source}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="API actions already live">
            <ul className="grid gap-2 text-xs text-muted">
              {[
                `/api/v1/jobs/${job.id}/score/`,
                `/api/v1/jobs/${job.id}/tailor-documents/`,
                `/api/v1/jobs/${job.id}/watch/`,
                `/api/v1/jobs/${job.id}/dismiss/`,
                '/api/v1/job-applications/',
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
