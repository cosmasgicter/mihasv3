import { useQuery } from '@tanstack/react-query'

import { PageHeader } from '@/components/ui/PageHeader'
import { SectionCard } from '@/components/ui/SectionCard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { labelize } from '@/lib/format'
import { getOutreachAnalytics } from '@/services/api/analytics'
import { listOutreachCampaigns, listOutreachContacts } from '@/services/api/outreach'

function relationshipTone(status: string) {
  if (status === 'warm') return 'success' as const
  if (status === 'contacted') return 'warning' as const
  return 'insight' as const
}

export function OutreachCRMPage() {
  const contactsQuery = useQuery({
    queryKey: ['outreach-contacts'],
    queryFn: listOutreachContacts,
  })
  const campaignsQuery = useQuery({
    queryKey: ['outreach-campaigns'],
    queryFn: listOutreachCampaigns,
  })
  const analyticsQuery = useQuery({
    queryKey: ['outreach-analytics'],
    queryFn: getOutreachAnalytics,
  })

  const contacts = contactsQuery.data?.results ?? []
  const campaigns = campaignsQuery.data?.results ?? []
  const analytics = analyticsQuery.data

  return (
    <div className="min-h-full">
      <PageHeader
        eyebrow="Outreach CRM"
        title="Relationship and campaign operations"
        description="Outreach is treated as its own revenue-grade workflow: strategic contacts, live campaigns, and measurable reply performance."
        actions={
          <>
            <StatusBadge tone="success">{analytics?.positiveReplies ?? 0} positive replies</StatusBadge>
            <StatusBadge tone="insight">{campaigns.length} campaigns</StatusBadge>
          </>
        }
      />

      <div className="grid gap-5 px-6 py-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
        <div className="grid gap-5">
          <SectionCard title="Priority contacts">
            <div className="grid gap-4">
              {contacts.map((contact) => (
                <div key={contact.id} className="rounded-[28px] border border-line/70 bg-white/90 p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-2xl font-semibold tracking-tight text-ink">{contact.fullName}</p>
                      <p className="mt-2 text-sm text-muted">
                        {contact.role} • {contact.company}
                      </p>
                      <p className="mt-2 text-sm text-muted">{contact.email}</p>
                    </div>
                    <StatusBadge tone={relationshipTone(contact.relationshipStatus)}>
                      {labelize(contact.relationshipStatus)}
                    </StatusBadge>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {contact.tags.map((tag) => (
                      <StatusBadge key={tag} tone="neutral">
                        {labelize(tag)}
                      </StatusBadge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        <div className="grid gap-5">
          <SectionCard title="Campaign pulse">
            <div className="grid gap-3">
              {campaigns.map((campaign) => (
                <div key={campaign.id} className="rounded-[24px] border border-line/70 bg-white/85 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-ink">{campaign.name}</p>
                    <StatusBadge tone={campaign.status === 'active' ? 'success' : 'warning'}>
                      {labelize(campaign.status)}
                    </StatusBadge>
                  </div>
                  <p className="mt-2 text-sm text-muted">{labelize(campaign.campaignType)}</p>
                  <p className="mt-2 text-sm text-muted">{campaign.targetCount} targets</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Performance">
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-1">
              <div className="rounded-[24px] border border-line/70 bg-canvas/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Campaigns sent</p>
                <p className="mt-2 font-display text-3xl font-semibold text-ink">{analytics?.campaignsSent ?? 0}</p>
              </div>
              <div className="rounded-[24px] border border-line/70 bg-canvas/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Positive replies</p>
                <p className="mt-2 font-display text-3xl font-semibold text-ink">{analytics?.positiveReplies ?? 0}</p>
              </div>
              <div className="rounded-[24px] border border-line/70 bg-canvas/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Interviews generated</p>
                <p className="mt-2 font-display text-3xl font-semibold text-ink">{analytics?.interviewsGenerated ?? 0}</p>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
