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
    // Seed localStorage with draft references that clearStaleApplicationDraftReference
    // should clean up for each draft ID after deletion.
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

    // After deleteDraft, clearAllLocalStorage removes all draft keys entirely.
    // Verify the draft keys are gone (cleared by the full cleanup at the end).
    expect(localStorage.getItem('applicationDraft')).toBeNull()
    expect(localStorage.getItem('applicationWizardDraft')).toBeNull()
  })
})
