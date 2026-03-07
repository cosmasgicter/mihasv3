import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}))

vi.mock('../../../lib/cors', () => ({
  handleCors: vi.fn(() => false),
}))

vi.mock('../../../lib/db', () => ({
  query: queryMock,
}))

vi.mock('../../../lib/arcjet', () => ({
  withArcjetProtection: (handler: unknown) => handler,
}))

vi.mock('../../../lib/auth/middleware', () => ({
  getAuthUser: vi.fn(async () => null),
}))

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
  HttpStatus: {
    BAD_REQUEST: 400,
    METHOD_NOT_ALLOWED: 405,
    NOT_FOUND: 404,
    FORBIDDEN: 403,
    UNAUTHORIZED: 401,
  },
}))

vi.mock('../../../lib/envValidator', () => ({
  validateServerEnv: vi.fn(() => ({ valid: true, errors: [] })),
}))

import handler from '../../../api-src/catalog'

function createReq(overrides: Partial<VercelRequest> = {}): VercelRequest {
  return {
    method: 'GET',
    query: { type: 'programs' },
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

describe('api-src/catalog programs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns institution linkage for program records', async () => {
    queryMock.mockResolvedValue({
      rows: [
        {
          id: 'prog-1',
          name: 'Diploma in Registered Nursing',
          code: 'RN-01',
          description: 'desc',
          duration_months: 36,
          application_fee: 153,
          tuition_fee: null,
          regulatory_body: 'NMCZ',
          accreditation_status: 'active',
          institution_id: 'mihas-id',
          institution_name: 'MIHAS',
          institution_full_name: 'Mukuba Institute of Health and Allied Sciences',
          is_active: true,
          created_at: '2026-03-01T00:00:00.000Z',
          updated_at: '2026-03-01T00:00:00.000Z',
        },
      ],
      rowCount: 1,
    })

    const req = createReq()
    const res = createRes()

    await handler(req, res)

    expect(res._status).toBe(200)
    expect(res._json.success).toBe(true)
    expect(res._json.data.programs[0]).toMatchObject({
      id: 'prog-1',
      institution_id: 'mihas-id',
      institutions: {
        id: 'mihas-id',
        name: 'MIHAS',
        full_name: 'Mukuba Institute of Health and Allied Sciences',
      },
    })
  })
})
