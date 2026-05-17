import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Building2, MapPin, Sparkles } from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { PageHeader } from '@/components/ui/PageHeader'
import { PageSkeleton } from '@/components/ui/PageSkeleton'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { SectionCard } from '@/components/ui/SectionCard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { labelize } from '@/lib/format'
import type { Recommendation } from '@/services/api/contracts'
import { listJobs } from '@/services/api/jobs'

function recommendationTone(recommendation: string) {
  if (recommendation === 'apply_now') return 'success' as const
  if (recommendation === 'review') return 'warning' as const
  if (recommendation === 'watch') return 'insight' as const
  return 'danger' as const
}

export function JobsInboxPage() {
  const [searchValue, setSearchValue] = useState('')
  const [activeRecommendation, setActiveRecommendation] = useState<'all' | Recommendation>('all')
  const deferredSearchValue = useDeferredValue(searchValue)
  const jobsQuery = useQuery({
    queryKey: ['jobs'],
    queryFn: listJobs,
  })

  const jobs = jobsQuery.data?.results ?? []
  const filteredJobs = useMemo(() => {
    const query = deferredSearchValue.trim().toLowerCase()

    return jobs
      .filter((job) => (activeRecommendation === 'all' ? true : job.recommendation === activeRecommendation))
      .filter((job) => {
        if (!query) {
          return true
        }
        const searchable = `${job.title} ${job.company} ${job.location} ${job.workMode}`.toLowerCase()
        return searchable.includes(query)
      })
      .sort((left, right) => right.matchScore - left.matchScore)
  }, [activeRecommendation, deferredSearchValue, jobs])

  const recommendationCounts = jobs.reduce<Record<string, number>>((accumulator, job) => {
    accumulator[job.recommendation] = (accumulator[job.recommendation] ?? 0) + 1
    return accumulator
  }, {})

  if (jobsQuery.isLoading) {
    return <PageSkeleton />
  }

  if (jobsQuery.isError) {
    return <ErrorDisplay message={jobsQuery.error?.message ?? 'Failed to load data'} onRetry={() => jobsQuery.refetch()} />
  }

  if (jobs.length === 0) {
    return (
      <div className="px-6 py-6">
        <EmptyState
          title="No jobs returned yet"
          message="Once discovery adapters are wired, this page will render canonical opportunities scored against the candidate profile."
        />
      </div>
    )
  }

  return (
    <div className="min-h-full">
      <PageHeader
        eyebrow="Jobs inbox"
        title="Opportunity triage queue"
        description="The inbox is now structured like an actual operator workflow: fast fit assessment, clear recommendation states, and direct navigation into decision-ready detail pages."
        actions={
          <>
            <StatusBadge tone="success">{recommendationCounts.apply_now ?? 0} apply now</StatusBadge>
            <StatusBadge tone="warning">{recommendationCounts.review ?? 0} review</StatusBadge>
            <StatusBadge tone="insight">{recommendationCounts.watch ?? 0} watch</StatusBadge>
          </>
        }
      />

      <div className="grid gap-5 px-6 py-6 xl:grid-cols-[minmax(0,1.3fr)_320px]">
        <div className="grid gap-5">
          <SectionCard
            title="Queue overview"
            description="High-value opportunities are shown as cards with enough detail to decide whether to open the full role page."
          >
            <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                <label className="rounded-[24px] border border-line/70 bg-panel/80 px-4 py-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Search jobs</span>
                  <input
                    className="mt-2 w-full border-0 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
                    onChange={(event) => setSearchValue(event.target.value)}
                    placeholder="Title, company, location, or mode"
                    value={searchValue}
                  />
                </label>
                <div className="rounded-[24px] border border-line/70 bg-panel/80 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Visible jobs</p>
                  <p className="mt-2 font-display text-3xl font-semibold text-ink">{filteredJobs.length}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  ['all', jobs.length, 'primary'],
                  ['apply_now', recommendationCounts.apply_now ?? 0, 'success'],
                  ['review', recommendationCounts.review ?? 0, 'warning'],
                  ['watch', recommendationCounts.watch ?? 0, 'insight'],
                ].map(([recommendation, count, tone]) => (
                  <button
                    key={String(recommendation)}
                    className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                      activeRecommendation === recommendation
                        ? 'border-primary/40 bg-primary/8 text-primary'
                        : 'border-line/70 bg-panel/80 text-ink hover:border-primary/25'
                    }`}
                    onClick={() => setActiveRecommendation(recommendation as 'all' | Recommendation)}
                    type="button"
                  >
                    {labelize(String(recommendation))}
                    <StatusBadge tone={tone as 'primary' | 'success' | 'warning' | 'insight'}>{count}</StatusBadge>
                  </button>
                ))}
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-[24px] border border-line/70 bg-canvas/60 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Total jobs</p>
                  <p className="mt-2 font-display text-3xl font-semibold text-ink">{jobs.length}</p>
              </div>
              <div className="rounded-[24px] border border-line/70 bg-canvas/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Average fit</p>
                <p className="mt-2 font-display text-3xl font-semibold text-ink">
                  {Math.round(jobs.reduce((sum, job) => sum + job.matchScore, 0) / jobs.length)}%
                </p>
              </div>
                <div className="rounded-[24px] border border-line/70 bg-canvas/60 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Remote or hybrid</p>
                  <p className="mt-2 font-display text-3xl font-semibold text-ink">
                    {jobs.filter((job) => job.workMode !== 'on_site').length}
                  </p>
                </div>
              </div>
            </div>
          </SectionCard>

          <div className="grid gap-4">
            {filteredJobs.length === 0 ? (
              <EmptyState
                title="No jobs match this filter"
                message="Try a broader search term or switch back to all recommendations."
              />
            ) : null}

            {filteredJobs.map((job) => (
                <Link
                  key={job.id}
                  className="rounded-[30px] border border-line/70 bg-panel/90 p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/35 hover:bg-primary/5"
                  to={`/jobs/${job.id}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="max-w-3xl">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone={recommendationTone(job.recommendation)}>
                          {labelize(job.recommendation)}
                        </StatusBadge>
                        <StatusBadge tone="neutral">{labelize(job.workMode)}</StatusBadge>
                      </div>
                      <h2 className="mt-4 font-display text-2xl font-semibold tracking-tight text-ink">
                        {job.title}
                      </h2>
                      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted">
                        <span className="inline-flex items-center gap-2">
                          <Building2 className="h-4 w-4" />
                          {job.company}
                        </span>
                        <span className="inline-flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          {job.location}
                        </span>
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-line/70 bg-canvas/60 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Match score</p>
                      <p className="mt-2 font-display text-3xl font-semibold text-ink">{job.matchScore}%</p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_200px] xl:items-center">
                    <div>
                      <div className="flex items-center justify-between gap-3 text-sm text-muted">
                        <span>Fit confidence</span>
                        <span>{job.matchScore}%</span>
                      </div>
                      <div className="mt-2">
                        <ProgressBar
                          tone={job.matchScore >= 85 ? 'success' : job.matchScore >= 75 ? 'warning' : 'insight'}
                          value={job.matchScore}
                        />
                      </div>
                    </div>

                    <div className="inline-flex min-h-[52px] items-center justify-between rounded-2xl border border-line/70 bg-panel/80 px-4 py-3 text-sm font-medium text-ink">
                      Open job detail
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  </div>
                </Link>
              ))}
          </div>
        </div>

        <div className="grid gap-5">
          <SectionCard title="Decision framing">
            <div className="grid gap-3 text-sm leading-6 text-muted">
              <div className="rounded-[24px] border border-line/70 bg-panel/80 p-4">
                <div className="flex items-center gap-2 text-ink">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="font-semibold">Apply now</span>
                </div>
                <p className="mt-2">High-fit roles where the score and profile alignment justify immediate pursuit.</p>
              </div>
              <div className="rounded-[24px] border border-line/70 bg-panel/80 p-4">
                <p className="font-semibold text-ink">Review</p>
                <p className="mt-2">Promising roles that need a better variant, stronger evidence, or manual judgment.</p>
              </div>
              <div className="rounded-[24px] border border-line/70 bg-panel/80 p-4">
                <p className="font-semibold text-ink">Watch</p>
                <p className="mt-2">Strategic roles worth monitoring when location, compensation, or timing shifts.</p>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Recommendation mix">
            <div className="grid gap-3">
              {[
                ['apply_now', recommendationCounts.apply_now ?? 0, 'success'],
                ['review', recommendationCounts.review ?? 0, 'warning'],
                ['watch', recommendationCounts.watch ?? 0, 'insight'],
                ['ignore', recommendationCounts.ignore ?? 0, 'danger'],
              ].map(([key, count, tone]) => (
                <div key={String(key)} className="rounded-[24px] border border-line/70 bg-canvas/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-ink">{labelize(String(key))}</p>
                    <StatusBadge tone={tone as 'success' | 'warning' | 'insight' | 'danger'}>
                      {count}
                    </StatusBadge>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
