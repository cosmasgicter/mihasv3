import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Section 1: applicationService.delete — tests that the service-level catch
// converts 404 errors into { success: true }.
//
// We mock apiClient.request so we can throw errors with specific .status values
// and verify the catch logic in applicationService.delete.
// ─────────────────────────────────────────────────────────────────────────────

describe('applicationService.delete — 404 resilience', () => {
  const requestMock = vi.fn()

  beforeEach(() => {
    vi.resetModules()
    requestMock.mockReset()

    vi.doMock('@/services/client', () => ({
      apiClient: { request: requestMock },
      buildQueryString: (params: Record<string, unknown>) => {
        const qs = Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== null)
          .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
          .join('&')
        return qs ? `?${qs}` : ''
      },
    }))
  })

  it('returns { success: true } when apiClient throws with status 404', async () => {
    const err = Object.assign(
      new Error('Resource not found. The requested item may have been deleted.'),
      { status: 404 },
    )
    requestMock.mockRejectedValue(err)

    const { applicationService } = await import('@/services/applications')
    const result = await applicationService.delete('gone-app-id')

    expect(result).toEqual({ success: true })
  })

  it('returns { success: true } when error message contains "resource not found" without .status', async () => {
    const err = new Error('Resource not found. The requested item may have been deleted.')
    requestMock.mockRejectedValue(err)

    const { applicationService } = await import('@/services/applications')
    const result = await applicationService.delete('gone-app-id')

    expect(result).toEqual({ success: true })
  })

  it('returns { success: true } on a normal successful DELETE (no error)', async () => {
    requestMock.mockResolvedValue(undefined)

    const { applicationService } = await import('@/services/applications')
    const result = await applicationService.delete('existing-app-id')

    expect(result).toEqual({ success: true })
  })

  it('throws for non-404 errors (e.g. 500)', async () => {
    const err = Object.assign(new Error('Server error'), { status: 500 })
    requestMock.mockRejectedValue(err)

    const { applicationService } = await import('@/services/applications')
    await expect(applicationService.delete('app-id')).rejects.toThrow('Server error')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Section 2: deleteDraft — tests that the session manager treats 404 rejections
// as successes and calls clearStaleApplicationDraftReference for each draft ID.
//
// We mock applicationService (list, delete) so we can control per-ID outcomes.
// ─────────────────────────────────────────────────────────────────────────────

describe('deleteDraft — 404 resilience', () => {
  const listMock = vi.fn()
  const deleteMock = vi.fn()

  beforeEach(() => {
    vi.resetModules()
    listMock.mockReset()
    deleteMock.mockReset()
    localStorage.clear()
    sessionStorage.clear()

    vi.doMock('@/services/applications', () => ({
      applicationService: {
        list: listMock,
        delete: deleteMock,
        getById: vi.fn(),
        update: vi.fn(),
      },
    }))

    vi.doMock('@/lib/security', () => ({
      generateSecureToken: vi.fn(() => 'test-session-token'),
    }))
  })

  it('returns { success: true } when all deletes get 404 (resolved by service)', async () => {
    listMock.mockResolvedValue({
      applications: [{ id: 'draft-a' }, { id: 'draft-b' }],
    })
    deleteMock.mockResolvedValue({ success: true })

    const { applicationSessionManager } = await import('@/lib/applicationSession')
    const result = await applicationSessionManager.deleteDraft('user-1')

    expect(result.success).toBe(true)
  })

  it('reuses an in-flight deleteDraft request for the same user', async () => {
    listMock.mockResolvedValue({
      applications: [{ id: 'draft-a' }],
    })
    deleteMock.mockResolvedValue({ success: true })

    const { applicationSessionManager } = await import('@/lib/applicationSession')
    const firstDelete = applicationSessionManager.deleteDraft('user-1')
    const secondDelete = applicationSessionManager.deleteDraft('user-1')
    const [firstResult, secondResult] = await Promise.all([firstDelete, secondDelete])

    expect(firstResult.success).toBe(true)
    expect(secondResult.success).toBe(true)
    expect(listMock).toHaveBeenCalledTimes(1)
    expect(deleteMock).toHaveBeenCalledTimes(1)
  })

  it('returns { success: true } with mixed 200/404 responses (all resolve)', async () => {
    listMock.mockResolvedValue({
      applications: [{ id: 'draft-1' }, { id: 'draft-2' }, { id: 'draft-3' }],
    })
    deleteMock
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })

    const { applicationSessionManager } = await import('@/lib/applicationSession')
    const result = await applicationSessionManager.deleteDraft('user-1')

    expect(result.success).toBe(true)
  })

  it('returns { success: false } when a delete throws a non-404 error (500)', async () => {
    listMock.mockResolvedValue({
      applications: [{ id: 'draft-ok' }, { id: 'draft-fail' }],
    })
    deleteMock
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(Object.assign(new Error('Server error'), { status: 500 }))

    const { applicationSessionManager } = await import('@/lib/applicationSession')
    const result = await applicationSessionManager.deleteDraft('user-1')

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('clears stale localStorage references for each attempted draft ID', async () => {
    // Seed the legacy unscoped records that clearStaleApplicationDraftReference
    // strips the deleted ids out of.
    localStorage.setItem(
      'applicationDraft',
      JSON.stringify({ applicationId: 'id-1', savedAt: '2026-01-01T00:00:00Z' }),
    )
    localStorage.setItem(
      'applicationWizardDraft',
      JSON.stringify({ applicationId: 'id-2', savedAt: '2026-01-01T00:00:00Z' }),
    )

    listMock.mockResolvedValue({
      applications: [{ id: 'id-1' }, { id: 'id-2' }, { id: 'id-3' }],
    })
    deleteMock.mockResolvedValue({ success: true })

    const { applicationSessionManager } = await import('@/lib/applicationSession')
    await applicationSessionManager.deleteDraft('user-1')

    // Task 6.3 (R10.10): the deleted ids no longer appear in any local record.
    // The records themselves are not swept wholesale any more.
    for (const key of ['applicationDraft', 'applicationWizardDraft']) {
      const record = JSON.parse(localStorage.getItem(key) ?? '{}')
      expect(record.applicationId).toBeUndefined()
    }
  })

  // Task 6.3 completion pass (R10.4, R10.10): deleting a user's drafts clears the
  // `(user, application)` record of each draft the server deleted, and nothing
  // else — not a refused payment-linked draft, not another user's draft, not the
  // payment-recovery store. It used to end in a whole-browser draft sweep.
  it('clears only the deleted drafts’ own records, keeping a refused draft, another user and payment recovery', async () => {
    const { getWizardDraftStorageKey } = await import('@/lib/draftStorageKeys')
    const { BROWSER_KEYS } = await import('@/lib/browserNamespace')
    const deletedKey = getWizardDraftStorageKey('user-1', 'draft-gone')
    const refusedKey = getWizardDraftStorageKey('user-1', 'draft-paid')
    const otherUserKey = getWizardDraftStorageKey('user-2', 'draft-theirs')
    for (const key of [deletedKey, refusedKey, otherUserKey]) {
      localStorage.setItem(key, JSON.stringify({ formData: { full_name: key }, version: 2 }))
    }
    localStorage.setItem(BROWSER_KEYS.paymentRecovery, JSON.stringify({ state: { entries: { x: 1 } } }))

    listMock.mockResolvedValue({ applications: [{ id: 'draft-gone' }, { id: 'draft-paid' }] })
    deleteMock.mockImplementation(async (id: string) => {
      if (id === 'draft-paid') {
        throw Object.assign(new Error('Draft has payment activity'), {
          status: 409,
          code: 'DRAFT_HAS_PAYMENT_ACTIVITY',
        })
      }
      return { success: true }
    })

    const { applicationSessionManager } = await import('@/lib/applicationSession')
    const result = await applicationSessionManager.deleteDraft('user-1')

    expect(result.code).toBe('DRAFT_HAS_PAYMENT_ACTIVITY')
    expect(result.deletedIds).toEqual(['draft-gone'])
    expect(result.blockedIds).toEqual(['draft-paid'])
    expect(localStorage.getItem(deletedKey)).toBeNull()
    expect(localStorage.getItem(refusedKey)).not.toBeNull()
    expect(localStorage.getItem(otherUserKey)).not.toBeNull()
    expect(localStorage.getItem(BROWSER_KEYS.paymentRecovery)).not.toBeNull()
  })
})
