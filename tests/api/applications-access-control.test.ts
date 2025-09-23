import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockSupabase: { from: ReturnType<typeof vi.fn> } = {
  from: vi.fn()
}

const getUserFromRequest = vi.fn()
const logAuditEvent = vi.fn()

vi.mock('../../api/_lib/supabaseClient.js', () => ({
  supabaseAdminClient: mockSupabase,
  getUserFromRequest
}))

vi.mock('../../api/_lib/auditLogger.js', () => ({
  logAuditEvent
}))

function createResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    headers: new Map<string, string>(),
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

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  getUserFromRequest.mockReset()
  logAuditEvent.mockReset()
  mockSupabase.from = vi.fn()
  mockSupabase.from.mockImplementation(() => {
    throw new Error('Unexpected table access')
  })
})

describe('applications/details handler access control', () => {
  it('returns 401 when authentication is missing', async () => {
    getUserFromRequest.mockResolvedValue({ error: 'No authorization header provided' })

    const { expressHandler } = await import('../../api/applications/details.js')

    const req = {
      method: 'GET',
      query: { id: 'app-123' },
      headers: {}
    }

    const res = createResponse()

    await expressHandler(req as any, res as any)

    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ error: 'No authorization header provided' })
    expect(mockSupabase.from).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it('returns 403 when requester is not the owner', async () => {
    getUserFromRequest.mockResolvedValue({ user: { id: 'user-1' }, isAdmin: false })

    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'app-123', user_id: 'user-2' }, error: null })
    const eq = vi.fn().mockReturnValue({ maybeSingle })
    const select = vi.fn().mockReturnValue({ eq })
    mockSupabase.from.mockImplementationOnce(table => {
      expect(table).toBe('applications_new')
      return { select } as any
    })

    const { expressHandler } = await import('../../api/applications/details.js')

    const req = {
      method: 'GET',
      query: { id: 'app-123' },
      headers: {}
    }

    const res = createResponse()

    await expressHandler(req as any, res as any)

    expect(res.statusCode).toBe(403)
    expect(res.body).toEqual({ error: 'Access denied' })
    expect(maybeSingle).toHaveBeenCalled()
  })

  it('allows the application owner to fetch details', async () => {
    getUserFromRequest.mockResolvedValue({ user: { id: 'user-1' }, isAdmin: false })

    const ensureMaybeSingle = vi.fn().mockResolvedValue({ data: { id: 'app-123', user_id: 'user-1' }, error: null })
    const ensureEq = vi.fn().mockReturnValue({ maybeSingle: ensureMaybeSingle })
    const ensureSelect = vi.fn().mockReturnValue({ eq: ensureEq })
    mockSupabase.from.mockImplementationOnce(() => ({ select: ensureSelect } as any))

    const fetchSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'app-123',
        user_id: 'user-1',
        application_number: 'A-1'
      },
      error: null
    })
    const fetchEq = vi.fn().mockReturnValue({ single: fetchSingle })
    const fetchSelect = vi.fn().mockReturnValue({ eq: fetchEq })
    mockSupabase.from.mockImplementationOnce(() => ({ select: fetchSelect } as any))

    const { expressHandler } = await import('../../api/applications/details.js')

    const req = {
      method: 'GET',
      query: { id: 'app-123' },
      headers: {}
    }

    const res = createResponse()

    await expressHandler(req as any, res as any)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({
      success: true,
      data: {
        id: 'app-123',
        user_id: 'user-1',
        application_number: 'A-1'
      }
    })
    expect(ensureMaybeSingle).toHaveBeenCalled()
    expect(fetchSingle).toHaveBeenCalled()
  })

  it('allows an admin to fetch application details', async () => {
    getUserFromRequest.mockResolvedValue({ user: { id: 'admin-user' }, isAdmin: true })

    const fetchSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'app-123',
        user_id: 'user-2',
        application_number: 'A-1'
      },
      error: null
    })
    const fetchEq = vi.fn().mockReturnValue({ single: fetchSingle })
    const fetchSelect = vi.fn().mockReturnValue({ eq: fetchEq })
    mockSupabase.from.mockImplementationOnce(() => ({ select: fetchSelect } as any))

    const { expressHandler } = await import('../../api/applications/details.js')

    const req = {
      method: 'GET',
      query: { id: 'app-123' },
      headers: {}
    }

    const res = createResponse()

    await expressHandler(req as any, res as any)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({
      success: true,
      data: {
        id: 'app-123',
        user_id: 'user-2',
        application_number: 'A-1'
      }
    })
    expect(fetchSingle).toHaveBeenCalled()
  })
})

