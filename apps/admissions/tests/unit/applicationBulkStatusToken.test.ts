/**
 * Regression guard for the bulk-status confirmation token.
 *
 * The admin bulk-status endpoint (`POST /api/v1/applications/bulk-status/`)
 * rejects any request whose `confirmation_token` does not equal
 * `SHA-256(sorted_ids_joined + new_status)` -- see
 * backend/apps/applications/admin_bulk_views.py:
 *
 *     sorted_ids = sorted(str(aid) for aid in app_ids)
 *     expected = hashlib.sha256(("".join(sorted_ids) + new_status).encode()).hexdigest()
 *
 * A prior regression shipped `bulkStatus()` WITHOUT computing this token, so
 * every admin bulk operation failed in production with
 * `INVALID_CONFIRMATION_TOKEN`. This test pins the client-side computation to
 * an independent reference implementation of the backend algorithm so the
 * two can never silently drift again.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'

const mockRequest = vi.fn().mockResolvedValue({})
vi.mock('@/services/client', () => ({
  apiClient: { request: mockRequest },
  AuthenticationError: class extends Error {},
}))

const { applicationService } = await import('@/services/applications')

/** Independent reference matching backend admin_bulk_views.py exactly. */
function backendExpectedToken(applicationIds: string[], newStatus: string): string {
  const sortedIds = [...applicationIds].map(String).sort()
  return createHash('sha256').update(sortedIds.join('') + newStatus).digest('hex')
}

function lastBody(): Record<string, unknown> {
  const call = mockRequest.mock.calls[mockRequest.mock.calls.length - 1]
  const opts = call[1] as { body: string }
  return JSON.parse(opts.body) as Record<string, unknown>
}

describe('applicationService.bulkStatus confirmation token', () => {
  beforeEach(() => {
    mockRequest.mockClear()
    mockRequest.mockResolvedValue({})
  })

  it('sends a confirmation_token matching the backend SHA-256 algorithm', async () => {
    const ids = ['app-3', 'app-1', 'app-2']
    const status = 'approved'

    await applicationService.bulkStatus({ applicationIds: ids, status })

    const body = lastBody()
    expect(body.confirmation_token).toBe(backendExpectedToken(ids, status))
  })

  it('is order-independent: token is identical regardless of input ID ordering', async () => {
    const status = 'rejected'

    await applicationService.bulkStatus({ applicationIds: ['b', 'a', 'c'], status })
    const tokenA = lastBody().confirmation_token

    await applicationService.bulkStatus({ applicationIds: ['c', 'b', 'a'], status })
    const tokenB = lastBody().confirmation_token

    expect(tokenA).toBe(tokenB)
    expect(tokenA).toBe(backendExpectedToken(['a', 'b', 'c'], status))
  })

  it('token changes when the target status changes', async () => {
    const ids = ['x', 'y']

    await applicationService.bulkStatus({ applicationIds: ids, status: 'approved' })
    const approvedToken = lastBody().confirmation_token

    await applicationService.bulkStatus({ applicationIds: ids, status: 'rejected' })
    const rejectedToken = lastBody().confirmation_token

    expect(approvedToken).not.toBe(rejectedToken)
  })

  it('posts the canonical payload shape the backend expects', async () => {
    await applicationService.bulkStatus({
      applicationIds: ['app-1'],
      status: 'under_review',
      notes: 'batch triage',
    })

    const url = mockRequest.mock.calls[0][0] as string
    expect(url).toBe('/applications/bulk-status/')

    const body = lastBody()
    expect(body.application_ids).toEqual(['app-1'])
    expect(body.new_status).toBe('under_review')
    expect(body.notes).toBe('batch triage')
    expect(typeof body.confirmation_token).toBe('string')
    expect((body.confirmation_token as string).length).toBe(64) // SHA-256 hex
  })
})
