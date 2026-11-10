import { apiClient } from '@/services/api/client'
import { env } from '@/lib/env'
import type { PlatformMeta } from '@/services/api/contracts'

const fallbackMeta: PlatformMeta = {
  product: 'AI Job Hunting Platform',
  creator: { name: 'Cosmas Kanchepa' },
  developer: { name: 'Beanola Technologies', url: 'https://beanola.com' },
  apiVersion: 'v1',
  // Demo mode renders the seeded pages, so the fallback reports the feature on; the shell
  // labels it "Demo data. Backend not reached." through `source`.
  features: { jobsOps: true },
  source: 'demo',
}

export async function getPlatformMeta(): Promise<PlatformMeta> {
  try {
    // The endpoint is cacheable for a day upstream; the flag can change on a
    // deploy, so ask the browser to revalidate rather than trust its copy.
    const payload = await apiClient.get<{
      product: string
      creator: { name: string }
      developer: { name: string; url: string }
      api_version: string
      features: { jobs_ops: boolean }
    }>('/api/v1/meta/platform/', { cache: 'no-cache' })
    return {
      product: payload.product,
      creator: payload.creator,
      developer: payload.developer,
      apiVersion: payload.api_version,
      features: { jobsOps: payload.features.jobs_ops },
      source: 'backend',
    }
  } catch (error) {
    if (env.demoMode) return fallbackMeta
    throw error
  }
}

/** What the shell may truthfully say about the backend. */
export function describePlatformStatus(meta: PlatformMeta | undefined): string {
  if (!meta) return 'Checking backend'
  if (meta.source === 'demo') return 'Demo data. Backend not reached.'
  return meta.features.jobsOps ? 'Jobs-ops enabled' : 'Jobs-ops not enabled'
}
