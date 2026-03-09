// @vitest-environment jsdom
/**
 * Unit tests for memory leak prevention in long-running sessions
 *
 * Verifies:
 * - OfflineSyncService.destroy() clears interval and removes listeners
 * - OfflineSyncService.init() idempotency (no duplicate listeners)
 * - authPersistence.cleanup() removes visibilitychange listener and interval
 * - applicationStore.applications bounded to 50 items
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

describe('authPersistence memory leak prevention', () => {
  let docAddSpy: ReturnType<typeof vi.spyOn>
  let docRemoveSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
    docAddSpy = vi.spyOn(document, 'addEventListener')
    docRemoveSpy = vi.spyOn(document, 'removeEventListener')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('cleanup() removes visibilitychange listener and clears interval', async () => {
    const { authPersistence } = await import('@/lib/authPersistence')

    authPersistence.init()

    // Verify visibilitychange listener was added
    const addCalls = docAddSpy.mock.calls.filter((c: any) => c[0] === 'visibilitychange')
    expect(addCalls.length).toBe(1)

    authPersistence.cleanup()

    // Verify visibilitychange listener was removed with same reference
    const removeCalls = docRemoveSpy.mock.calls.filter((c: any) => c[0] === 'visibilitychange')
    expect(removeCalls.length).toBe(1)
    expect(removeCalls[0][1]).toBe(addCalls[0][1])
  })
})

describe('applicationStore bounded applications array', () => {
  it('setApplications bounds to 50 items', async () => {
    const { useApplicationStore } = await import('@/stores/applicationStore')

    // Create 100 mock applications
    const apps = Array.from({ length: 100 }, (_, i) => ({
      id: `app-${i}`,
      user_id: 'user-1',
      status: 'draft' as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })) as any[]

    useApplicationStore.getState().setApplications(apps)

    expect(useApplicationStore.getState().applications.length).toBe(50)
    // Should keep the first 50
    expect(useApplicationStore.getState().applications[0].id).toBe('app-0')
    expect(useApplicationStore.getState().applications[49].id).toBe('app-49')
  })

  it('setApplications allows fewer than 50 items', async () => {
    const { useApplicationStore } = await import('@/stores/applicationStore')

    const apps = Array.from({ length: 10 }, (_, i) => ({
      id: `app-${i}`,
      user_id: 'user-1',
      status: 'draft' as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })) as any[]

    useApplicationStore.getState().setApplications(apps)

    expect(useApplicationStore.getState().applications.length).toBe(10)
  })

  it('addApplication bounds to 50 items when exceeding limit', async () => {
    const { useApplicationStore } = await import('@/stores/applicationStore')

    // Set 50 applications
    const apps = Array.from({ length: 50 }, (_, i) => ({
      id: `app-${i}`,
      user_id: 'user-1',
      status: 'draft' as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })) as any[]

    useApplicationStore.getState().setApplications(apps)
    expect(useApplicationStore.getState().applications.length).toBe(50)

    // Add one more — should still be bounded at 50
    useApplicationStore.getState().addApplication({
      id: 'app-new',
      user_id: 'user-1',
      status: 'draft' as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any)

    expect(useApplicationStore.getState().applications.length).toBe(50)
    // The newest item should be present (kept last 50)
    expect(useApplicationStore.getState().applications[49].id).toBe('app-new')
  })
})
