import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const mockSupabase = { from: vi.fn() }
const mockGetUserFromRequest = vi.fn()

vi.mock('../../api/_lib/supabaseClient.js', () => ({
  supabaseAdminClient: mockSupabase,
  getUserFromRequest: mockGetUserFromRequest
}))

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    headers: new Map(),
    ended: false,
    setHeader(name: string, value: string) {
      this.headers.set(name, value)
    },
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: unknown) {
      this.body = payload
      return this
    },
    end() {
      this.ended = true
      return this
    }
  }
}

describe('applications/index PUT handler', () => {
  let expressHandler: any

  beforeEach(async () => {
    vi.resetModules()
    mockSupabase.from.mockReset()
    mockGetUserFromRequest.mockReset()

    ;({ expressHandler } = await import('../../api/applications/index.js'))

    expressHandler.__testables__.setDependencies({
      supabaseClient: mockSupabase as any,
      getUserFromRequest: mockGetUserFromRequest
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('updates an application when the requester owns the record', async () => {
    const existingApplication = { id: 'app-123', user_id: 'user-1' }
    const updatedApplication = { id: 'app-123', status: 'submitted', user_id: 'user-1' }

    const selectMaybeSingle = vi.fn().mockResolvedValue({
      data: existingApplication,
      error: null
    })
    const selectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: selectMaybeSingle })
    })

    const updateSingle = vi.fn().mockResolvedValue({ data: updatedApplication, error: null })
    const updateSelect = vi.fn().mockReturnValue({ single: updateSingle })
    const updateEq = vi.fn().mockReturnValue({ select: updateSelect })
    const updateMock = vi.fn().mockReturnValue({ eq: updateEq })

    mockSupabase.from
      .mockImplementationOnce(table => {
        expect(table).toBe('applications_new')
        return { select: selectMock }
      })
      .mockImplementationOnce(table => {
        expect(table).toBe('applications_new')
        return { update: updateMock }
      })

    mockGetUserFromRequest.mockResolvedValue({
      user: { id: 'user-1' },
      isAdmin: false
    })

    const req = {
      method: 'PUT',
      headers: {},
      body: JSON.stringify({ id: 'app-123', status: 'submitted' })
    }
    const res = createResponse()

    await expressHandler(req as any, res as any)

    expect(selectMock).toHaveBeenCalledWith('id, user_id')
    expect(updateMock).toHaveBeenCalledWith({ status: 'submitted' })
    expect(updateEq).toHaveBeenCalledWith('id', 'app-123')
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual(updatedApplication)
  })

  it('rejects updates for applications not owned by the requester', async () => {
    const selectMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: 'app-456', user_id: 'different-user' },
      error: null
    })
    const selectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: selectMaybeSingle })
    })

    mockSupabase.from.mockImplementationOnce(table => {
      expect(table).toBe('applications_new')
      return { select: selectMock }
    })

    mockGetUserFromRequest.mockResolvedValue({
      user: { id: 'user-1' },
      isAdmin: false
    })

    const req = {
      method: 'PUT',
      headers: {},
      body: { id: 'app-456', status: 'draft' }
    }
    const res = createResponse()

    await expressHandler(req as any, res as any)

    expect(res.statusCode).toBe(403)
    expect(res.body).toEqual({ error: 'Access denied' })
    expect(mockSupabase.from).toHaveBeenCalledTimes(1)
  })

  it('validates that an application identifier is provided', async () => {
    mockGetUserFromRequest.mockResolvedValue({
      user: { id: 'user-1' },
      isAdmin: false
    })

    const req = {
      method: 'PUT',
      headers: {},
      body: { status: 'draft' }
    }
    const res = createResponse()

    await expressHandler(req as any, res as any)

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'Application ID is required for updates' })
    expect(mockSupabase.from).not.toHaveBeenCalled()
  })
})
