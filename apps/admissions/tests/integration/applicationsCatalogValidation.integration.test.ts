import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('../../lib/cors', () => ({
  handleCors: vi.fn(() => false),
}))

vi.mock('../../lib/auth/middleware', () => ({
  AuthenticationError: class AuthenticationError extends Error {
    statusCode = 401
    code = 'AUTH_REQUIRED'
  },
  AuthorizationError: class AuthorizationError extends Error {
    statusCode = 403
    code = 'INSUFFICIENT_PERMISSIONS'
  },
  requireAuth: vi.fn(async () => ({
    userId: 'student-1',
    role: 'student',
    permissions: ['applications:create', 'applications:read_own', 'applications:update_own'],
  })),
}))

vi.mock('../../lib/arcjet', () => ({
  withArcjetProtection: (handler: unknown) => handler,
  arcjetProtect: vi.fn(async () => ({ allowed: true })),
}))

vi.mock('../../lib/realtimeBroker', () => ({
  publishRealtimeEvent: vi.fn(),
}))

vi.mock('../../lib/auditLogger', () => ({
  logAuditEvent: vi.fn(async () => undefined),
}))

vi.mock('../../lib/emailTemplates', () => ({
  renderEmailTemplate: vi.fn(() => '<p>email</p>'),
}))

vi.mock('../../lib/envValidator', () => ({
  validateServerEnv: vi.fn(() => ({ valid: true, errors: [] })),
}))

vi.mock('../../lib/csrf', () => ({
  requireCsrf: vi.fn(async () => false),
}))

vi.mock('../../lib/db', () => ({
  query: vi.fn(),
  transaction: vi.fn(),
}))

import handler from '../../api-src/applications'
import { query } from '../../lib/db'

const mockQuery = vi.mocked(query)

function createReq(overrides: Partial<VercelRequest> = {}): VercelRequest {
  return {
    method: 'POST',
    query: {},
    headers: {},
    body: {
      application_number: 'MIHAS-2026-0001',
      public_tracking_code: 'TRK123ABC',
      full_name: 'Jane Student',
      nrc_number: '123456/78/9',
      passport_number: undefined,
      date_of_birth: '2002-01-01',
      sex: 'Female',
      phone: '+260977123456',
      email: 'jane@example.com',
      residence_town: 'Kitwe',
      nationality: 'Zambian',
      next_of_kin_name: 'John Relative',
      next_of_kin_phone: '+260977111111',
      program: 'program-uuid-nursing',
      intake: 'intake-uuid-july-2026',
      institution: 'institution-uuid-mihas',
      status: 'draft',
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

describe('Integration: applications create catalog validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('accepts newly-added catalog program/intake combinations without hardcoded maps', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          program_id: 'program-uuid-nursing',
          program_name: 'Diploma in Nursing Science',
          program_institution_id: 'institution-uuid-mihas',
          institution_id: 'institution-uuid-mihas',
          institution_name: 'MIHAS',
          institution_full_name: 'Mukuba Institute of Health and Allied Sciences',
          institution_code: 'MIHAS',
          intake_exists: true,
          intake_program_exists: true,
        }],
      } as any)
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'app-1', program: 'program-uuid-nursing', intake: 'intake-uuid-july-2026', institution: 'institution-uuid-mihas' }],
      } as any)

    const req = createReq()
    const res = createRes()

    await handler(req, res)

    expect(res._status).toBe(201)
    expect(res._json.success).toBe(true)
    expect(mockQuery).toHaveBeenCalledTimes(2)

    const catalogValidationParams = mockQuery.mock.calls[0]?.[1] as unknown[]
    expect(catalogValidationParams).toEqual(['program-uuid-nursing', 'intake-uuid-july-2026'])

    const insertParams = mockQuery.mock.calls[1]?.[1] as unknown[]
    expect(insertParams).toContain('program-uuid-nursing')
    expect(insertParams).toContain('intake-uuid-july-2026')
    expect(insertParams).toContain('institution-uuid-mihas')
  })

  it('returns field-level program validation when program-intake pair is invalid', async () => {
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        program_id: 'program-uuid-nursing',
        program_name: 'Diploma in Nursing Science',
        program_institution_id: 'institution-uuid-mihas',
        institution_id: 'institution-uuid-mihas',
        institution_name: 'MIHAS',
        institution_full_name: 'Mukuba Institute of Health and Allied Sciences',
        institution_code: 'MIHAS',
        intake_exists: true,
        intake_program_exists: false,
      }],
    } as any)

    const req = createReq()
    const res = createRes()

    await handler(req, res)

    expect(res._status).toBe(400)
    expect(res._json.success).toBe(false)
    expect(res._json.code).toBe('VALIDATION_ERROR')
    expect(res._json.fieldErrors?.program).toBeTruthy()
  })

  it('returns field-level institution validation when institution does not match selected program', async () => {
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        program_id: 'program-uuid-nursing',
        program_name: 'Diploma in Nursing Science',
        program_institution_id: 'institution-uuid-mihas',
        institution_id: 'institution-uuid-mihas',
        institution_name: 'MIHAS',
        institution_full_name: 'Mukuba Institute of Health and Allied Sciences',
        institution_code: 'MIHAS',
        intake_exists: true,
        intake_program_exists: true,
      }],
    } as any)

    const req = createReq({
      body: {
        ...createReq().body,
        institution: 'institution-uuid-katc',
      },
    })
    const res = createRes()

    await handler(req, res)

    expect(res._status).toBe(400)
    expect(res._json.success).toBe(false)
    expect(res._json.code).toBe('VALIDATION_ERROR')
    expect(res._json.fieldErrors?.institution).toBeTruthy()
  })
})
