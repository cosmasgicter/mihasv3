import { describe, it, expect, beforeEach, vi } from 'vitest'

const fromMock = vi.fn()

const supabaseMock = {
  from: fromMock
}

const createClientMock = vi.fn(() => supabaseMock)

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock
}))

vi.mock('../../api/_lib/netlifyHandler.js', () => ({
  withNetlifyHandler: (handler: unknown) => handler
}))

function createResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    headers: new Map<string, string>(),
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
    }
  }
}

describe('admin email queue status handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fromMock.mockReset()
    fromMock.mockImplementation(() => {
      throw new Error('Unexpected table access')
    })
  })

  it('returns empty summary and recent failures when no rows exist', async () => {
    fromMock.mockReturnValueOnce({
      select: vi.fn().mockResolvedValue({
        data: null,
        error: null
      })
    })

    const { expressHandler } = await import('../../api/admin/email-queue-status.js')

    const req = {
      method: 'GET',
      headers: {}
    }

    const res = createResponse()

    await expressHandler(req as any, res as any)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({
      summary: {},
      recent_failures: [],
      last_checked: expect.any(String)
    })
    expect(fromMock).toHaveBeenCalledTimes(1)
  })
})
