/**
 * Frontend service tests — canonical draft START + rename wire contract.
 *
 * Spec: .kiro/specs/admissions-v2-canonical-rebuild/ — task 6.2.
 * Requirements: R10.1, R10.3, R10.9 · Finding: STU-12.
 *
 * These pin the CLIENT half of the task-6.2 "two-draft start/switch/resume API"
 * evidence at the service boundary:
 *
 *   - `startDraft` POSTs the canonical multi-draft collection
 *     (`/applications/drafts/`) with an `Idempotency-Key` header so a retried
 *     start returns the same draft instead of creating a second row (R10.3),
 *     and never a legacy empty-payload create (finding STU-12);
 *   - `renameDraft` PATCHes the dedicated, validated `draft_name` command
 *     (`/applications/drafts/{id}/rename/`) — never the generic application
 *     update that silently dropped the field before (R10.9, STU-12).
 *
 * The server behaviour is proven by
 * `backend/tests/integration/test_draft_start_list_rename_6_2.py`; the
 * browser/Playwright half is owned by task 13.2 per the spec's E2E/evidence
 * architecture (design §16).
 *
 * `apiClient.request` already unwraps the `{"success": true, "data": ...}`
 * envelope, so the mock resolves the post-unwrap record a service method sees.
 *
 * Validates: Requirements R10.1, R10.3, R10.9
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const requestMock = vi.fn()

vi.mock('@/services/client', () => ({
  apiClient: {
    request: requestMock,
  },
  buildQueryString: (params: Record<string, unknown>) => {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) search.set(key, String(value))
    }
    const qs = search.toString()
    return qs ? `?${qs}` : ''
  },
}))

beforeEach(() => {
  requestMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// startDraft — canonical multi-draft START (R10.1, R10.3, R10.9)
// ---------------------------------------------------------------------------

describe('applicationService.startDraft — canonical multi-draft START (task 6.2)', () => {
  it('POSTs /applications/drafts/ with an auto-generated Idempotency-Key and no retries', async () => {
    requestMock.mockResolvedValue({ id: 'app-1', status: 'draft', draft_name: 'Nursing' })
    const { applicationService } = await import('@/services/applications')

    const result = await applicationService.startDraft({
      program_id: 'prog-1',
      intake_id: 'intake-1',
      status: 'draft',
    } as never)

    expect(requestMock).toHaveBeenCalledTimes(1)
    const [endpoint, options] = requestMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(endpoint).toBe('/applications/drafts/')
    expect(options.method).toBe('POST')
    // A retried start must NOT be silently re-sent by the client's own retry
    // loop — replay protection is the server's Idempotency-Key contract.
    expect(options.retries).toBe(0)
    const headers = options.headers as Record<string, string>
    expect(typeof headers['Idempotency-Key']).toBe('string')
    expect(headers['Idempotency-Key'].length).toBeGreaterThan(0)
    // The body carries the minimum canonical selection (never an empty payload).
    expect(JSON.parse(options.body as string)).toMatchObject({
      program_id: 'prog-1',
      intake_id: 'intake-1',
    })
    // Response normalized to the Application record.
    expect(result?.id).toBe('app-1')
  })

  it('uses a caller-supplied idempotency key verbatim (stable replay protection)', async () => {
    requestMock.mockResolvedValue({ id: 'app-2', status: 'draft' })
    const { applicationService } = await import('@/services/applications')

    await applicationService.startDraft(
      { program_id: 'p', intake_id: 'i' } as never,
      'stable-key-123',
    )

    const [, options] = requestMock.mock.calls[0] as [string, Record<string, unknown>]
    const headers = options.headers as Record<string, string>
    expect(headers['Idempotency-Key']).toBe('stable-key-123')
  })

  it('two distinct starts send two distinct auto-keys (independent drafts)', async () => {
    requestMock.mockResolvedValue({ id: 'x', status: 'draft' })
    const { applicationService } = await import('@/services/applications')

    await applicationService.startDraft({ program_id: 'a', intake_id: 'a' } as never)
    await applicationService.startDraft({ program_id: 'b', intake_id: 'b' } as never)

    const k1 = (requestMock.mock.calls[0][1] as { headers: Record<string, string> }).headers['Idempotency-Key']
    const k2 = (requestMock.mock.calls[1][1] as { headers: Record<string, string> }).headers['Idempotency-Key']
    expect(k1).not.toBe(k2)
  })
})

// ---------------------------------------------------------------------------
// updateDraft — optimistic, idempotent answer mutation (R10.3)
// ---------------------------------------------------------------------------

describe('applicationService.updateDraft — versioned draft answers (task 6.3)', () => {
  it('PATCHes the canonical draft route with the exact key, version and no client retries', async () => {
    requestMock.mockResolvedValue({ id: 'draft/a', status: 'draft', version: 8 })
    const { applicationService } = await import('@/services/applications')

    const result = await applicationService.updateDraft(
      'draft/a',
      { full_name: 'Updated Student', residence_town: 'Ndola' },
      7,
      'stable-update-key',
    )

    expect(requestMock).toHaveBeenCalledTimes(1)
    const [endpoint, options] = requestMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(endpoint).toBe('/applications/drafts/draft%2Fa/')
    expect(options.method).toBe('PATCH')
    expect(options.retries).toBe(0)
    expect(options.headers).toEqual({ 'Idempotency-Key': 'stable-update-key' })
    expect(JSON.parse(options.body as string)).toEqual({
      full_name: 'Updated Student',
      residence_town: 'Ndola',
      expected_version: 7,
    })
    expect(result?.version).toBe(8)
  })
})

// ---------------------------------------------------------------------------
// renameDraft — validated draft_name command (R10.9, STU-12)
// ---------------------------------------------------------------------------

describe('applicationService.renameDraft — validated draft_name command (task 6.2, R10.9)', () => {
  it('PATCHes the dedicated /rename/ endpoint with only draft_name', async () => {
    requestMock.mockResolvedValue({ id: 'app-1', status: 'draft', draft_name: 'Plan B' })
    const { applicationService } = await import('@/services/applications')

    const result = await applicationService.renameDraft('app-1', 'Plan B')

    expect(requestMock).toHaveBeenCalledTimes(1)
    const [endpoint, options] = requestMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(endpoint).toBe('/applications/drafts/app-1/rename/')
    expect(options.method).toBe('PATCH')
    // Only the label crosses the wire — never assignment identifiers (design §7.2).
    expect(JSON.parse(options.body as string)).toEqual({ draft_name: 'Plan B' })
    expect(result?.draft_name).toBe('Plan B')
  })

  it('URL-encodes the application id path segment', async () => {
    requestMock.mockResolvedValue({ id: 'a b', status: 'draft' })
    const { applicationService } = await import('@/services/applications')

    await applicationService.renameDraft('a b/c', 'Name')

    const [endpoint] = requestMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(endpoint).toBe('/applications/drafts/a%20b%2Fc/rename/')
  })
})
