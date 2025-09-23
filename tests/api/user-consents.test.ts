import { describe, it, expect, beforeEach, vi } from 'vitest'

const getUserFromRequest = vi.fn()
const logAuditEvent = vi.fn()
const listConsents = vi.fn()
const grantConsent = vi.fn()
const revokeConsent = vi.fn()
const hasActiveConsent = vi.fn()

vi.mock('../../api/_lib/supabaseClient.js', () => ({
  getUserFromRequest
}))

vi.mock('../../api/_lib/auditLogger.js', () => ({
  logAuditEvent
}))

vi.mock('../../api/_lib/userConsent.js', () => ({
  listConsents,
  grantConsent,
  revokeConsent,
  hasActiveConsent
}))

vi.mock('../../api/_lib/netlifyHandler.js', () => ({
  withNetlifyHandler: handler => handler
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

describe('user-consents handler authentication', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    getUserFromRequest.mockReset()
    logAuditEvent.mockReset()
    listConsents.mockReset()
    grantConsent.mockReset()
    revokeConsent.mockReset()
    hasActiveConsent.mockReset()
  })

  it('returns 401 when authentication is missing', async () => {
    getUserFromRequest.mockResolvedValueOnce({ error: 'No authorization header provided' })

    const { expressHandler } = await import('../../api/user-consents.js')

    const req = {
      method: 'GET',
      headers: {},
      query: {}
    }
    const res = createResponse()

    await expressHandler(req as any, res as any)

    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ error: 'No authorization header provided' })
    expect(listConsents).not.toHaveBeenCalled()
  })

  it('returns 403 when authentication fails with access denied', async () => {
    getUserFromRequest.mockResolvedValueOnce({ error: 'Access denied' })

    const { expressHandler } = await import('../../api/user-consents.js')

    const req = {
      method: 'GET',
      headers: {},
      query: {}
    }
    const res = createResponse()

    await expressHandler(req as any, res as any)

    expect(res.statusCode).toBe(403)
    expect(res.body).toEqual({ error: 'Access denied' })
    expect(listConsents).not.toHaveBeenCalled()
  })
})

