import { useQuery } from '@tanstack/react-query'

import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { PageHeader } from '@/components/ui/PageHeader'
import { PageSkeleton } from '@/components/ui/PageSkeleton'
import { SectionCard } from '@/components/ui/SectionCard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { labelize } from '@/lib/format'
import { listAutomationRuns } from '@/services/api/automation'
import { listResumeAssets } from '@/services/api/documents'
import { listEmailMessages } from '@/services/api/email'
import { listJobApplications } from '@/services/api/job-applications'

type ReviewTask = {
  id: string
  title: string
  summary: string
  category: string
  tone: 'warning' | 'danger' | 'insight'
}

export function ReviewWorkbenchPage() {
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
  const messagesQuery = useQuery({
    queryKey: ['email-messages'],
    queryFn: listEmailMessages,
  })

  const isLoading = applicationsQuery.isLoading || runsQuery.isLoading || assetsQuery.isLoading || messagesQuery.isLoading
  const errorQuery = applicationsQuery.isError ? applicationsQuery : runsQuery.isError ? runsQuery : assetsQuery.isError ? assetsQuery : messagesQuery.isError ? messagesQuery : null

  if (isLoading) return <PageSkeleton />
  if (errorQuery) return <ErrorDisplay message={errorQuery.error?.message ?? 'Failed to load data'} onRetry={() => errorQuery.refetch()} />

  const tasks: ReviewTask[] = [
    ...(applicationsQuery.data?.results
      .filter((application) => application.status === 'awaiting_approval')
      .map((application) => ({
        id: application.id,
        title: application.title,
        summary: `${application.company} • ${labelize(application.automationMode)} • ${application.evidenceCount} artifacts`,
        category: 'application approval',
        tone: 'warning' as const,
      })) ?? []),
    ...(runsQuery.data?.results
      .filter((run) => run.status === 'blocked')
      .map((run) => ({
        id: run.id,
        title: labelize(run.runType),
        summary: run.blockedReason || run.summary,
        category: 'automation blocker',
        tone: 'danger' as const,
      })) ?? []),
    ...(assetsQuery.data
      ?.filter((asset) => asset.status === 'review')
      .map((asset) => ({
        id: asset.id,
        title: asset.name,
        summary: `Variant for ${labelize(asset.targetRole)} is waiting for approval.`,
        category: 'document review',
        tone: 'warning' as const,
      })) ?? []),
    ...(messagesQuery.data?.results
      .filter((message) => message.classification.includes('request'))
      .map((message) => ({
        id: message.id,
        title: message.subject,
        summary: message.bodyPreview,
        category: 'reply follow-up',
        tone: 'insight' as const,
      })) ?? []),
  ]

  return (
    <div className="min-h-full">
      <PageHeader
        eyebrow="Review"
        title="Approval workbench"
        description="The review surface now consolidates approval-gated applications, blocked automation, in-review documents, and replies needing judgment."
        actions={<StatusBadge tone="warning">{tasks.length} active review tasks</StatusBadge>}
      />

      <div className="grid gap-5 px-6 py-6">
        <SectionCard title="Active review tasks">
          <div className="grid gap-4 xl:grid-cols-2">
            {tasks.map((task) => (
              <div key={task.id} className="rounded-[28px] border border-line/70 bg-white/90 p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-2xl font-semibold tracking-tight text-ink">{task.title}</p>
                    <p className="mt-2 text-sm text-muted">{task.summary}</p>
                  </div>
                  <StatusBadge tone={task.tone}>{task.category}</StatusBadge>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
