import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('../../../lib/cors', () => ({
  handleCors: vi.fn(() => false),
}))

vi.mock('../../../lib/auth/middleware', () => ({
  getAuthUser: vi.fn(async () => ({ userId: 'admin-1', role: 'admin' })),
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
    method: 'PATCH',
    query: { id: 'app-1' },
    headers: {},
    body: { action: 'send_notification', title: 'Document reminder', message: 'Please upload the missing document.' },
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

describe('applications send_notification action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates an in-app notification and queues an email copy for the applicant', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 'app-1',
          user_id: 'student-1',
          full_name: 'Jane Student',
          email: 'jane@example.com',
          application_number: 'MIHAS000001',
        }],
        command: 'SELECT',
      } as any)
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'notif-1' }],
        command: 'INSERT',
      } as any)
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'queue-1' }],
        command: 'INSERT',
      } as any)

    const req = createReq()
    const res = createRes()

    await handler(req, res)

    expect(res._status).toBe(200)
    expect(res._json.success).toBe(true)
    expect(mockQuery).toHaveBeenCalledTimes(3)

    const notificationSql = String(mockQuery.mock.calls[1]?.[0])
    const emailQueueSql = String(mockQuery.mock.calls[2]?.[0])

    expect(notificationSql).toContain('INSERT INTO notifications')
    expect(notificationSql).toContain('action_url')
    expect(emailQueueSql).toContain('INSERT INTO email_queue')
  })
})
