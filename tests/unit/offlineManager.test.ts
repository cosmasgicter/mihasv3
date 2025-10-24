import { describe, it, expect, beforeEach, vi } from 'vitest'
import { OfflineManager } from '@/lib/offlineManager'

describe('OfflineManager', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  describe('isOnline', () => {
    it('should return navigator.onLine status', () => {
      const result = OfflineManager.isOnline()
      expect(typeof result).toBe('boolean')
    })
  })

  describe('queueRequest', () => {
    it('should add request to queue', async () => {
      await OfflineManager.queueRequest({
        url: '/api/test',
        method: 'POST',
        body: { test: 'data' }
      })

      const queue = OfflineManager.getQueue()
      expect(queue.length).toBe(1)
      expect(queue[0].url).toBe('/api/test')
      expect(queue[0].method).toBe('POST')
    })

    it('should add timestamp and id to request', async () => {
      await OfflineManager.queueRequest({
        url: '/api/test',
        method: 'POST'
      })

      const queue = OfflineManager.getQueue()
      expect(queue[0].timestamp).toBeDefined()
      expect(queue[0].id).toBeDefined()
      expect(typeof queue[0].timestamp).toBe('number')
      expect(typeof queue[0].id).toBe('string')
    })

    it('should handle multiple requests', async () => {
      await OfflineManager.queueRequest({ url: '/api/test1', method: 'POST' })
      await OfflineManager.queueRequest({ url: '/api/test2', method: 'PUT' })
      await OfflineManager.queueRequest({ url: '/api/test3', method: 'DELETE' })

      const queue = OfflineManager.getQueue()
      expect(queue.length).toBe(3)
    })
  })

  describe('getQueue', () => {
    it('should return empty array when no queue exists', () => {
      const queue = OfflineManager.getQueue()
      expect(queue).toEqual([])
    })

    it('should return stored queue', async () => {
      await OfflineManager.queueRequest({ url: '/api/test', method: 'POST' })
      const queue = OfflineManager.getQueue()
      expect(queue.length).toBe(1)
    })

    it('should handle corrupted localStorage data', () => {
      localStorage.setItem('offline_queue', 'invalid json')
      const queue = OfflineManager.getQueue()
      expect(queue).toEqual([])
    })
  })

  describe('clearQueue', () => {
    it('should remove queue from localStorage', async () => {
      await OfflineManager.queueRequest({ url: '/api/test', method: 'POST' })
      expect(OfflineManager.getQueue().length).toBe(1)

      OfflineManager.clearQueue()
      expect(OfflineManager.getQueue().length).toBe(0)
    })
  })

  describe('syncQueue', () => {
    it('should return zero counts when offline', async () => {
      vi.spyOn(OfflineManager, 'isOnline').mockReturnValue(false)
      const result = await OfflineManager.syncQueue()
      expect(result).toEqual({ success: 0, failed: 0 })
    })

    it('should sync requests when online', async () => {
      vi.spyOn(OfflineManager, 'isOnline').mockReturnValue(true)
      global.fetch = vi.fn().mockResolvedValue({ ok: true })

      await OfflineManager.queueRequest({ url: '/api/test', method: 'POST' })
      const result = await OfflineManager.syncQueue()

      expect(result.success).toBe(1)
      expect(result.failed).toBe(0)
    })

    it('should handle failed requests', async () => {
      vi.spyOn(OfflineManager, 'isOnline').mockReturnValue(true)
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      await OfflineManager.queueRequest({ url: '/api/test', method: 'POST' })
      const result = await OfflineManager.syncQueue()

      expect(result.success).toBe(0)
      expect(result.failed).toBe(1)
    })

    it('should clear queue after all successful syncs', async () => {
      vi.spyOn(OfflineManager, 'isOnline').mockReturnValue(true)
      global.fetch = vi.fn().mockResolvedValue({ ok: true })

      await OfflineManager.queueRequest({ url: '/api/test1', method: 'POST' })
      await OfflineManager.queueRequest({ url: '/api/test2', method: 'POST' })

      await OfflineManager.syncQueue()
      expect(OfflineManager.getQueue().length).toBe(0)
    })

    it('should not clear queue if any request fails', async () => {
      vi.spyOn(OfflineManager, 'isOnline').mockReturnValue(true)
      global.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true })
        .mockRejectedValueOnce(new Error('Network error'))

      await OfflineManager.queueRequest({ url: '/api/test1', method: 'POST' })
      await OfflineManager.queueRequest({ url: '/api/test2', method: 'POST' })

      const result = await OfflineManager.syncQueue()
      expect(result.success).toBe(1)
      expect(result.failed).toBe(1)
      expect(OfflineManager.getQueue().length).toBe(2)
    })
  })

  describe('syncStatus', () => {
    it('should set sync status', () => {
      OfflineManager.setSyncStatus('syncing')
      expect(OfflineManager.getSyncStatus()).toBe('syncing')
    })

    it('should return default status when not set', () => {
      expect(OfflineManager.getSyncStatus()).toBe('synced')
    })

    it('should update sync status', () => {
      OfflineManager.setSyncStatus('syncing')
      expect(OfflineManager.getSyncStatus()).toBe('syncing')

      OfflineManager.setSyncStatus('synced')
      expect(OfflineManager.getSyncStatus()).toBe('synced')

      OfflineManager.setSyncStatus('failed')
      expect(OfflineManager.getSyncStatus()).toBe('failed')
    })
  })
})
