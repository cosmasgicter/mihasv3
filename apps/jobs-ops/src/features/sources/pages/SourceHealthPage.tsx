import { useQuery } from '@tanstack/react-query'

import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { PageHeader } from '@/components/ui/PageHeader'
import { PageSkeleton } from '@/components/ui/PageSkeleton'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { SectionCard } from '@/components/ui/SectionCard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatPercentage } from '@/lib/format'
import { listSourceAnalytics } from '@/services/api/analytics'

export function SourceHealthPage() {
  const sourceAnalyticsQuery = useQuery({
    queryKey: ['source-analytics'],
    queryFn: listSourceAnalytics,
  })

  if (sourceAnalyticsQuery.isLoading) return <PageSkeleton />
  if (sourceAnalyticsQuery.isError) return <ErrorDisplay message={sourceAnalyticsQuery.error?.message ?? 'Failed to load data'} onRetry={() => sourceAnalyticsQuery.refetch()} />

  const sources = sourceAnalyticsQuery.data ?? []

  return (
    <div className="min-h-full">
      <PageHeader
        eyebrow="Source health"
        title="Discovery freshness and adapter diagnostics"
        description="Discovery quality is now visible as a product surface: freshness, success rate, and duplicate pressure are explicit instead of buried in implementation notes."
        actions={
          <>
            <StatusBadge tone="success">{sources.length} sources tracked</StatusBadge>
          </>
        }
      />

      <div className="grid gap-5 px-6 py-6">
        <div className="grid gap-4 xl:grid-cols-3">
          {sources.map((source) => (
            <SectionCard
              key={source.source}
              title={source.source}
              description={`Last fresh snapshot: ${source.freshnessHours} hours ago`}
            >
              <div className="grid gap-4">
                <div>
                  <div className="flex items-center justify-between gap-3 text-sm text-muted">
                    <span>Success rate</span>
                    <span>{formatPercentage(source.successRate, 'ratio')}</span>
                  </div>
                  <div className="mt-2">
                    <ProgressBar tone="success" value={source.successRate * 100} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-3 text-sm text-muted">
                    <span>Duplicate ratio</span>
                    <span>{formatPercentage(source.duplicateRatio, 'ratio')}</span>
                  </div>
                  <div className="mt-2">
                    <ProgressBar tone="warning" value={source.duplicateRatio * 100} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge tone={source.freshnessHours <= 4 ? 'success' : 'warning'}>
                    {source.freshnessHours <= 4 ? 'fresh' : 'aging'}
                  </StatusBadge>
                  <StatusBadge tone="insight">{source.freshnessHours}h freshness</StatusBadge>
                </div>
              </div>
            </SectionCard>
          ))}
        </div>
      </div>
    </div>
  )
}
