import { useQuery } from '@tanstack/react-query'

import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { PageHeader } from '@/components/ui/PageHeader'
import { PageSkeleton } from '@/components/ui/PageSkeleton'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { SectionCard } from '@/components/ui/SectionCard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatDateTime, formatPercentage } from '@/lib/format'
import {
  getDailyDigest,
  getFunnelAnalytics,
  getOutreachAnalytics,
  listSourceAnalytics,
} from '@/services/api/analytics'

export function ReportsPage() {
  const funnelQuery = useQuery({
    queryKey: ['funnel-analytics'],
    queryFn: getFunnelAnalytics,
  })
  const outreachQuery = useQuery({
    queryKey: ['outreach-analytics'],
    queryFn: getOutreachAnalytics,
  })
  const digestQuery = useQuery({
    queryKey: ['daily-digest'],
    queryFn: getDailyDigest,
  })
  const sourceQuery = useQuery({
    queryKey: ['source-analytics'],
    queryFn: listSourceAnalytics,
  })

  const isLoading = funnelQuery.isLoading || outreachQuery.isLoading || digestQuery.isLoading || sourceQuery.isLoading
  const errorQuery = funnelQuery.isError ? funnelQuery : outreachQuery.isError ? outreachQuery : digestQuery.isError ? digestQuery : sourceQuery.isError ? sourceQuery : null

  if (isLoading) return <PageSkeleton />
  if (errorQuery) return <ErrorDisplay message={errorQuery.error?.message ?? 'Failed to load data'} onRetry={() => errorQuery.refetch()} />

  const funnel = funnelQuery.data
  const outreach = outreachQuery.data
  const digest = digestQuery.data
  const sources = sourceQuery.data ?? []

  return (
    <div className="min-h-full">
      <PageHeader
        eyebrow="Reports"
        title="Funnel performance and strategic reporting"
        description="The reporting surface now combines funnel numbers, outreach outcomes, source quality, and the current digest into a single executive-grade view."
      />

      <div className="grid gap-5 px-6 py-6 xl:grid-cols-[minmax(0,1.25fr)_360px]">
        <div className="grid gap-5">
          <SectionCard title="Funnel">
            <div className="grid gap-4 md:grid-cols-5">
              {[
                ['Discovered', funnel?.discovered ?? 0],
                ['Reviewed', funnel?.reviewed ?? 0],
                ['Applied', funnel?.applied ?? 0],
                ['Interviews', funnel?.interviews ?? 0],
                ['Offers', funnel?.offers ?? 0],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-[24px] border border-line/70 bg-canvas/60 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{label}</p>
                  <p className="mt-2 font-display text-3xl font-semibold text-ink">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-4">
              <div>
                <div className="flex items-center justify-between gap-3 text-sm text-muted">
                  <span>Review rate</span>
                  <span>
                    {funnel ? formatPercentage(funnel.reviewed / Math.max(funnel.discovered, 1), 'ratio') : '0%'}
                  </span>
                </div>
                <div className="mt-2">
                  <ProgressBar
                    tone="primary"
                    value={funnel ? (funnel.reviewed / Math.max(funnel.discovered, 1)) * 100 : 0}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between gap-3 text-sm text-muted">
                  <span>Interview rate</span>
                  <span>
                    {funnel ? formatPercentage(funnel.interviews / Math.max(funnel.applied, 1), 'ratio') : '0%'}
                  </span>
                </div>
                <div className="mt-2">
                  <ProgressBar
                    tone="insight"
                    value={funnel ? (funnel.interviews / Math.max(funnel.applied, 1)) * 100 : 0}
                  />
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Source ranking">
            <div className="grid gap-3">
              {sources
                .slice()
                .sort((left, right) => right.successRate - left.successRate)
                .map((source) => (
                  <div key={source.source} className="rounded-[24px] border border-line/70 bg-panel/90 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-semibold text-ink">{source.source}</p>
                      <StatusBadge tone="success">{formatPercentage(source.successRate, 'ratio')} success</StatusBadge>
                    </div>
                    <p className="mt-2 text-sm text-muted">
                      Freshness {source.freshnessHours}h • Duplicate ratio {formatPercentage(source.duplicateRatio, 'ratio')}
                    </p>
                  </div>
                ))}
            </div>
          </SectionCard>
        </div>

        <div className="grid gap-5">
          <SectionCard title="Daily digest">
            <div className="rounded-[28px] border border-primary/15 bg-[linear-gradient(145deg,rgba(13,91,215,0.14),rgba(255,255,255,0.98)_42%,rgba(12,110,84,0.12))] p-5">
              <p className="font-display text-2xl font-semibold tracking-tight text-ink">
                {digest?.headline ?? 'Digest pending'}
              </p>
              <p className="mt-3 text-sm leading-6 text-muted">{digest?.summary ?? 'No digest available.'}</p>
              <p className="mt-4 text-xs uppercase tracking-[0.12em] text-muted">
                {digest ? formatDateTime(digest.generatedAt) : 'Not generated'}
              </p>
            </div>
          </SectionCard>

          <SectionCard title="Outreach performance">
            <div className="grid gap-3">
              <div className="rounded-[24px] border border-line/70 bg-canvas/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Campaigns sent</p>
                <p className="mt-2 font-display text-3xl font-semibold text-ink">{outreach?.campaignsSent ?? 0}</p>
              </div>
              <div className="rounded-[24px] border border-line/70 bg-canvas/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Positive replies</p>
                <p className="mt-2 font-display text-3xl font-semibold text-ink">{outreach?.positiveReplies ?? 0}</p>
              </div>
              <div className="rounded-[24px] border border-line/70 bg-canvas/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Interviews generated</p>
                <p className="mt-2 font-display text-3xl font-semibold text-ink">
                  {outreach?.interviewsGenerated ?? 0}
                </p>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
