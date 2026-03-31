import { apiClient } from '@/services/api/client'
import type { PlatformMeta } from '@/services/api/contracts'

const fallbackMeta: PlatformMeta = {
  product: 'AI Job Hunting Platform',
  creator: { name: 'Cosmas Kanchepa' },
  developer: { name: 'Beanola Technologies', url: 'https://beanola.com' },
  apiVersion: 'v1',
  status: 'production_v1_seeded',
}

export async function getPlatformMeta(): Promise<PlatformMeta> {
  try {
    const payload = await apiClient.get<{
      product: string
      creator: { name: string }
      developer: { name: string; url: string }
      api_version: string
      status: string
    }>('/api/v1/meta/platform/')

    return {
      product: payload.product,
      creator: payload.creator,
      developer: payload.developer,
      apiVersion: payload.api_version,
      status: payload.status,
    }
  } catch {
    return fallbackMeta
  }
}
