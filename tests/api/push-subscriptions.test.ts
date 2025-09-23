import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockSupabase = { from: vi.fn() }
const mockGetUserFromRequest = vi.fn()
const mockSendNotification = vi.fn()
const mockSetVapidDetails = vi.fn()

vi.mock('../../api/_lib/supabaseClient.js', () => ({
  supabaseAdminClient: mockSupabase,
  getUserFromRequest: mockGetUserFromRequest
}))

vi.mock('web-push', () => ({
  __esModule: true,
  default: {
    sendNotification: mockSendNotification,
    setVapidDetails: mockSetVapidDetails
  }
}))

function createResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    headers: new Map<string, string>(),
    setHeader(name: string, value: string) {
      this.headers.set(name, value)
      return this
    },
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: unknown) {
      this.body = payload
      return this
    },
    end(payload?: unknown) {
      if (payload !== undefined) {
        this.body = payload
      }
      return this
    }
  }
}

describe('push-subscriptions index handler', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockSupabase.from.mockReset()
    mockGetUserFromRequest.mockReset()
  })

  it('stores a subscription for the authenticated user', async () => {
    const selectMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const selectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: selectMaybeSingle })
    })

    const singleMock = vi.fn().mockResolvedValue({
      data: { id: 'sub-1', user_id: 'user-1', endpoint: 'https://example.com' },
      error: null
    })
    const selectAfterUpsert = vi.fn().mockReturnValue({ single: singleMock })
    const upsertMock = vi.fn().mockReturnValue({ select: selectAfterUpsert })

    mockSupabase.from
      .mockImplementationOnce(table => {
        expect(table).toBe('push_subscriptions')
        return { select: selectMock }
      })
      .mockImplementationOnce(table => {
        expect(table).toBe('push_subscriptions')
        return { upsert: upsertMock }
      })

    mockGetUserFromRequest.mockResolvedValue({ user: { id: 'user-1' } })

    const { expressHandler } = await import('../../api/push-subscriptions/index.js')
    expressHandler.__testables__.setDependencies({
      supabaseClient: mockSupabase,
      getUserFromRequest: mockGetUserFromRequest
    })

    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer token' },
      body: JSON.stringify({
        subscription: {
          endpoint: 'https://example.com',
          expirationTime: null,
          keys: { p256dh: 'key', auth: 'secret' }
        },
        userAgent: 'vitest'
      })
    }
    const res = createResponse()

    await expressHandler(req as any, res as any)

    expect(selectMock).toHaveBeenCalledWith('id, user_id')
    expect(upsertMock).toHaveBeenCalled()
    const upsertPayload = upsertMock.mock.calls[0][0]
    expect(upsertPayload.user_id).toBe('user-1')
    expect(upsertPayload.user_agent).toBe('vitest')

    expect(res.statusCode).toBe(201)
    expect(res.body).toEqual({
      success: true,
      subscription: {
        id: 'sub-1',
        userId: 'user-1',
        endpoint: 'https://example.com'
      }
    })
  })
})

describe('push-subscriptions dispatch handler', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockSupabase.from.mockReset()
    mockGetUserFromRequest.mockReset()
    mockSendNotification.mockReset()
    mockSetVapidDetails.mockReset()

    process.env.VAPID_PUBLIC_KEY = 'public'
    process.env.VAPID_PRIVATE_KEY = 'private'
  })

  it('sends notifications to stored subscriptions', async () => {
    mockGetUserFromRequest.mockResolvedValue({ user: { id: 'admin' } })

    const selectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({
        data: [
          { id: 'sub-1', subscription: { endpoint: 'https://one' } },
          { id: 'sub-2', subscription: { endpoint: 'https://two' } }
        ],
        error: null
      })
    })

    mockSupabase.from.mockImplementationOnce(table => {
      expect(table).toBe('push_subscriptions')
      return { select: selectMock }
    })

    mockSendNotification.mockResolvedValue(undefined)

    const { expressHandler } = await import('../../api/push-subscriptions/dispatch.js')
    expressHandler.__testables__.setDependencies({
      supabaseClient: mockSupabase,
      webpush: {
        sendNotification: mockSendNotification,
        setVapidDetails: mockSetVapidDetails
      },
      getUserFromRequest: mockGetUserFromRequest
    })

    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer token' },
      body: JSON.stringify({
        userId: 'user-1',
        title: 'Hello',
        body: 'World',
        data: { url: 'https://app.example.com' }
      })
    }
    const res = createResponse()

    await expressHandler(req as any, res as any)

    expect(mockSetVapidDetails).toHaveBeenCalledWith('mailto:notifications@example.com', 'public', 'private')
    expect(mockSendNotification).toHaveBeenCalledTimes(2)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ success: true, delivered: 2, attempted: 2 })
  })

  it('removes stale subscriptions when the push service returns gone', async () => {
    mockGetUserFromRequest.mockResolvedValue({ user: { id: 'admin' } })

    const selectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({
        data: [
          { id: 'sub-1', subscription: { endpoint: 'https://one' } }
        ],
        error: null
      })
    })

    const deleteInMock = vi.fn().mockResolvedValue({ data: null, error: null })
    const deleteMock = vi.fn().mockReturnValue({ in: deleteInMock })

    mockSupabase.from
      .mockImplementationOnce(() => ({ select: selectMock }))
      .mockImplementationOnce(() => ({ delete: deleteMock }))

    mockSendNotification.mockRejectedValue({ statusCode: 410 })

    const { expressHandler } = await import('../../api/push-subscriptions/dispatch.js')
    expressHandler.__testables__.setDependencies({
      supabaseClient: mockSupabase,
      webpush: {
        sendNotification: mockSendNotification,
        setVapidDetails: mockSetVapidDetails
      },
      getUserFromRequest: mockGetUserFromRequest
    })

    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer token' },
      body: JSON.stringify({ userId: 'user-1', title: 'Hello', body: 'World' })
    }
    const res = createResponse()

    await expressHandler(req as any, res as any)

    expect(deleteMock).toHaveBeenCalled()
    expect(deleteInMock).toHaveBeenCalledWith('id', expect.arrayContaining(['sub-1']))
    expect(res.body).toEqual({ success: false, delivered: 0, attempted: 1 })
  })
})
