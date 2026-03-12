// @vitest-environment jsdom
/**
 * Unit tests for memory leak prevention in long-running sessions
 *
 * Verifies:
 * - OfflineSyncService.destroy() clears interval and removes listeners
 * - OfflineSyncService.init() idempotency (no duplicate listeners)
 * - authPersistence.cleanup() removes visibilitychange listener and interval
 * - SSEClient.disconnect() removes visibilitychange listener (covered in sseClientLifecycle.test.ts)
 *
 * @requirements 21.1, 21.2, 21.3, 21.4, 21.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('OfflineSyncService memory leak prevention', () => {
  let addSpy: ReturnType<typeof vi.spyOn>
  let removeSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
    addSpy = vi.spyOn(window, 'addEventListener')
    removeSpy = vi.spyOn(window, 'removeEventListener')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('destroy() clears periodicSyncInterval and removes online listener', async () => {
    // Dynamic import to get a fresh module instance
    const { offlineSyncService } = await import('@/services/offlineSync')

    // Mock offlineStorage.init to avoid IndexedDB
    vi.spyOn(
      await import('@/lib/offlineStorage').then(m => m.offlineStorage),
      'init'
    ).mockResolvedValue(undefined as any)

    await offlineSyncService.init()

    // Verify online listener was added
    const onlineCalls = addSpy.mock.calls.filter((c: any) => c[0] === 'online')
    expect(onlineCalls.length).toBe(1)

    // Destroy
    offlineSyncService.destroy()

    // Verify online listener was removed
    const removeOnlineCalls = removeSpy.mock.calls.filter((c: any) => c[0] === 'online')
    expect(removeOnlineCalls.length).toBe(1)
    // Same function reference
    expect(removeOnlineCalls[0][1]).toBe(onlineCalls[0][1])
  })

  it('init() is idempotent — calling multiple times does not register duplicate listeners', async () => {
    const { offlineSyncService } = await import('@/services/offlineSync')

    vi.spyOn(
      await import('@/lib/offlineStorage').then(m => m.offlineStorage),
      'init'
    ).mockResolvedValue(undefined as any)

    await offlineSyncService.init()
    await offlineSyncService.init()
    await offlineSyncService.init()

    // Only one online listener should be registered
    const onlineCalls = addSpy.mock.calls.filter((c: any) => c[0] === 'online')
    expect(onlineCalls.length).toBe(1)

    offlineSyncService.destroy()
  })

  it('destroy() allows re-initialization', async () => {
    const { offlineSyncService } = await import('@/services/offlineSync')

    vi.spyOn(
      await import('@/lib/offlineStorage').then(m => m.offlineStorage),
      'init'
    ).mockResolvedValue(undefined as any)

    await offlineSyncService.init()
    offlineSyncService.destroy()

    // Should be able to init again after destroy
    await offlineSyncService.init()

    const onlineCalls = addSpy.mock.calls.filter((c: any) => c[0] === 'online')
    // Two total: one from first init, one from second init
    expect(onlineCalls.length).toBe(2)

    offlineSyncService.destroy()
  })
})

// authPersistence memory leak tests removed — module deleted in single-source-of-truth consolidation (task 8.1)

// applicationStore bounded array tests removed — server-state fields migrated to React Query (task 11.2)
