import { describe, it, expect } from 'vitest'
import { CACHE_CONFIG } from '@/hooks/queries/useSupabaseQuery'

describe('useSupabaseQuery', () => {
  describe('CACHE_CONFIG', () => {
    it('should have auth cache config with optimized timings', () => {
      // Auth data is low volatility - increased from 5min to 10min
      expect(CACHE_CONFIG.auth.staleTime).toBe(10 * 60 * 1000)
      expect(CACHE_CONFIG.auth.gcTime).toBe(30 * 60 * 1000)
    })

    it('should have applications cache config with fresher data', () => {
      // Applications are medium-high volatility - reduced from 2min to 1min
      expect(CACHE_CONFIG.applications.staleTime).toBe(1 * 60 * 1000)
      expect(CACHE_CONFIG.applications.gcTime).toBe(5 * 60 * 1000)
    })

    it('should have users cache config with longer cache', () => {
      // User profiles are low volatility - increased from 5min to 15min
      expect(CACHE_CONFIG.users.staleTime).toBe(15 * 60 * 1000)
      expect(CACHE_CONFIG.users.gcTime).toBe(30 * 60 * 1000)
    })

    it('should have analytics cache config with extended cache', () => {
      // Analytics are very low volatility - increased from 10min to 30min
      expect(CACHE_CONFIG.analytics.staleTime).toBe(30 * 60 * 1000)
      expect(CACHE_CONFIG.analytics.gcTime).toBe(60 * 60 * 1000)
    })

    it('should have static cache config with longer cache', () => {
      // Static data is very low volatility - increased from 1hr to 2hr
      expect(CACHE_CONFIG.static.staleTime).toBe(2 * 60 * 60 * 1000)
      expect(CACHE_CONFIG.static.gcTime).toBe(24 * 60 * 60 * 1000)
    })

    it('should have realtime cache config with fresher data', () => {
      // Realtime data is high volatility - reduced from 30s to 15s
      expect(CACHE_CONFIG.realtime.staleTime).toBe(15 * 1000)
      expect(CACHE_CONFIG.realtime.gcTime).toBe(60 * 1000)
    })

    it('should prioritize freshness for high-volatility data', () => {
      // Realtime should have shortest staleTime
      expect(CACHE_CONFIG.realtime.staleTime).toBeLessThan(CACHE_CONFIG.applications.staleTime)
      expect(CACHE_CONFIG.applications.staleTime).toBeLessThan(CACHE_CONFIG.auth.staleTime)
    })

    it('should prioritize caching for low-volatility data', () => {
      // Static should have longest staleTime
      expect(CACHE_CONFIG.static.staleTime).toBeGreaterThan(CACHE_CONFIG.analytics.staleTime)
      expect(CACHE_CONFIG.analytics.staleTime).toBeGreaterThan(CACHE_CONFIG.users.staleTime)
    })

    it('should have gcTime longer than staleTime for all configs', () => {
      // Garbage collection should happen after data becomes stale
      Object.values(CACHE_CONFIG).forEach(config => {
        expect(config.gcTime).toBeGreaterThan(config.staleTime)
      })
    })
  })
})
