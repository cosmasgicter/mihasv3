// @vitest-environment node
/**
 * Unit Tests: Notification Cursor Polling (Requirement 2.15/2.16)
 *
 * Proves that:
 * - notificationService.list is the initial-load path (page-number mode)
 * - notificationService.listAfter is the subsequent-poll path (cursor mode)
 * - Page-number mode (count-based) is ONLY used for the initial load and the
 *   full Communications page (which uses communicationsService.listNotifications).
 *
 * These are source-structure tests (read the implementation to verify the
 * contract) rather than render tests, avoiding jsdom issues with React Query.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const HOOK_PATH = path.resolve(__dirname, '../../src/hooks/useNotificationPolling.ts')
const SERVICE_PATH = path.resolve(__dirname, '../../src/services/notifications.ts')
const COMMS_SERVICE_PATH = path.resolve(__dirname, '../../src/services/communications.ts')
const COMMS_HOOK_PATH = path.resolve(__dirname, '../../src/hooks/useCommunications.ts')

describe('Notification Cursor Polling contract (Requirement 2.15/2.16)', () => {
  const hookSource = fs.readFileSync(HOOK_PATH, 'utf-8')
  const serviceSource = fs.readFileSync(SERVICE_PATH, 'utf-8')

  it('notificationService exposes a listAfter method accepting a cursor id', () => {
    expect(serviceSource).toContain('listAfter')
    // The method signature should take a string (the after id)
    expect(serviceSource).toMatch(/listAfter.*afterId.*string/)
    // It should call the endpoint with ?after= query param
    expect(serviceSource).toMatch(/after=/)
  })

  it('useNotificationPolling tracks the newest notification id for cursor use', () => {
    // The hook should track a "newest id" ref
    expect(hookSource).toMatch(/newestIdRef/)
    // It should track whether the initial load has completed
    expect(hookSource).toMatch(/hasInitialLoadRef/)
  })

  it('initial load uses notificationService.list() (full fetch, page-number compatible)', () => {
    // The initial load path calls notificationService.list() (no after param)
    expect(hookSource).toContain('notificationService.list()')
  })

  it('subsequent polls use notificationService.listAfter(newestIdRef) (cursor mode)', () => {
    // After initial load, polls call listAfter with the cursor
    expect(hookSource).toContain('notificationService.listAfter(')
    expect(hookSource).toMatch(/listAfter\(newestIdRef\.current/)
  })

  it('cursor mode deduplicates by notification id before merging', () => {
    // The merge logic filters out existing ids
    expect(hookSource).toMatch(/existingIds/)
    expect(hookSource).toMatch(/dedupedNew/)
    expect(hookSource).toMatch(/filter\(n => !existingIds\.has\(n\.id\)\)/)
  })

  it('list() is ONLY called once (initial load); not after hasInitialLoadRef is set', () => {
    // After initial load sets hasInitialLoadRef = true, the code branches to listAfter
    expect(hookSource).toMatch(/hasInitialLoadRef\.current && newestIdRef\.current/)
    // The full list() call is in the else branch (initial load only)
    const listCallMatches = hookSource.match(/notificationService\.list\(\)/g)
    // Should appear exactly once in the source (the initial load path)
    expect(listCallMatches?.length).toBe(1)
  })

  it('polling interval is 60 seconds by default', () => {
    expect(hookSource).toContain('60_000')
    expect(hookSource).toMatch(/DEFAULT_POLLING_INTERVAL\s*=\s*60_000/)
  })

  it('polling pauses when tab is hidden (visibility-based control)', () => {
    expect(hookSource).toContain('visibilitychange')
    expect(hookSource).toContain('visibilityState')
    expect(hookSource).toContain('HIDDEN_PAUSE_THRESHOLD')
  })

  it('Communications page uses page-number mode (not cursor) via communicationsService', () => {
    const commsService = fs.readFileSync(COMMS_SERVICE_PATH, 'utf-8')
    const commsHook = fs.readFileSync(COMMS_HOOK_PATH, 'utf-8')

    // communicationsService.listNotifications takes page/pageSize params
    expect(commsService).toMatch(/listNotifications.*params.*PaginationParams/)
    expect(commsService).toContain('page')
    expect(commsService).toContain('pageSize')
    // Communications hook uses page-number pagination (page, pageSize, totalCount)
    expect(commsHook).toContain('page')
    expect(commsHook).toContain('pageSize')
    expect(commsHook).toContain('totalCount')
    // Communications does NOT use listAfter or cursor mode
    expect(commsService).not.toContain('listAfter')
    expect(commsHook).not.toContain('listAfter')
    expect(commsHook).not.toContain('after')
  })
})
