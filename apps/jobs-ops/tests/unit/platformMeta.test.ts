import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const envState = { demoMode: false }

vi.mock('@/services/api/client', () => ({ apiClient: { get } }))
vi.mock('@/lib/env', () => ({ env: envState }))

const { describePlatformStatus, getPlatformMeta } = await import('@/services/api/platform')

const backendPayload = {
  product: 'Beanola Admissions Platform',
  creator: { name: 'Cosmas Kanchepa' },
  developer: { name: 'Beanola Technologies', url: 'https://beanola.com' },
  api_version: 'v1',
  features: { jobs_ops: true },
}

describe('platform metadata (R3.2)', () => {
  beforeEach(() => {
    get.mockReset()
    envState.demoMode = false
  })

  it('maps features.jobs_ops, marks the source as backend and asks the browser to revalidate', async () => {
    get.mockResolvedValue(backendPayload)
    const meta = await getPlatformMeta()
    expect(meta.features.jobsOps).toBe(true)
    expect(meta.source).toBe('backend')
    expect(get).toHaveBeenCalledWith('/api/v1/meta/platform/', { cache: 'no-cache' })
    expect(describePlatformStatus(meta)).toBe('Jobs-ops enabled')
  })

  it('says not enabled when the backend reports the flag off', async () => {
    get.mockResolvedValue({ ...backendPayload, features: { jobs_ops: false } })
    expect(describePlatformStatus(await getPlatformMeta())).toBe('Jobs-ops not enabled')
  })

  it('demo fallback is labelled as demo and carries no readiness claim', async () => {
    envState.demoMode = true
    get.mockRejectedValue(new Error('network'))
    const meta = await getPlatformMeta()
    expect(meta.source).toBe('demo')
    expect(JSON.stringify(meta)).not.toContain('production_v1_seeded')
    expect(describePlatformStatus(meta)).toBe('Demo data. Backend not reached.')
  })

  it('rethrows outside demo mode', async () => {
    get.mockRejectedValue(new Error('network'))
    await expect(getPlatformMeta()).rejects.toThrow('network')
  })

  it('fails if the OpenAPI baseline stops describing features.jobs_ops', () => {
    const yaml = readFileSync(resolve(__dirname, '../../../../backend/schema/openapi.v1.baseline.yaml'), 'utf8')
    const meta = yaml.match(/\n {4}PlatformMeta:\n([\s\S]*?)\n {4}PlatformMetaCreator:/)
    expect(meta?.[1]).toContain("$ref: '#/components/schemas/PlatformMetaFeatures'")
    expect(meta?.[1]).not.toMatch(/\n {8}status:/)
    const features = yaml.match(/\n {4}PlatformMetaFeatures:\n([\s\S]*?)\n {4}PlatformMetaResponse:/)
    expect(features?.[1]).toMatch(/jobs_ops:\n {10}type: boolean/)
  })
})
