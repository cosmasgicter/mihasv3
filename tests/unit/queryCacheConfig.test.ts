/**
 * Feature: migration-recovery-hardening, Property 10: No polling query has refetchInterval below 30 seconds
 * 
 * Validates: Requirements 9.4
 */
import { describe, it, expect } from 'vitest'
import { QUERY_CACHE_CONFIG } from '@/lib/queryCacheConfig'

describe('Property 10: No polling query has refetchInterval below 30 seconds', () => {
  it('all config profiles with refetchInterval have values >= 30000ms', () => {
    for (const [profileName, config] of Object.entries(QUERY_CACHE_CONFIG)) {
      const cfg = config as Record<string, unknown>
      if ('refetchInterval' in cfg && typeof cfg.refetchInterval === 'number') {
        expect(cfg.refetchInterval, `${profileName}.refetchInterval`).toBeGreaterThanOrEqual(30_000)
      }
    }
  })

  it('critical profile has staleTime >= 30 seconds', () => {
    expect(QUERY_CACHE_CONFIG.critical.staleTime).toBeGreaterThanOrEqual(30_000)
  })

  it('static profile has staleTime >= 5 minutes', () => {
    expect(QUERY_CACHE_CONFIG.static.staleTime).toBeGreaterThanOrEqual(5 * 60_000)
  })

  it('static profile has refetchOnWindowFocus disabled', () => {
    expect(QUERY_CACHE_CONFIG.static.refetchOnWindowFocus).toBe(false)
  })

  it('polling profile has refetchInterval >= 30 seconds', () => {
    expect(QUERY_CACHE_CONFIG.polling.refetchInterval).toBeGreaterThanOrEqual(30_000)
  })
})
