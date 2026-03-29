import { describe, expect, it } from 'vitest'
import { evaluateChunkAutoReloadPolicy } from '@/lib/chunkAutoReloadPolicy'

describe('Chunk auto reload policy', () => {
  const now = 1_000_000

  it('blocks idle reloads after 2+ minutes on home route', () => {
    const result = evaluateChunkAutoReloadPolicy({
      now,
      lastReloadAt: 0,
      reloadCount: 0,
      maxPerSession: 1,
      cooldownMs: 120_000,
      route: '/',
      lastActivityAt: now - 121_000,
    })

    expect(result.allow).toBe(false)
    expect(result.cause).toBe('idle-route-protection')
  })

  it('blocks idle reloads after 2+ minutes on dashboard route', () => {
    const result = evaluateChunkAutoReloadPolicy({
      now,
      lastReloadAt: 0,
      reloadCount: 0,
      maxPerSession: 1,
      cooldownMs: 120_000,
      route: '/student/dashboard',
      lastActivityAt: now - 150_000,
    })

    expect(result.allow).toBe(false)
    expect(result.cause).toBe('idle-route-protection')
  })

  it('allows reload when user is active and session limit has not been hit', () => {
    const result = evaluateChunkAutoReloadPolicy({
      now,
      lastReloadAt: 0,
      reloadCount: 0,
      maxPerSession: 1,
      cooldownMs: 120_000,
      route: '/student/dashboard',
      lastActivityAt: now - 30_000,
    })

    expect(result.allow).toBe(true)
  })
})