describe('applications/generate-slip handler access control', () => {
  it('returns 401 when authentication is missing', async () => {
    getUserFromRequest.mockResolvedValue({ error: 'No authorization header provided' })

    const { expressHandler } = await import('../../api/applications/generate-slip.js')

    const req = {
      method: 'POST',
      body: { applicationId: 'app-123' },
      headers: {}
    }

    const res = createResponse()

    await expressHandler(req as any, res as any)

    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ error: 'No authorization header provided' })
    expect(mockSupabase.from).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it('returns 403 when requester is not the owner', async () => {
    getUserFromRequest.mockResolvedValue({ user: { id: 'user-1', email: 'user@example.com' }, isAdmin: false, roles: ['student'] })

    const ensureMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const ensureEqUser = vi.fn().mockReturnValue({ maybeSingle: ensureMaybeSingle })
    const ensureEqId = vi.fn().mockReturnValue({ eq: ensureEqUser, maybeSingle: ensureMaybeSingle })
    const ensureSelect = vi.fn().mockReturnValue({ eq: ensureEqId })
    mockSupabase.from.mockImplementationOnce(() => ({ select: ensureSelect } as any))

    const { expressHandler } = await import('../../api/applications/generate-slip.js')

    const req = {
      method: 'POST',
      body: { applicationId: 'app-123' },
      headers: {}
    }

    const res = createResponse()

    await expressHandler(req as any, res as any)

    expect(res.statusCode).toBe(403)
    expect(res.body).toEqual({ error: 'Access denied' })
    expect(ensureEqId).toHaveBeenCalledWith('id', 'app-123')
    expect(ensureEqUser).toHaveBeenCalledWith('user_id', 'user-1')
    expect(ensureMaybeSingle).toHaveBeenCalled()
    expect(logAuditEvent).toHaveBeenCalledTimes(1)
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'application.slip.access.denied',
        actorId: 'user-1',
        targetId: 'app-123',
        targetTable: 'applications_new'
      })
    )
  })

  it('allows the application owner to generate a slip', async () => {
    getUserFromRequest.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com' },
      isAdmin: false,
      roles: ['student']
    })

    const ensureMaybeSingle = vi.fn().mockResolvedValue({ data: { id: 'app-123' }, error: null })
    const ensureEqUser = vi.fn().mockReturnValue({ maybeSingle: ensureMaybeSingle })
    const ensureEqId = vi.fn().mockReturnValue({ eq: ensureEqUser, maybeSingle: ensureMaybeSingle })
    const ensureSelect = vi.fn().mockReturnValue({ eq: ensureEqId })
    mockSupabase.from.mockImplementationOnce(() => ({ select: ensureSelect } as any))

    const fetchSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'app-123',
        user_id: 'user-1',
        application_number: 'A-1',
        full_name: 'Test User',
        program: 'CS',
        institution: 'Test University',
        intake: '2024',
        status: 'submitted',
        public_tracking_code: 'TRACK',
        created_at: '2024-01-01T00:00:00.000Z'
      },
      error: null
    })
    const fetchEqUser = vi.fn().mockReturnValue({ single: fetchSingle })
    const fetchEqId = vi.fn().mockReturnValue({ eq: fetchEqUser, single: fetchSingle })
    const fetchSelect = vi.fn().mockReturnValue({ eq: fetchEqId })
    mockSupabase.from.mockImplementationOnce(() => ({ select: fetchSelect } as any))

    const { expressHandler } = await import('../../api/applications/generate-slip.js')

    const req = {
      method: 'POST',
      body: { applicationId: 'app-123' },
      headers: {}
    }

    const res = createResponse()

    await expressHandler(req as any, res as any)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({
      success: true,
      data: {
        applicationNumber: 'A-1',
        fullName: 'Test User',
        program: 'CS',
        institution: 'Test University',
        intake: '2024',
        status: 'submitted',
        trackingCode: 'TRACK',
        createdAt: '2024-01-01T00:00:00.000Z',
        applicationFee: 153
      }
    })
    expect(ensureEqId).toHaveBeenCalledWith('id', 'app-123')
    expect(ensureEqUser).toHaveBeenCalledWith('user_id', 'user-1')
    expect(ensureMaybeSingle).toHaveBeenCalled()
    expect(fetchEqId).toHaveBeenCalledWith('id', 'app-123')
    expect(fetchEqUser).toHaveBeenCalledWith('user_id', 'user-1')
    expect(fetchSingle).toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it('allows an admin to generate a slip', async () => {
    getUserFromRequest.mockResolvedValue({
      user: { id: 'admin-user', email: 'admin@example.com' },
      isAdmin: true,
      roles: ['admin']
    })

    const fetchSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'app-123',
        user_id: 'user-2',
        application_number: 'A-1',
        full_name: 'Admin User',
        program: 'CS',
        institution: 'Test University',
        intake: '2024',
        status: 'submitted',
        public_tracking_code: 'TRACK',
        created_at: '2024-01-01T00:00:00.000Z',
        application_fee: 200
      },
      error: null
    })
    const fetchEq = vi.fn().mockReturnValue({ single: fetchSingle })
    const fetchSelect = vi.fn().mockReturnValue({ eq: fetchEq })
    mockSupabase.from.mockImplementationOnce(() => ({ select: fetchSelect } as any))

    const { expressHandler } = await import('../../api/applications/generate-slip.js')

    const req = {
      method: 'POST',
      body: { applicationId: 'app-123' },
      headers: {}
    }

    const res = createResponse()

    await expressHandler(req as any, res as any)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({
      success: true,
      data: {
        applicationNumber: 'A-1',
        fullName: 'Admin User',
        program: 'CS',
        institution: 'Test University',
        intake: '2024',
        status: 'submitted',
        trackingCode: 'TRACK',
        createdAt: '2024-01-01T00:00:00.000Z',
        applicationFee: 200
      }
    })
    expect(fetchEq).toHaveBeenCalledTimes(1)
    expect(fetchEq).toHaveBeenCalledWith('id', 'app-123')
    expect(fetchSingle).toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })
})
