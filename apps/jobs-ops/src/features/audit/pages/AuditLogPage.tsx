import { useQuery } from '@tanstack/react-query'

import { PageHeader } from '@/components/ui/PageHeader'
import { SectionCard } from '@/components/ui/SectionCard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatDateTime, labelize } from '@/lib/format'
import { getDailyDigest, listSourceAnalytics } from '@/services/api/analytics'
import { listAutomationRuns } from '@/services/api/automation'
import { listResumeAssets } from '@/services/api/documents'
import { listJobApplications } from '@/services/api/job-applications'
import { getPlatformMeta } from '@/services/api/platform'

type AuditEvent = {
  id: string
  title: string
  summary: string
  at: string
  tone: 'success' | 'warning' | 'danger' | 'insight'
}

export function AuditLogPage() {
  const metaQuery = useQuery({
    queryKey: ['platform-meta'],
    queryFn: getPlatformMeta,
  })
  const applicationsQuery = useQuery({
    queryKey: ['job-applications'],
    queryFn: listJobApplications,
  })
  const runsQuery = useQuery({
    queryKey: ['automation-runs'],
    queryFn: listAutomationRuns,
  })
  const assetsQuery = useQuery({
    queryKey: ['resume-assets'],
    queryFn: listResumeAssets,
  })
  const sourcesQuery = useQuery({
    queryKey: ['source-analytics'],
    queryFn: listSourceAnalytics,
  })
  const digestQuery = useQuery({
    queryKey: ['daily-digest'],
    queryFn: getDailyDigest,
  })

  const now = Date.now()
  const events: AuditEvent[] = [
    {
      id: 'platform-meta',
      title: `${metaQuery.data?.product ?? 'Platform'} identity loaded`,
      summary: `Creator ${metaQuery.data?.creator.name ?? 'Cosmas Kanchepa'} • Developer ${metaQuery.data?.developer.name ?? 'Beanola Technologies'}`,
      at: new Date(now).toISOString(),
      tone: 'insight' as const,
    },
    ...(applicationsQuery.data?.results.map((application) => ({
      id: application.id,
      title: `${application.title} application ${labelize(application.status)}`,
      summary: `${application.company} • ${application.evidenceCount} evidence artifacts`,
      at: application.updatedAt,
      tone: application.status === 'submitted' ? ('success' as const) : ('warning' as const),
    })) ?? []),
    ...(runsQuery.data?.results.map((run) => ({
      id: run.id,
      title: `${labelize(run.runType)} run ${labelize(run.status)}`,
      summary: run.blockedReason || run.summary,
      at: run.updatedAt,
      tone:
        run.status === 'blocked'
          ? ('danger' as const)
          : run.status === 'completed'
            ? ('success' as const)
            : ('insight' as const),
    })) ?? []),
    ...(assetsQuery.data?.map((asset) => ({
      id: asset.id,
      title: `${asset.name} ${labelize(asset.status)}`,
      summary: `${labelize(asset.assetType)} • ${labelize(asset.targetRole)}`,
      at: asset.updatedAt,
      tone: asset.status === 'active' ? ('success' as const) : ('warning' as const),
    })) ?? []),
    ...(sourcesQuery.data?.map((source) => ({
      id: source.source,
      title: `${source.source} health sample`,
      summary: `Success ${Math.round(source.successRate * 100)}% • Duplicates ${Math.round(source.duplicateRatio * 100)}%`,
      at: new Date(now - source.freshnessHours * 60 * 60 * 1000).toISOString(),
      tone: source.freshnessHours <= 4 ? ('success' as const) : ('warning' as const),
    })) ?? []),
    ...(digestQuery.data
      ? [
          {
            id: 'daily-digest',
            title: digestQuery.data.headline,
            summary: digestQuery.data.summary,
            at: digestQuery.data.generatedAt,
            tone: 'insight' as const,
          },
        ]
      : []),
  ].sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime())

  return (
    <div className="min-h-full">
      <PageHeader
        eyebrow="Audit"
        title="Traceability and operational history"
        description="The audit surface now reflects real seeded events from applications, automation, documents, source health, reporting, and platform metadata."
        actions={<StatusBadge tone="insight">{events.length} tracked events</StatusBadge>}
      />

      <div className="grid gap-5 px-6 py-6">
        <SectionCard title="Audit timeline">
          <div className="grid gap-4">
            {events.map((event) => (
              <div key={event.id} className="rounded-[28px] border border-line/70 bg-white/90 p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-2xl font-semibold tracking-tight text-ink">{event.title}</p>
                    <p className="mt-2 text-sm leading-6 text-muted">{event.summary}</p>
                  </div>
                  <StatusBadge tone={event.tone}>{formatDateTime(event.at)}</StatusBadge>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
