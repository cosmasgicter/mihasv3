/**
 * Frontend service test — the change-selection (reroute) wire contract.
 *
 * Spec: .kiro/specs/admissions-v2-canonical-rebuild/ — task 6.4.
 * Requirements: R7.2, R10.5 · Findings: STU-01, DATA-01.
 * Design: design.md §7.2 — the generic PATCH never carries assignment
 * identifiers or display snapshots; one reroute command moves the assignment.
 *
 * Pins the CLIENT half of the reroute contract:
 *
 *   - `changeSelection` POSTs `/applications/drafts/{id}/change-selection/`
 *     with canonical ids only (never a programme/intake display string) and an
 *     `Idempotency-Key`, with the client's own retry loop disabled so a retry
 *     replays the command rather than duplicating it (design §14.2);
 *   - the optional optimistic `assignment_version` is forwarded when known and
 *     omitted otherwise (R10.3).
 *
 * The server behaviour (transactional reroute, rollback, payment block,
 * cross-tenant denial) is proven by
 * `backend/tests/integration/test_change_selection_6_4.py`.
 *
 * Validates: Requirements R7.2, R10.5
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const requestMock = vi.fn()

vi.mock('@/services/client', () => ({
  apiClient: { request: requestMock },
  buildQueryString: () => '',
}))

beforeEach(() => {
  requestMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('applicationService.changeSelection — the one reroute command (task 6.4)', () => {
  it('POSTs canonical ids to the change-selection endpoint with an Idempotency-Key and no client retries', async () => {
    requestMock.mockResolvedValue({ id: 'app-1', status: 'draft', program_id: 'prog-b' })
    const { applicationService } = await import('@/services/applications')

    const result = await applicationService.changeSelection('app-1', {
      programId: 'prog-b',
      intakeId: 'intake-b',
    })

    expect(requestMock).toHaveBeenCalledTimes(1)
    const [endpoint, options] = requestMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(endpoint).toBe('/applications/drafts/app-1/change-selection/')
    expect(options.method).toBe('POST')
    expect(options.retries).toBe(0)
    const headers = options.headers as Record<string, string>
    expect(typeof headers['Idempotency-Key']).toBe('string')
    expect(headers['Idempotency-Key'].length).toBeGreaterThan(0)
    // Canonical ids only — no display strings on the wire.
    const body = JSON.parse(options.body as string)
    expect(body).toEqual({ program_id: 'prog-b', intake_id: 'intake-b' })
    expect(result?.id).toBe('app-1')
  })

  it('forwards the optimistic assignment_version when the client knows it', async () => {
    requestMock.mockResolvedValue({ id: 'app-1', status: 'draft' })
    const { applicationService } = await import('@/services/applications')

    await applicationService.changeSelection('app-1', {
      programId: 'p',
      intakeId: 'i',
      assignmentVersion: 3,
    })

    const [, options] = requestMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(JSON.parse(options.body as string)).toEqual({
      program_id: 'p',
      intake_id: 'i',
      assignment_version: 3,
    })
  })

  it('uses a caller-supplied idempotency key verbatim', async () => {
    requestMock.mockResolvedValue({ id: 'app-1', status: 'draft' })
    const { applicationService } = await import('@/services/applications')

    await applicationService.changeSelection(
      'app-1',
      { programId: 'p', intakeId: 'i' },
      'stable-reroute-key',
    )

    const [, options] = requestMock.mock.calls[0] as [string, Record<string, unknown>]
    expect((options.headers as Record<string, string>)['Idempotency-Key']).toBe('stable-reroute-key')
  })

  it('URL-encodes the application id path segment', async () => {
    requestMock.mockResolvedValue({ id: 'x', status: 'draft' })
    const { applicationService } = await import('@/services/applications')

    await applicationService.changeSelection('a b/c', { programId: 'p', intakeId: 'i' })

    const [endpoint] = requestMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(endpoint).toBe('/applications/drafts/a%20b%2Fc/change-selection/')
  })

  it('propagates a rejection so the caller can resolve recovery guidance', async () => {
    const failure = Object.assign(new Error('locked'), {
      status: 409,
      data: { code: 'ASSIGNMENT_LOCKED_BY_PAYMENT' },
    })
    requestMock.mockRejectedValue(failure)
    const { applicationService } = await import('@/services/applications')

    await expect(
      applicationService.changeSelection('app-1', { programId: 'p', intakeId: 'i' }),
    ).rejects.toBe(failure)
  })
})
