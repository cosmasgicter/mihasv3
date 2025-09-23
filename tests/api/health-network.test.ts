import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestSpy = vi.fn<
  (
    options: unknown,
    callback: (res: {
      statusCode?: number
      statusMessage?: string
      resume?: () => void
      on?: () => void
    }) => void
  ) => {
    on: (event: string, handler: (...args: unknown[]) => void) => unknown
    end: () => void
    destroy: () => void
  }
>()

vi.mock('node:https', () => ({
  default: { request: requestSpy },
  request: requestSpy
}))

const { testSupabaseConnection } = await import('../../api/_lib/networkTest.js')

function mockHttpResponse(statusCode: number, statusMessage?: string) {
  requestSpy.mockImplementationOnce((options, callback) => {
    const response = {
      statusCode,
      statusMessage,
      resume: vi.fn(),
      on: vi.fn()
    }

    callback(response)

    return {
      on: vi.fn().mockReturnThis(),
      end: vi.fn(),
      destroy: vi.fn()
    }
  })
}

describe('testSupabaseConnection', () => {
  beforeEach(() => {
    requestSpy.mockReset()
  })

  it.each([
    { status: 401, message: 'Unauthorized' },
    { status: 404, message: 'Not Found' }
  ])('returns success false when Supabase responds with $status', async ({ status, message }) => {
    mockHttpResponse(status, message)

    const result = await testSupabaseConnection('https://example.supabase.co')

    expect(result.success).toBe(false)
    expect(result.status).toBe(status)
    expect(result.error).toBe(`HTTP ${status}`)
    expect(result.message).toContain(`${status}`)
  })
})
