import { apiClient } from '@/services/api/client'
import type { ResumeAsset } from '@/services/api/contracts'

type RawResumeAsset = {
  id: string
  name: string
  asset_type: string
  target_role: string
  status: string
  updated_at: string
}

const fallbackAssets: ResumeAsset[] = [
  {
    id: '12038f87-f0ec-4ea0-8b28-15423c1d299f',
    name: 'Master Resume',
    assetType: 'resume_master',
    targetRole: 'general',
    status: 'active',
    updatedAt: new Date().toISOString(),
  },
  {
    id: '20f8aeed-b370-4206-9e8c-f216fe237492',
    name: 'NGO Operations Variant',
    assetType: 'resume_variant',
    targetRole: 'programme_operations',
    status: 'draft',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cb740a32-18ef-4476-a13b-2a638ed6f93f',
    name: 'Executive Strategy Variant',
    assetType: 'resume_variant',
    targetRole: 'strategy_leadership',
    status: 'review',
    updatedAt: new Date().toISOString(),
  },
]

function mapResumeAsset(asset: RawResumeAsset): ResumeAsset {
  return {
    id: asset.id,
    name: asset.name,
    assetType: asset.asset_type,
    targetRole: asset.target_role,
    status: asset.status,
    updatedAt: asset.updated_at,
  }
}

export async function listResumeAssets(): Promise<ResumeAsset[]> {
  try {
    const payload = await apiClient.get<RawResumeAsset[]>('/api/v1/documents/resumes/')
    return payload.map(mapResumeAsset)
  } catch {
    return fallbackAssets
  }
}
