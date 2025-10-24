import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useOfflineSync } from '@/hooks/useOfflineSync'
import { OfflineManager } from '@/lib/offlineManager'

describe('useOfflineSync', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('should initialize with online status', () => {
    const { result } = renderHook(() => useOfflineSync())
    expect(typeof result.current.isOnline).toBe('boolean')
    expect(result.current.queueSize).toBe(0)
    expect(result.current.syncing).toBe(false)
  })

  it('should update online status when going offline', async () => {
    const { result } = renderHook(() => useOfflineSync())

    act(() => {
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: false
      })
      window.dispatchEvent(new Event('offline'))
    })

    await waitFor(() => {
      expect(result.current.isOnline).toBe(false)
    })
  })

  it('should update online status when going online', async () => {
    const { result } = renderHook(() => useOfflineSync())

    act(() => {
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: false
      })
      window.dispatchEvent(new Event('offline'))
    })

    await waitFor(() => {
      expect(result.current.isOnline).toBe(false)
    })

    act(() => {
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: true
      })
      window.dispatchEvent(new Event('online'))
    })

    await waitFor(() => {
      expect(result.current.isOnline).toBe(true)
    })
  })

  it('should sync queue when coming online', async () => {
    vi.spyOn(OfflineManager, 'getQueue').mockReturnValue([
      { id: '1', url: '/api/test', method: 'POST', timestamp: Date.now() }
    ])
    vi.spyOn(OfflineManager, 'syncQueue').mockResolvedValue({ success: 1, failed: 0 })

    const { result } = renderHook(() => useOfflineSync())

    act(() => {
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: true
      })
      window.dispatchEvent(new Event('online'))
    })

    await waitFor(() => {
      expect(result.current.syncing).toBe(false)
      expect(result.current.queueSize).toBe(0)
    })
  })

  it('should update queue size', async () => {
    const { result } = renderHook(() => useOfflineSync())

    act(() => {
      vi.spyOn(OfflineManager, 'getQueue').mockReturnValue([
        { id: '1', url: '/api/test', method: 'POST', timestamp: Date.now() }
      ])
      window.dispatchEvent(new Event('offline'))
    })

    await waitFor(() => {
      expect(result.current.queueSize).toBe(1)
    })
  })

  it('should set syncing state during sync', async () => {
    let resolveSyncQueue: (value: any) => void
    const syncQueuePromise = new Promise((resolve) => {
      resolveSyncQueue = resolve
    })

    vi.spyOn(OfflineManager, 'getQueue').mockReturnValue([
      { id: '1', url: '/api/test', method: 'POST', timestamp: Date.now() }
    ])
    vi.spyOn(OfflineManager, 'syncQueue').mockReturnValue(syncQueuePromise as any)

    const { result } = renderHook(() => useOfflineSync())

    act(() => {
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: true
      })
      window.dispatchEvent(new Event('online'))
    })

    await waitFor(() => {
      expect(result.current.syncing).toBe(true)
    })

    act(() => {
      resolveSyncQueue!({ success: 1, failed: 0 })
    })

    await waitFor(() => {
      expect(result.current.syncing).toBe(false)
    })
  })

  it('should cleanup event listeners on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useOfflineSync())

    unmount()

    expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function))
    expect(removeEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function))
  })
})
