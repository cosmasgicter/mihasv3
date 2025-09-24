import { beforeEach, describe, expect, it, vi } from 'vitest'

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    jsonBody: undefined as any,
    setHeader(name: string, value: string) {
      this.headers[name] = value
    },
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: unknown) {
      this.jsonBody = payload
      return this
    },
    end() {
      return this
    }
  }
}

function createSupabaseMock() {
  const state = {
    emails: [] as any[],
    invocationResults: [] as Array<{ data: any; error: any }>,
    updates: [] as Array<{ values: any; column: string; value: unknown }>
  }

  const client = {
    __setEmails(emails: any[]) {
      state.emails = emails
    },
    __setInvocationResults(results: Array<{ data: any; error: any }> | { data: any; error: any }) {
      state.invocationResults = Array.isArray(results) ? [...results] : [results]
    },
    __getUpdates() {
      return state.updates
    },
    from: vi.fn((table: string) => {
      if (table === 'email_notifications') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              limit: vi.fn(async () => ({ data: state.emails, error: null }))
            }))
          })),
          update: vi.fn((values: any) => ({
            eq: vi.fn((column: string, value: unknown) => {
              state.updates.push({ values, column, value })
              return Promise.resolve({ data: null, error: null })
            })
          }))
        }
      }

      return {
        update: vi.fn((values: any) => ({
          eq: vi.fn((column: string, value: unknown) => {
            state.updates.push({ values, column, value })
            return Promise.resolve({ data: null, error: null })
          })
        }))
      }
    }),
    functions: {
      invoke: vi.fn(async () => {
        if (state.invocationResults.length === 0) {
          return { data: { success: true }, error: null }
        }

        const next = state.invocationResults.shift()
        return next ?? { data: { success: true }, error: null }
      })
    }
  }

  return client
}

async function loadQueueModule(kind: 'api-admin' | 'api-direct' | 'netlify-admin') {
  vi.resetModules()
  vi.clearAllMocks()

  const supabaseMock = createSupabaseMock()

  vi.doMock('../../api/_lib/netlifyHandler.js', () => ({
    __esModule: true,
    withNetlifyHandler: (fn: any) => fn
  }))

  if (kind === 'api-admin') {
    vi.doMock('../../api/_lib/supabaseClient.js', () => ({
      __esModule: true,
      supabaseAdminClient: supabaseMock
    }))

    const module = await import('../../api/notifications/process-email-queue.js')
    return { handler: module.expressHandler, supabaseMock }
  }

  if (kind === 'api-direct') {
    process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role'

    vi.doMock('@supabase/supabase-js', () => ({
      __esModule: true,
      createClient: () => supabaseMock
    }))

    const module = await import('../../api/notifications-process-email-queue.js')
    return { handler: module.expressHandler, supabaseMock }
  }

  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role'

  vi.doMock('../../netlify/functions/_lib/supabaseClient.js', () => ({
    __esModule: true,
    supabaseAdminClient: supabaseMock
  }))

  const module = await import('../../netlify/functions/notifications/process-email-queue.js')
  return { handler: module.handler, supabaseMock }
}

const scenarios = [
  { name: 'API admin queue processor', kind: 'api-admin' as const },
  { name: 'API service queue processor', kind: 'api-direct' as const },
  { name: 'Netlify queue processor', kind: 'netlify-admin' as const }
]

describe.each(scenarios)('$name', ({ kind }) => {
  let handler: any
  let supabaseMock: ReturnType<typeof createSupabaseMock>

  beforeEach(async () => {
    const loaded = await loadQueueModule(kind)
    handler = loaded.handler
    supabaseMock = loaded.supabaseMock
  })

  it('marks pending emails as sent when the provider succeeds', async () => {
    const email = {
      id: 'email-1',
      recipient_email: 'user@example.com',
      subject: 'Hello',
      body: '<p>Hello world</p>',
      retry_count: 2
    }

    supabaseMock.__setEmails([email])
    supabaseMock.__setInvocationResults([{ data: { success: true, data: { provider: 'resend' } }, error: null }])

    const res = createResponse()
    await handler({ method: 'POST', headers: {} }, res)

    expect(res.statusCode).toBe(200)
    expect(res.jsonBody).toEqual({ sent: 1, failed: 0 })

    const updates = supabaseMock.__getUpdates()
    expect(updates).toHaveLength(1)
    expect(updates[0].values.status).toBe('sent')
    expect(typeof updates[0].values.sent_at).toBe('string')
  })

  it('marks emails as failed when the provider reports a rejection', async () => {
    const email = {
      id: 'email-2',
      recipient_email: 'user@example.com',
      subject: 'Hello',
      body: '<p>Hello world</p>',
      retry_count: 1
    }

    supabaseMock.__setEmails([email])
    supabaseMock.__setInvocationResults([
      {
        data: {
          success: false,
          error: {
            message: 'Invalid recipient',
            code: 'provider_error',
            provider: 'resend',
            details: { reason: 'invalid_email' }
          }
        },
        error: null
      }
    ])

    const res = createResponse()
    await handler({ method: 'POST', headers: {} }, res)

    expect(res.statusCode).toBe(200)
    expect(res.jsonBody).toEqual({ sent: 0, failed: 1 })

    const updates = supabaseMock.__getUpdates()
    expect(updates).toHaveLength(1)
    expect(updates[0].values.status).toBe('failed')
    expect(updates[0].values.retry_count).toBe(2)
    expect(updates[0].values.error_message).toContain('Invalid recipient')
    expect(updates[0].values.error_message).toContain('[resend]')
  })

  it('marks emails as failed when the edge function returns an error response', async () => {
    const email = {
      id: 'email-3',
      recipient_email: 'user@example.com',
      subject: 'Hello',
      body: '<p>Hello world</p>',
      retry_count: 0
    }

    supabaseMock.__setEmails([email])
    supabaseMock.__setInvocationResults([
      {
        data: null,
        error: { message: 'Edge function error', status: 500 }
      }
    ])

    const res = createResponse()
    await handler({ method: 'POST', headers: {} }, res)

    expect(res.statusCode).toBe(200)
    expect(res.jsonBody).toEqual({ sent: 0, failed: 1 })

    const updates = supabaseMock.__getUpdates()
    expect(updates).toHaveLength(1)
    expect(updates[0].values.status).toBe('failed')
    expect(updates[0].values.retry_count).toBe(1)
    expect(updates[0].values.error_message).toContain('Edge function error')
  })
})
