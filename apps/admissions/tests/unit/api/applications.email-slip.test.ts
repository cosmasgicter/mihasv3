import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const requireAuthMock = vi.fn()

vi.mock('../../../lib/cors', () => ({
  handleCors: vi.fn(() => false),
}))

vi.mock('../../../lib/auth/middleware', () => ({
  requireAuth: (...args: unknown[]) => requireAuthMock(...args),
  AuthenticationError: class extends Error {
    statusCode = 401
    code = 'AUTHENTICATION_ERROR'
  },
  AuthorizationError: class extends Error {
    statusCode = 403
    code = 'AUTHORIZATION_ERROR'
  },
}))

vi.mock('../../../lib/arcjet', () => ({
  withArcjetProtection: (handler: unknown) => handler,
  arcjetProtect: vi.fn(async () => ({ allowed: true })),
}))

vi.mock('../../../lib/realtimeBroker', () => ({
  publishRealtimeEvent: vi.fn(),
}))

vi.mock('../../../lib/auditLogger', () => ({
  logAuditEvent: vi.fn(async () => undefined),
}))

vi.mock('../../../lib/emailTemplates', () => ({
  renderEmailTemplate: vi.fn(() => '<p>email</p>'),
}))

vi.mock('../../../lib/db', () => ({
  query: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock('../../../lib/envValidator', () => ({
  validateServerEnv: vi.fn(() => ({ valid: true, errors: [] })),
}))

vi.mock('../../../lib/csrf', () => ({
  requireCsrf: vi.fn(async () => false),
}))

import handler from '../../../api-src/applications'
import { query } from '../../../lib/db'

const mockQuery = vi.mocked(query)

function createReq(overrides: Partial<VercelRequest> = {}): VercelRequest {
  return {
    method: 'POST',
    query: { action: 'email-slip' },
    headers: {},
    body: {
      applicationId: 'app-1',
      recipientEmail: 'student@example.com',
      slipUrl: 'https://example.com/slips/app-1.pdf',
      slipDocumentReference: 'doc-1',
    },
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

describe('applications email-slip action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('queues application-slip email for the owning student', async () => {
    requireAuthMock.mockResolvedValue({ userId: 'student-1', role: 'student', permissions: [] })

    mockQuery
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 'app-1',
          user_id: 'student-1',
          full_name: 'Jane Student',
          email: 'student@example.com',
          application_number: 'MIHAS000001',
          program: 'Nursing',
        }],
      } as any)
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ email: 'student@example.com' }],
      } as any)
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'queue-1' }],
      } as any)

    const req = createReq()
    const res = createRes()

    await handler(req, res)

    expect(res._status).toBe(200)
    expect(res._json.success).toBe(true)
    expect(res._json.data).toEqual({
      emailed: true,
      queuedId: 'queue-1',
      fallbackDownloadUrl: 'https://example.com/slips/app-1.pdf',
    })

    const insertSql = String(mockQuery.mock.calls[2]?.[0])
    expect(insertSql).toContain('INSERT INTO email_queue')
    expect(insertSql).toContain("'application-slip'")
    const insertArgs = mockQuery.mock.calls[2]?.[1] as unknown[]
    expect(insertArgs[0]).toBe('student@example.com')
    expect(typeof insertArgs[4]).toBe('string')
  })

  it('rejects non-admin recipients that do not match account email', async () => {
    requireAuthMock.mockResolvedValue({ userId: 'student-1', role: 'student', permissions: [] })

    mockQuery
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 'app-1',
          user_id: 'student-1',
          full_name: 'Jane Student',
          email: 'student@example.com',
          application_number: 'MIHAS000001',
        }],
      } as any)
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ email: 'student@example.com' }],
      } as any)

    const req = createReq({
      body: {
        applicationId: 'app-1',
        recipientEmail: 'hacker@example.com',
      },
    })
    const res = createRes()

    await handler(req, res)

    expect(res._status).toBe(403)
    expect(res._json.success).toBe(false)
    expect(mockQuery).toHaveBeenCalledTimes(2)
  })

  it('allows admin override for recipient email while preserving ownership checks for students', async () => {
    requireAuthMock.mockResolvedValue({ userId: 'admin-1', role: 'admin', permissions: [] })

    mockQuery
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 'app-1',
          user_id: 'student-1',
          full_name: 'Jane Student',
          email: 'student@example.com',
          application_number: 'MIHAS000001',
          program: 'Nursing',
        }],
      } as any)
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'queue-99' }],
      } as any)

    const req = createReq({
      body: {
        applicationId: 'app-1',
        recipientEmail: 'parent@example.com',
      },
    })
    const res = createRes()

    await handler(req, res)

    expect(res._status).toBe(200)
    expect(res._json.success).toBe(true)
    expect(res._json.data.queuedId).toBe('queue-99')
    expect(mockQuery).toHaveBeenCalledTimes(2)
  })

  it('blocks non-admin users from emailing slips for applications they do not own', async () => {
    requireAuthMock.mockResolvedValue({ userId: 'student-2', role: 'student', permissions: [] })

    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        id: 'app-1',
        user_id: 'student-1',
        full_name: 'Jane Student',
        email: 'student@example.com',
        application_number: 'MIHAS000001',
      }],
    } as any)

    const req = createReq()
    const res = createRes()

    await handler(req, res)

    expect(res._status).toBe(403)
    expect(res._json.success).toBe(false)
    expect(mockQuery).toHaveBeenCalledTimes(1)
  })
})
