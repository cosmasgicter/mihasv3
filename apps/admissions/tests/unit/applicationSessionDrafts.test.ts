import { beforeEach, describe, expect, it, vi } from 'vitest'

const listMock = vi.fn()
const deleteMock = vi.fn()
const getByIdMock = vi.fn()

vi.mock('@/services/applications', () => ({
  applicationService: {
    list: listMock,
    delete: deleteMock,
    getById: getByIdMock,
    update: vi.fn(),
  },
}))

vi.mock('@/lib/security', () => ({
  generateSecureToken: vi.fn(() => 'session-token'),
}))

describe('applicationSessionManager draft deletion', () => {
  beforeEach(() => {
    vi.resetModules()
    listMock.mockReset()
    deleteMock.mockReset()
    getByIdMock.mockReset()
    localStorage.clear()
    sessionStorage.clear()
  })

  it('deletes draft applications by application id rather than user id', async () => {
    listMock.mockResolvedValue({
      applications: [
        { id: 'draft-1', status: 'draft' },
        { id: 'draft-2', status: 'draft' },
      ],
    })
    deleteMock.mockResolvedValue({ success: true })

    localStorage.setItem('applicationWizardDraft', JSON.stringify({ applicationId: 'draft-1' }))

    const { applicationSessionManager } = await import('@/lib/applicationSession')
    const result = await applicationSessionManager.deleteDraft('user-1')

    expect(result.success).toBe(true)
    expect(listMock).toHaveBeenCalledWith({ mine: true, status: 'draft', pageSize: 100 }, {})
    expect(deleteMock).toHaveBeenCalledTimes(2)
    expect(deleteMock).toHaveBeenNthCalledWith(1, 'draft-1')
    expect(deleteMock).toHaveBeenNthCalledWith(2, 'draft-2')
    expect(deleteMock).not.toHaveBeenCalledWith('user-1')
    expect(localStorage.getItem('applicationWizardDraft')).toBeNull()
    expect(sessionStorage.getItem('draftDeleted')).toBe('true')
  })

  it('suppresses stale local drafts when the saved application is already submitted', async () => {
    getByIdMock.mockResolvedValue({
      application: {
        id: 'app-submitted',
        status: 'submitted',
      },
    })

    localStorage.setItem('applicationWizardDraft', JSON.stringify({
      applicationId: 'app-submitted',
      currentStep: 4,
      savedAt: '2026-03-07T10:00:00.000Z',
      version: 2,
    }))

    const { applicationSessionManager } = await import('@/lib/applicationSession')
    const result = await applicationSessionManager.getDraftInfo('user-1')

    expect(result).toEqual({ exists: false })
    expect(getByIdMock).toHaveBeenCalledWith('app-submitted')
    expect(localStorage.getItem('applicationWizardDraft')).toBeNull()
  })

  it('clears orphaned local draft when server application returns 404', async () => {
    const notFound = Object.assign(new Error('Resource not found. The requested item may have been deleted.'), {
      status: 404,
    })
    getByIdMock.mockRejectedValue(notFound)

    localStorage.setItem('applicationWizardDraft', JSON.stringify({
      applicationId: 'deleted-app',
      userId: 'user-1',
      formData: { full_name: 'Test Applicant' },
      selectedGrades: [{ subject_id: 'subject-1', grade: 2 }],
      currentStep: 2,
      savedAt: '2026-04-12T00:00:00.000Z',
      version: 2,
    }))

    const { applicationSessionManager } = await import('@/lib/applicationSession')
    const result = await applicationSessionManager.getLocalWizardDraft('user-1')

    // Draft should be fully cleared when server application is gone
    expect(result).toBeNull()
    expect(localStorage.getItem('applicationWizardDraft')).toBeNull()
    expect(getByIdMock).toHaveBeenCalledWith('deleted-app')
  })

  it('does not load another user scoped wizard draft', async () => {
    const { getWizardDraftStorageKey } = await import('@/lib/draftStorageKeys')
    localStorage.setItem(getWizardDraftStorageKey('user-2', 'draft-2'), JSON.stringify({
      applicationId: 'draft-2',
      userId: 'user-2',
      formData: { full_name: 'Other Student' },
      currentStep: 2,
      savedAt: '2026-04-12T00:00:00.000Z',
      version: 2,
    }))

    const { applicationSessionManager } = await import('@/lib/applicationSession')
    const result = await applicationSessionManager.getLocalWizardDraft('user-1')

    expect(result).toBeNull()
    expect(getByIdMock).not.toHaveBeenCalled()
  })
})
