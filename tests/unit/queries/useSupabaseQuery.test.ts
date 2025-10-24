import { describe, it, expect } from 'vitest'
import { CACHE_CONFIG } from '@/hooks/queries/useSupabaseQuery'

describe('useSupabaseQuery', () => {
  describe('CACHE_CONFIG', () => {
    it('should have auth cache config', () => {
      expect(CACHE_CONFIG.auth.staleTime).toBe(5 * 60 * 1000)
      expect(CACHE_CONFIG.auth.gcTime).toBe(10 * 60 * 1000)
    })

    it('should have applications cache config', () => {
      expect(CACHE_CONFIG.applications.staleTime).toBe(2 * 60 * 1000)
      expect(CACHE_CONFIG.applications.gcTime).toBe(5 * 60 * 1000)
    })

    it('should have users cache config', () => {
      expect(CACHE_CONFIG.users.staleTime).toBe(5 * 60 * 1000)
      expect(CACHE_CONFIG.users.gcTime).toBe(10 * 60 * 1000)
    })

    it('should have analytics cache config', () => {
      expect(CACHE_CONFIG.analytics.staleTime).toBe(10 * 60 * 1000)
      expect(CACHE_CONFIG.analytics.gcTime).toBe(15 * 60 * 1000)
    })

    it('should have static cache config', () => {
      expect(CACHE_CONFIG.static.staleTime).toBe(60 * 60 * 1000)
      expect(CACHE_CONFIG.static.gcTime).toBe(24 * 60 * 60 * 1000)
    })

    it('should have realtime cache config', () => {
      expect(CACHE_CONFIG.realtime.staleTime).toBe(30 * 1000)
      expect(CACHE_CONFIG.realtime.gcTime).toBe(60 * 1000)
    })
  })
})
