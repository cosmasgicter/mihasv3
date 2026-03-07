import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const {
  queryMock,
  requireRoleMock,
  logAuditEventMock,
} = vi.hoisted(() => ({
  queryMock: vi.fn(),
  requireRoleMock: vi.fn(),
  logAuditEventMock: vi.fn(),
}))

vi.mock('../../../lib/cors', () => ({
  handleCors: vi.fn(() => false),
}))

vi.mock('../../../lib/db', () => ({
  query: queryMock,
  transaction: vi.fn(),
}))

vi.mock('../../../lib/arcjet', () => ({
  withArcjetProtection: (handler: unknown) => handler,
}))

vi.mock('../../../lib/auth/middleware', () => {
  class AuthenticationError extends Error {
    statusCode = 401
    code = 'UNAUTHORIZED'
  }

  class AuthorizationError extends Error {
    statusCode = 403
    code = 'FORBIDDEN'
  }

  return {
    requireRole: requireRoleMock,
    AuthenticationError,
    AuthorizationError,
  }
})

vi.mock('../../../lib/errorHandler', () => ({
  handleError: vi.fn((res: VercelResponse, error: unknown) =>
    res.status(500).json({ success: false, error: String(error) }),
  ),
  sendSuccess: vi.fn((res: VercelResponse, data: unknown, status = 200) =>
    res.status(status).json({ success: true, data }),
  ),
  sendError: vi.fn((res: VercelResponse, error: string, status = 400) =>
    res.status(status).json({ success: false, error }),
  ),
  logErrorAuditEvent: vi.fn(),
  HttpStatus: {
    BAD_REQUEST: 400,
    FORBIDDEN: 403,
    METHOD_NOT_ALLOWED: 405,
    NOT_FOUND: 404,
    UNAUTHORIZED: 401,
    INTERNAL_SERVER_ERROR: 500,
    SERVICE_UNAVAILABLE: 503,
  },
}))

vi.mock('../../../lib/auditLogger', () => ({
  logAuditEvent: logAuditEventMock,
}))

vi.mock('../../../lib/csrf', () => ({
  requireCsrf: vi.fn(async () => false),
}))

vi.mock('../../../lib/envValidator', () => ({
  validateServerEnv: vi.fn(() => ({ valid: true, errors: [] })),
}))

vi.mock('../../../lib/auth/password', () => ({
  hashPassword: vi.fn(),
}))

vi.mock('../../../lib/validation/middleware', () => ({
  validateBody: vi.fn(),
}))

import handler from '../../../api-src/admin'

function createReq(overrides: Partial<VercelRequest> = {}): VercelRequest {
  return {
    method: 'GET',
    query: { action: 'users' },
    headers: {},
    ...overrides,
  } as unknown as VercelRequest
}

function createRes(): VercelResponse & { _status: number; _json: any } {
  const res = {
    _status: 200,
    _json: null,
    status(code: number) {
      this._status = code
      return this
    },
    json(payload: any) {
      this._json = payload
      return this
    },
    setHeader() {
      return this
    },
    end() {
      return this
    },
  }

  return res as unknown as VercelResponse & { _status: number; _json: any }
}

describe('api-src/admin users deactivation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireRoleMock.mockResolvedValue({ userId: 'admin-1', role: 'admin' })
  })

  it('lists only active users by default', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })

    const req = createReq()
    const res = createRes()

    await handler(req, res)

    expect(res._status).toBe(200)
    expect(res._json.success).toBe(true)
    expect(String(queryMock.mock.calls[0]?.[0])).toContain('is_active = true')
    expect(String(queryMock.mock.calls[1]?.[0])).toContain('is_active = true')
  })

  it('deactivates the user and revokes active sessions', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: 'user-2', role: 'student', is_active: true }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'user-2', email: 'student@example.com', role: 'student', is_active: false }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 2,
      })
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      })

    const req = createReq({
      method: 'DELETE',
      query: {
        action: 'users',
        userId: 'user-2',
      },
    })
    const res = createRes()

    await handler(req, res)

    expect(res._status).toBe(200)
    expect(res._json.success).toBe(true)
    expect(String(queryMock.mock.calls[1]?.[0])).toContain('SET is_active = false')
    expect(String(queryMock.mock.calls[2]?.[0])).toContain('UPDATE device_sessions')
    expect(logAuditEventMock).toHaveBeenCalledWith(expect.objectContaining({
      actor_id: 'admin-1',
      action: 'user_deactivated',
      entity_type: 'user',
      entity_id: 'user-2',
    }))
  })
})
