import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  ArrowRight,
  BriefcaseBusiness,
  Radar,
  Send,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { MetricCard } from '@/components/ui/MetricCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { PageSkeleton } from '@/components/ui/PageSkeleton'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { SectionCard } from '@/components/ui/SectionCard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatPercentage, labelize } from '@/lib/format'
import {
  getDailyDigest,
  getFunnelAnalytics,
  getOutreachAnalytics,
  listSourceAnalytics,
} from '@/services/api/analytics'
import { listAutomationRuns } from '@/services/api/automation'
import { listJobApplications } from '@/services/api/job-applications'
import { listJobs } from '@/services/api/jobs'
import { listOutreachCampaigns } from '@/services/api/outreach'

function recommendationTone(recommendation: string) {
  if (recommendation === 'apply_now') return 'success' as const
  if (recommendation === 'review') return 'warning' as const
  if (recommendation === 'watch') return 'insight' as const
  return 'danger' as const
}

export function OverviewPage() {
  const jobsQuery = useQuery({ queryKey: ['jobs'], queryFn: listJobs })
  const applicationsQuery = useQuery({
    queryKey: ['job-applications'],
    queryFn: listJobApplications,
  })
  const automationRunsQuery = useQuery({
    queryKey: ['automation-runs'],
    queryFn: listAutomationRuns,
  })
  const sourceAnalyticsQuery = useQuery({
    queryKey: ['source-analytics'],
    queryFn: listSourceAnalytics,
  })
  const funnelQuery = useQuery({
    queryKey: ['funnel-analytics'],
    queryFn: getFunnelAnalytics,
  })
  const outreachAnalyticsQuery = useQuery({
    queryKey: ['outreach-analytics'],
    queryFn: getOutreachAnalytics,
  })
  const outreachCampaignsQuery = useQuery({
    queryKey: ['outreach-campaigns'],
    queryFn: listOutreachCampaigns,
  })
  const dailyDigestQuery = useQuery({
    queryKey: ['daily-digest'],
    queryFn: getDailyDigest,
  })

  const jobs = jobsQuery.data?.results ?? []
  const applications = applicationsQuery.data?.results ?? []
  const runs = automationRunsQuery.data?.results ?? []
  const sourceAnalytics = sourceAnalyticsQuery.data ?? []
  const campaigns = outreachCampaignsQuery.data?.results ?? []
  const funnel = funnelQuery.data
  const outreach = outreachAnalyticsQuery.data
  const digest = dailyDigestQuery.data

  const topJobs = [...jobs].sort((left, right) => right.matchScore - left.matchScore).slice(0, 3)
  const blockedRuns = runs.filter((run) => run.status === 'blocked')
  const approvalQueue = applications.filter((application) => application.status === 'awaiting_approval')
  const bestSource = [...sourceAnalytics].sort((left, right) => right.successRate - left.successRate)[0]

  const isLoading = jobsQuery.isLoading || applicationsQuery.isLoading || automationRunsQuery.isLoading || sourceAnalyticsQuery.isLoading || funnelQuery.isLoading || outreachAnalyticsQuery.isLoading || outreachCampaignsQuery.isLoading || dailyDigestQuery.isLoading
  const errorQuery = jobsQuery.isError ? jobsQuery : applicationsQuery.isError ? applicationsQuery : automationRunsQuery.isError ? automationRunsQuery : sourceAnalyticsQuery.isError ? sourceAnalyticsQuery : funnelQuery.isError ? funnelQuery : outreachAnalyticsQuery.isError ? outreachAnalyticsQuery : outreachCampaignsQuery.isError ? outreachCampaignsQuery : dailyDigestQuery.isError ? dailyDigestQuery : null

  if (isLoading) return <PageSkeleton />
  if (errorQuery) return <ErrorDisplay message={errorQuery.error?.message ?? 'Failed to load data'} onRetry={() => errorQuery.refetch()} />

  return (
    <div className="min-h-full">
      <PageHeader
        eyebrow="Operator overview"
        title="Daily command center"
        description="A high-density operating view for what matters right now: best-fit jobs, approval pressure, automation health, and the current outreach/reporting pulse."
        actions={
          <>
            <StatusBadge tone="success">{jobs.length} live opportunities</StatusBadge>
            <StatusBadge tone="warning">{approvalQueue.length} approvals pending</StatusBadge>
            <StatusBadge tone={blockedRuns.length > 0 ? 'danger' : 'insight'}>
              {blockedRuns.length} blocked runs
            </StatusBadge>
          </>
        }
      />

      <div className="grid gap-5 px-6 py-6">
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
          <div className="rounded-[32px] border border-primary/15 bg-[linear-gradient(145deg,rgba(13,91,215,0.15),rgba(255,255,255,0.97)_45%,rgba(12,110,84,0.14))] p-6 shadow-sm">
            <span className="eyebrow">Today&apos;s brief</span>
            <h2 className="mt-4 max-w-2xl font-display text-4xl font-semibold tracking-tight text-ink">
              {digest?.headline ?? 'High-value opportunities are ready for triage'}
            </h2>
            <p className="mt-4 max-w-3xl text-base leading-7 text-muted">
              {digest?.summary ??
                'The dashboard is seeded with production-shaped data so another AI can continue implementation without rethinking the operating model.'}
            </p>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <div className="rounded-[24px] border border-white/70 bg-white/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Best source</p>
                <p className="mt-2 font-display text-2xl font-semibold text-ink">
                  {bestSource?.source ?? 'n/a'}
                </p>
                <p className="mt-2 text-sm text-muted">
                  {bestSource ? formatPercentage(bestSource.successRate, 'ratio') : '0%'} extraction success
                </p>
              </div>
              <div className="rounded-[24px] border border-white/70 bg-white/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Applications</p>
                <p className="mt-2 font-display text-2xl font-semibold text-ink">
                  {funnel?.applied ?? applications.length}
                </p>
                <p className="mt-2 text-sm text-muted">Submission flow is already represented end to end.</p>
              </div>
              <div className="rounded-[24px] border border-white/70 bg-white/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Positive replies</p>
                <p className="mt-2 font-display text-2xl font-semibold text-ink">
                  {outreach?.positiveReplies ?? 0}
                </p>
                <p className="mt-2 text-sm text-muted">Outreach outcomes are visible beside job pursuit work.</p>
              </div>
            </div>
          </div>

          <SectionCard title="Operating cadence" description="The front-end now reads like a working command center rather than a handoff placeholder.">
            <div className="grid gap-4">
              <div className="rounded-[24px] border border-line/70 bg-canvas/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-ink">Discovery to review</p>
                  <p className="text-sm text-muted">
                    {funnel?.reviewed ?? 0}/{funnel?.discovered ?? 0}
                  </p>
                </div>
                <div className="mt-3">
                  <ProgressBar
                    tone="primary"
                    value={funnel?.reviewed ?? 0}
                    max={Math.max(funnel?.discovered ?? 1, 1)}
                  />
                </div>
              </div>
              <div className="rounded-[24px] border border-line/70 bg-canvas/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-ink">Review to application</p>
                  <p className="text-sm text-muted">
                    {funnel?.applied ?? 0}/{funnel?.reviewed ?? 0}
                  </p>
                </div>
                <div className="mt-3">
                  <ProgressBar
                    tone="success"
                    value={funnel?.applied ?? 0}
                    max={Math.max(funnel?.reviewed ?? 1, 1)}
                  />
                </div>
              </div>
              <div className="rounded-[24px] border border-line/70 bg-canvas/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-ink">Application to interview</p>
                  <p className="text-sm text-muted">
                    {funnel?.interviews ?? 0}/{funnel?.applied ?? 0}
                  </p>
                </div>
                <div className="mt-3">
                  <ProgressBar
                    tone="insight"
                    value={funnel?.interviews ?? 0}
                    max={Math.max(funnel?.applied ?? 1, 1)}
                  />
                </div>
              </div>
            </div>
          </SectionCard>
        </section>

        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
          <MetricCard
            hint="Discovered opportunities ready for triage."
            icon={<BriefcaseBusiness className="h-5 w-5" />}
            label="Discovered"
            value={String(funnel?.discovered ?? jobs.length)}
          />
          <MetricCard
            hint="Applications already in the pursuit pipeline."
            icon={<Activity className="h-5 w-5" />}
            label="Applications"
            value={String(applications.length)}
          />
          <MetricCard
            hint="Active campaigns tracked beside job activity."
            icon={<Send className="h-5 w-5" />}
            label="Campaigns"
            value={String(campaigns.length)}
          />
          <MetricCard
            hint="Discovery adapters and feeds currently measured."
            icon={<Radar className="h-5 w-5" />}
            label="Sources"
            value={String(sourceAnalytics.length)}
          />
        </div>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)]">
          <SectionCard
            title="Top opportunities"
            description="High-match roles stay immediately actionable from the overview instead of getting buried in a generic table."
          >
            <div className="grid gap-3">
              {topJobs.map((job) => (
                <Link
                  key={job.id}
                  className="rounded-[26px] border border-line/70 bg-white/90 p-4 transition hover:border-primary/35 hover:bg-primary/5"
                  to={`/jobs/${job.id}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-xl font-semibold tracking-tight text-ink">{job.title}</p>
                      <p className="mt-1 text-sm text-muted">
                        {job.company} • {job.location}
                      </p>
                    </div>
                    <StatusBadge tone={recommendationTone(job.recommendation)}>
                      {labelize(job.recommendation)}
                    </StatusBadge>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_150px] md:items-center">
                    <div>
                      <div className="flex items-center justify-between gap-3 text-sm text-muted">
                        <span>Match score</span>
                        <span>{job.matchScore}%</span>
                      </div>
                      <div className="mt-2">
                        <ProgressBar tone="success" value={job.matchScore} />
                      </div>
                    </div>
                    <div className="inline-flex items-center justify-between rounded-2xl border border-line/70 bg-canvas/60 px-3 py-3 text-sm font-medium text-ink">
                      Open role
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </SectionCard>

          <div className="grid gap-5">
            <SectionCard title="Attention queue" description="Anything risky or blocked stays visible with a concrete next action.">
              <div className="grid gap-3">
                {approvalQueue.map((application) => (
                  <div key={application.id} className="rounded-[24px] border border-line/70 bg-white/85 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-ink">{application.title}</p>
                      <StatusBadge tone="warning">{labelize(application.status)}</StatusBadge>
                    </div>
                    <p className="mt-2 text-sm text-muted">
                      {application.company} • {labelize(application.automationMode)}
                    </p>
                  </div>
                ))}
                {blockedRuns.map((run) => (
                  <div key={run.id} className="rounded-[24px] border border-line/70 bg-white/85 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-ink">{labelize(run.runType)}</p>
                      <StatusBadge tone="danger">{labelize(run.status)}</StatusBadge>
                    </div>
                    <p className="mt-2 text-sm text-muted">{run.blockedReason || run.summary}</p>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Source health snapshot">
              <div className="grid gap-3">
                {sourceAnalytics.map((source) => (
                  <div key={source.source} className="rounded-[24px] border border-line/70 bg-canvas/60 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-ink">{source.source}</p>
                      <p className="text-sm text-muted">{source.freshnessHours}h old</p>
                    </div>
                    <div className="mt-3">
                      <ProgressBar tone="insight" value={source.successRate * 100} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <StatusBadge tone="insight">{formatPercentage(source.successRate, 'ratio')} success</StatusBadge>
                      <StatusBadge tone="warning">{formatPercentage(source.duplicateRatio, 'ratio')} dupes</StatusBadge>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        </section>
      </div>
    </div>
  )
}
