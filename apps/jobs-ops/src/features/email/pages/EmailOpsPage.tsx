import { useQuery } from '@tanstack/react-query'

import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { PageHeader } from '@/components/ui/PageHeader'
import { PageSkeleton } from '@/components/ui/PageSkeleton'
import { SectionCard } from '@/components/ui/SectionCard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { labelize } from '@/lib/format'
import { listEmailMessages, listEmailThreads } from '@/services/api/email'

function classificationTone(classification: string) {
  if (classification.includes('positive')) return 'success' as const
  if (classification.includes('request')) return 'warning' as const
  return 'insight' as const
}

export function EmailOpsPage() {
  const threadsQuery = useQuery({
    queryKey: ['email-threads'],
    queryFn: listEmailThreads,
  })
  const messagesQuery = useQuery({
    queryKey: ['email-messages'],
    queryFn: listEmailMessages,
  })

  const isLoading = threadsQuery.isLoading || messagesQuery.isLoading
  const errorQuery = threadsQuery.isError ? threadsQuery : messagesQuery.isError ? messagesQuery : null

  if (isLoading) return <PageSkeleton />
  if (errorQuery) return <ErrorDisplay message={errorQuery.error?.message ?? 'Failed to load data'} onRetry={() => errorQuery.refetch()} />

  const threads = threadsQuery.data?.results ?? []
  const messages = messagesQuery.data?.results ?? []
  const inboundMessages = messages.filter((message) => message.direction === 'inbound')

  return (
    <div className="min-h-full">
      <PageHeader
        eyebrow="Email operations"
        title="Mailbox, threads, and reply intelligence"
        description="Email is now represented as an operating surface with thread state, classification, and quick visibility into responses that matter."
        actions={
          <>
            <StatusBadge tone="insight">{threads.length} threads</StatusBadge>
            <StatusBadge tone="warning">{inboundMessages.length} inbound replies</StatusBadge>
          </>
        }
      />

      <div className="grid gap-5 px-6 py-6 xl:grid-cols-[minmax(0,1.25fr)_340px]">
        <SectionCard title="Threads">
          <div className="grid gap-4">
            {threads.map((thread) => {
              const threadMessages = messages.filter((message) => message.threadId === thread.id)
              return (
                <div key={thread.id} className="rounded-[28px] border border-line/70 bg-panel/90 p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-2xl font-semibold tracking-tight text-ink">{thread.subject}</p>
                      <p className="mt-2 font-mono text-xs text-muted">{thread.threadKey}</p>
                    </div>
                    <StatusBadge tone={thread.status === 'open' ? 'success' : 'warning'}>
                      {labelize(thread.status)}
                    </StatusBadge>
                  </div>

                  <div className="mt-4 grid gap-3">
                    {threadMessages.map((message) => (
                      <div key={message.id} className="rounded-[22px] border border-line/70 bg-canvas/55 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-ink">
                            {labelize(message.direction)} • {message.sender}
                          </p>
                          <StatusBadge tone={classificationTone(message.classification)}>
                            {labelize(message.classification)}
                          </StatusBadge>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-muted">{message.bodyPreview}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </SectionCard>

        <div className="grid gap-5">
          <SectionCard title="Inbox priorities">
            <div className="grid gap-3">
              {inboundMessages.map((message) => (
                <div key={message.id} className="rounded-[24px] border border-line/70 bg-panel/85 p-4">
                  <p className="font-semibold text-ink">{message.subject}</p>
                  <p className="mt-2 text-sm text-muted">{message.sender}</p>
                  <div className="mt-3">
                    <StatusBadge tone={classificationTone(message.classification)}>
                      {labelize(message.classification)}
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
