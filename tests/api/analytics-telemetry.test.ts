import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseFrom = vi.fn()
const insertMock = vi.fn()
const getUserFromRequest = vi.fn()
const listActiveConsentUserIds = vi.fn()
const logAuditEvent = vi.fn()

vi.mock('../../api/_lib/supabaseClient.js', () => ({
  supabaseAdminClient: { from: supabaseFrom },
  getUserFromRequest
}))

vi.mock('../../api/_lib/auditLogger.js', () => ({
  logAuditEvent
}))

vi.mock('../../api/_lib/userConsent.js', () => ({
  listActiveConsentUserIds
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
    }
  }
}

function createQueryChain(result: { data: any; error: any }) {
  const chain: any = {
    order: vi.fn(),
    eq: vi.fn(),
    limit: vi.fn(),
    gte: vi.fn(),
    then: (onFulfilled: any, onRejected: any) =>
      Promise.resolve(result).then(onFulfilled, onRejected)
  }

  chain.order.mockReturnValue(chain)
  chain.eq.mockReturnValue(chain)
  chain.limit.mockReturnValue(chain)
  chain.gte.mockReturnValue(chain)

  return chain
}

function createSelect(result: { data: any; error: any }) {
  const chain = createQueryChain(result)
  const select = vi.fn(() => chain)
  return { chain, select }
}

async function invokeExpress(method: string, options: { body?: any; query?: Record<string, string> } = {}) {
  const { expressHandler } = await import('../../api/analytics/telemetry.js')
  const res = createResponse()
  const req = {
    method,
    body: options.body,
    query: options.query ?? {},
    headers: {}
  }

  await expressHandler(req as any, res as any)
  return { statusCode: res.statusCode, body: res.body }
}

async function invokeNetlify(method: string, options: { body?: any; query?: Record<string, string> } = {}) {
  const mod = await import('../../netlify/functions/analytics/telemetry.js')
  const handler = mod.handler ?? mod.default

  const event = {
    httpMethod: method,
    headers: { 'content-type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined,
    isBase64Encoded: false,
    queryStringParameters: options.query ?? {},
    multiValueQueryStringParameters: undefined,
    pathParameters: undefined
  }

  const response = await handler(event as any, {})
  const parsedBody = response.body ? JSON.parse(response.body) : undefined
  return { statusCode: response.statusCode, body: parsedBody }
}

const handlers = [
  {
    name: 'express telemetry handler',
    invoke: invokeExpress
  },
  {
    name: 'Netlify telemetry function',
    invoke: invokeNetlify
  }
]

beforeEach(() => {
  vi.resetModules()
  supabaseFrom.mockReset()
  insertMock.mockReset()
  getUserFromRequest.mockReset()
  listActiveConsentUserIds.mockReset()
  logAuditEvent.mockReset()

  listActiveConsentUserIds.mockResolvedValue(['consented-user'])
  logAuditEvent.mockResolvedValue(undefined)

  supabaseFrom.mockImplementation(() => {
    throw new Error('Unexpected table access')
  })
})

describe.each(handlers)('$name', ({ invoke }) => {
  it('stores telemetry events when payload is valid', async () => {
    insertMock.mockResolvedValue({ error: null })
    supabaseFrom.mockImplementation(table => {
      if (table === 'api_telemetry') {
        return { insert: insertMock }
      }
      throw new Error(`Unexpected table ${table}`)
    })

    const events = [
      {
        type: 'api_call',
        service: 'test-service',
        success: true
      }
    ]

    const response = await invoke('POST', { body: { events } })

    expect(insertMock).toHaveBeenCalledTimes(1)
    expect(insertMock.mock.calls[0][0]).toHaveLength(1)
    expect(response.statusCode).toBe(202)
    expect(response.body).toEqual({ stored: 1 })
  })

  it('rejects invalid telemetry payloads', async () => {
    insertMock.mockResolvedValue({ error: null })
    supabaseFrom.mockImplementation(table => {
      if (table === 'api_telemetry') {
        return { insert: insertMock }
      }
      throw new Error(`Unexpected table ${table}`)
    })

    const response = await invoke('POST', { body: { invalid: true } })

    expect(insertMock).not.toHaveBeenCalled()
    expect(response.statusCode).toBe(400)
    expect(response.body).toEqual({ error: 'Invalid telemetry payload' })
  })

  it('enforces admin-only access for fetch requests', async () => {
    getUserFromRequest.mockResolvedValue({ error: 'Access denied' })

    const response = await invoke('GET')

    expect(response.statusCode).toBe(403)
    expect(response.body).toEqual({ error: 'Access denied' })
  })

  it('returns telemetry data for authorized admin requests', async () => {
    getUserFromRequest.mockResolvedValue({
      user: { id: 'admin-id', email: 'admin@example.com' },
      roles: ['admin']
    })

    const telemetryData = [
      {
        id: 1,
        type: 'api_call',
        service: 'test-service',
        endpoint: '/status',
        success: true,
        duration_ms: 120,
        status_code: 200,
        metric_name: null,
        metric_value: null,
        level: null,
        message: null,
        metadata: null,
        occurred_at: '2024-01-01T00:00:00.000Z'
      },
      {
        id: 2,
        type: 'api_call',
        service: 'test-service',
        endpoint: '/status',
        success: false,
        duration_ms: 200,
        status_code: 500,
        metric_name: null,
        metric_value: null,
        level: null,
        message: null,
        metadata: null,
        occurred_at: '2024-01-01T01:00:00.000Z'
      }
    ]

    const { select } = createSelect({ data: telemetryData, error: null })

    supabaseFrom.mockImplementation(table => {
      if (table === 'api_telemetry') {
        return { insert: insertMock, select }
      }
      throw new Error(`Unexpected table ${table}`)
    })

    const response = await invoke('GET', { query: { service: 'test-service' } })

    expect(response.statusCode).toBe(200)
    expect(response.body?.events).toEqual(telemetryData)
    expect(response.body?.summary).toEqual([
      expect.objectContaining({
        service: 'test-service',
        endpoint: '/status',
        totalCalls: 2,
        errorCount: 1
      })
    ])
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'analytics.telemetry.view' })
    )
  })
})
