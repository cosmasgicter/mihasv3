import { useQuery } from '@tanstack/react-query'

import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { PageHeader } from '@/components/ui/PageHeader'
import { PageSkeleton } from '@/components/ui/PageSkeleton'
import { SectionCard } from '@/components/ui/SectionCard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { env } from '@/lib/env'
import { labelize } from '@/lib/format'
import { getPlatformMeta } from '@/services/api/platform'

const providers = [
  {
    name: 'Telegram Bot API',
    status: 'ready_for_connection',
    capability: 'alerts, commands, approvals',
  },
  {
    name: 'Zoho Mail',
    status: 'ready_for_connection',
    capability: 'send, thread tracking, delivery state',
  },
  {
    name: 'OpenAI API',
    status: 'seeded_contract',
    capability: 'scoring, tailoring, reply drafts',
  },
  {
    name: 'Redis + Celery',
    status: 'platform_backbone',
    capability: 'orchestration, scheduling, queues',
  },
]

function providerTone(status: string) {
  if (status === 'platform_backbone') return 'success' as const
  if (status === 'ready_for_connection') return 'warning' as const
  return 'insight' as const
}

export function IntegrationsPage() {
  const platformQuery = useQuery({
    queryKey: ['platform-meta'],
    queryFn: getPlatformMeta,
  })

  if (platformQuery.isLoading) return <PageSkeleton />
  if (platformQuery.isError) return <ErrorDisplay message={platformQuery.error?.message ?? 'Failed to load data'} onRetry={() => platformQuery.refetch()} />

  const platform = platformQuery.data

  return (
    <div className="min-h-full">
      <PageHeader
        eyebrow="Integrations"
        title="Providers, identity, and platform metadata"
        description="This page now carries the platform identity contract, creator/developer attribution, and the provider matrix another AI will need for the next integration slice."
        actions={
          <>
            <StatusBadge tone="insight">{platform?.apiVersion ?? 'v1'}</StatusBadge>
            <StatusBadge tone="success">{platform?.status ?? 'ready'}</StatusBadge>
          </>
        }
      />

      <div className="grid gap-5 px-6 py-6 xl:grid-cols-[minmax(0,1.1fr)_360px]">
        <div className="grid gap-5">
          <SectionCard title="Provider matrix">
            <div className="grid gap-4 md:grid-cols-2">
              {providers.map((provider) => (
                <div key={provider.name} className="rounded-[28px] border border-line/70 bg-white/90 p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-display text-2xl font-semibold tracking-tight text-ink">{provider.name}</p>
                    <StatusBadge tone={providerTone(provider.status)}>{labelize(provider.status)}</StatusBadge>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted">{provider.capability}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Platform attribution">
            <div className="rounded-[28px] border border-primary/15 bg-[linear-gradient(145deg,rgba(13,91,215,0.14),rgba(255,255,255,0.98)_42%,rgba(12,110,84,0.12))] p-6">
              <p className="text-sm text-muted">Product</p>
              <p className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink">
                {platform?.product ?? 'AI Job Hunting Platform'}
              </p>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-[24px] border border-white/70 bg-white/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Creator</p>
                  <p className="mt-2 text-lg font-semibold text-ink">{platform?.creator.name ?? 'Cosmas Kanchepa'}</p>
                </div>
                <div className="rounded-[24px] border border-white/70 bg-white/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Developer</p>
                  <a
                    className="mt-2 inline-block text-lg font-semibold text-primary hover:underline"
                    href={platform?.developer.url ?? 'https://beanola.com'}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {platform?.developer.name ?? 'Beanola Technologies'}
                  </a>
                </div>
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="grid gap-5">
          <SectionCard title="Runtime">
            <div className="rounded-[24px] border border-line/70 bg-canvas/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">API base</p>
              <p className="mt-2 break-all font-mono text-sm text-ink">{env.apiBaseUrl}</p>
            </div>
          </SectionCard>

          <SectionCard title="Seeded live endpoints">
            <ul className="grid gap-2 text-xs text-muted">
              {[
                '/api/v1/meta/platform/',
                '/api/v1/integrations/telegram/connect/',
                '/api/v1/integrations/telegram/test/',
                '/api/v1/integrations/telegram/webhook/',
                '/api/v1/integrations/openai/test/',
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
