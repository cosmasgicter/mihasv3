import { useQuery } from '@tanstack/react-query'

import { PageHeader } from '@/components/ui/PageHeader'
import { SectionCard } from '@/components/ui/SectionCard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatDateTime, labelize } from '@/lib/format'
import { listResumeAssets } from '@/services/api/documents'

function assetTone(status: string) {
  if (status === 'active') return 'success' as const
  if (status === 'review') return 'warning' as const
  return 'insight' as const
}

export function ResumeLabPage() {
  const assetsQuery = useQuery({
    queryKey: ['resume-assets'],
    queryFn: listResumeAssets,
  })

  const assets = assetsQuery.data ?? []

  return (
    <div className="min-h-full">
      <PageHeader
        eyebrow="Documents"
        title="Resume lab and document governance"
        description="The document surface now behaves like a governed asset library: master resume, variants, approval states, and clear version-ready status signals."
        actions={
          <>
            <StatusBadge tone="success">{assets.filter((asset) => asset.status === 'active').length} active</StatusBadge>
            <StatusBadge tone="warning">{assets.filter((asset) => asset.status === 'review').length} in review</StatusBadge>
          </>
        }
      />

      <div className="grid gap-5 px-6 py-6 xl:grid-cols-[minmax(0,1.25fr)_340px]">
        <SectionCard title="Document assets">
          <div className="grid gap-4 md:grid-cols-2">
            {assets.map((asset) => (
              <div key={asset.id} className="rounded-[28px] border border-line/70 bg-white/90 p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-display text-2xl font-semibold tracking-tight text-ink">{asset.name}</p>
                  <StatusBadge tone={assetTone(asset.status)}>{labelize(asset.status)}</StatusBadge>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <StatusBadge tone="neutral">{labelize(asset.assetType)}</StatusBadge>
                  <StatusBadge tone="insight">{labelize(asset.targetRole)}</StatusBadge>
                </div>
                <p className="mt-4 text-sm text-muted">Updated {formatDateTime(asset.updatedAt)}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <div className="grid gap-5">
          <SectionCard title="Document guardrails">
            <div className="grid gap-3 text-sm leading-6 text-muted">
              <div className="rounded-[24px] border border-line/70 bg-white/85 p-4">
                Never invent education, certifications, or work history.
              </div>
              <div className="rounded-[24px] border border-line/70 bg-white/85 p-4">
                Heavily modified variants should pass through human review before submission.
              </div>
              <div className="rounded-[24px] border border-line/70 bg-white/85 p-4">
                Every generated asset should remain versioned and attributable.
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
