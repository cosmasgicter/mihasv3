import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockSupabase = {
  from: vi.fn()
}

const getUserFromRequest = vi.fn()

vi.mock('../../api/_lib/supabaseClient.js', () => ({
  supabaseAdminClient: mockSupabase,
  getUserFromRequest
}))

const updateStatusForApplications = vi.fn()
const insertStatusHistoryEntries = vi.fn()
const updatePaymentStatusForApplications = vi.fn()
const softDeleteApplications = vi.fn()

vi.mock('../../api/applications/applicationActions.js', () => ({
  updateStatusForApplications,
  insertStatusHistoryEntries,
  updatePaymentStatusForApplications,
  softDeleteApplications
}))

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    headers: new Map(),
    ended: false,
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
    },
    end() {
      this.ended = true
      return this
    }
  }
}

describe('applications/[id] handler', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockSupabase.from.mockImplementation(() => {
      throw new Error('Unexpected table access')
    })
  })

  it('updates application status using admin action', async () => {
    const selectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'app-123', status: 'under_review' },
          error: null
        })
      })
    })

    mockSupabase.from.mockImplementation(table => {
      if (table === 'applications_new') {
        return { select: selectMock }
      }
      throw new Error(`Unexpected table ${table}`)
    })

    getUserFromRequest.mockResolvedValue({
      user: { id: 'admin-user' },
      isAdmin: true
    })

    updateStatusForApplications.mockResolvedValue({})
    insertStatusHistoryEntries.mockResolvedValue(undefined)

    const { expressHandler } = await import('../../api/applications/[id].js')

    const req = {
      method: 'PATCH',
      query: { id: 'app-123' },
      body: {
        action: 'update_status',
        status: 'approved'
      },
      headers: {}
    }

    const res = createResponse()

    await expressHandler(req as any, res as any)

    expect(updateStatusForApplications).toHaveBeenCalledWith(['app-123'], 'approved')
    expect(insertStatusHistoryEntries).toHaveBeenCalledWith(['app-123'], 'approved', 'admin-user', undefined)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ success: true, data: { id: 'app-123', status: 'under_review' } })
  })

  it('soft deletes an application', async () => {
    const selectEq = vi.fn(() => ({
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'to-delete', status: 'draft', user_id: 'admin-user' },
        error: null
      })
    }))

    mockSupabase.from.mockImplementation(table => {
      if (table === 'applications_new') {
        return {
          select: vi.fn(() => ({ eq: selectEq }))
        }
      }
      throw new Error(`Unexpected table ${table}`)
    })

    getUserFromRequest.mockResolvedValue({
      user: { id: 'admin-user' },
      isAdmin: true
    })

    softDeleteApplications.mockResolvedValue({})

    const { expressHandler } = await import('../../api/applications/[id].js')

    const req = {
      method: 'DELETE',
      query: { id: 'to-delete' },
      headers: {}
    }

    const res = createResponse()

    await expressHandler(req as any, res as any)

    expect(softDeleteApplications).toHaveBeenCalledWith(['to-delete'])
    expect(res.statusCode).toBe(204)
    expect(res.ended).toBe(true)
  })
})
