/**
 * Frontend hook tests — useMultiDraft start/rename guards + error surfacing.
 *
 * Spec: .kiro/specs/admissions-v2-canonical-rebuild/ — task 6.2.
 * Requirements: R10.1, R10.3, R10.9 · Finding: STU-12.
 *
 * Finding STU-12 (P0) was: "Multi-draft create sends an empty payload despite
 * required fields, rename sends an unsupported field, errors are suppressed".
 * These assert the closed behaviour at the hook level — the multi-draft manager
 * that DraftManager.tsx consumes:
 *
 *   - `createDraft` refuses to start without the minimum canonical selection
 *     (`program_id` + `intake_id`) and never calls the server with an empty
 *     payload (R10.9);
 *   - a valid start delegates to the canonical `startDraft` command and clears
 *     the error;
 *   - server errors are surfaced (never suppressed);
 *   - `renameDraft` refuses a blank label, delegates to the dedicated rename
 *     command with a trimmed value, and surfaces server errors.
 *
 * The wire contract is covered by multiDraftService.test.ts and the server
 * behaviour by backend/tests/integration/test_draft_start_list_rename_6_2.py;
 * the browser/Playwright half is owned by task 13.2 (design §16).
 *
 * Validates: Requirements R10.1, R10.3, R10.9
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const listMock = vi.fn()
const startDraftMock = vi.fn()
const renameDraftMock = vi.fn()
const updateMock = vi.fn()
const deleteMock = vi.fn()
const getByIdMock = vi.fn()

vi.mock('@/services/applications', () => ({
  applicationService: {
    list: listMock,
    startDraft: startDraftMock,
    renameDraft: renameDraftMock,
    update: updateMock,
    delete: deleteMock,
    getById: getByIdMock,
  },
}))

// The hook refetches when the unified draft store's revision changes; pin it so
// the effect is deterministic and never triggers an extra network cycle.
vi.mock('@/stores/draftStore', () => ({
  useDraftRevision: () => 0,
}))

beforeEach(() => {
  listMock.mockReset().mockResolvedValue({ applications: [] })
  startDraftMock.mockReset()
  renameDraftMock.mockReset()
  updateMock.mockReset()
  deleteMock.mockReset()
  getByIdMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function mountHook() {
  const { useMultiDraft } = await import(
    '@/pages/student/applicationWizard/hooks/useMultiDraft'
  )
  const view = renderHook(() => useMultiDraft('user-1'))
  // The initial mount fetch settles before we exercise the commands.
  await waitFor(() => expect(listMock).toHaveBeenCalled())
  return view
}

// ---------------------------------------------------------------------------
// createDraft — minimum canonical selection + error surfacing (STU-12)
// ---------------------------------------------------------------------------

describe('useMultiDraft.createDraft — minimum canonical selection (STU-12)', () => {
  it('refuses to start without program_id + intake_id and never calls the server', async () => {
    const { result } = await mountHook()

    let started: unknown
    await act(async () => {
      started = await result.current.createDraft({ full_name: 'No selection' })
    })

    expect(started).toBeNull()
    expect(startDraftMock).not.toHaveBeenCalled()
    expect(result.current.error).toMatch(/programme and intake/i)
  })

  it('starts with a valid canonical selection and clears the error', async () => {
    startDraftMock.mockResolvedValue({ id: 'app-1', status: 'draft' })
    const { result } = await mountHook()

    await act(async () => {
      await result.current.createDraft({ program_id: 'p', intake_id: 'i' })
    })

    expect(startDraftMock).toHaveBeenCalledTimes(1)
    expect(startDraftMock.mock.calls[0][0]).toMatchObject({
      program_id: 'p',
      intake_id: 'i',
      status: 'draft',
    })
    expect(result.current.error).toBeNull()
  })

  it('surfaces a server error instead of suppressing it', async () => {
    startDraftMock.mockRejectedValue(
      new Error('A non-terminal application already exists for this program and intake.'),
    )
    const { result } = await mountHook()

    let started: unknown
    await act(async () => {
      started = await result.current.createDraft({ program_id: 'p', intake_id: 'i' })
    })

    expect(started).toBeNull()
    expect(result.current.error).toMatch(/already exists/i)
  })
})

// ---------------------------------------------------------------------------
// renameDraft — validated label + error surfacing (R10.9, STU-12)
// ---------------------------------------------------------------------------

describe('useMultiDraft.renameDraft — validated label (R10.9, STU-12)', () => {
  it('refuses a blank name and never calls the server', async () => {
    const { result } = await mountHook()

    await act(async () => {
      await result.current.renameDraft('app-1', '   ')
    })

    expect(renameDraftMock).not.toHaveBeenCalled()
    expect(result.current.error).toMatch(/name/i)
  })

  it('renames via the dedicated command with a trimmed value and clears the error', async () => {
    renameDraftMock.mockResolvedValue({ id: 'app-1', draft_name: 'Plan B' })
    const { result } = await mountHook()

    await act(async () => {
      await result.current.renameDraft('app-1', '  Plan B  ')
    })

    expect(renameDraftMock).toHaveBeenCalledWith('app-1', 'Plan B')
    expect(result.current.error).toBeNull()
  })

  it('surfaces a server error on rename failure', async () => {
    renameDraftMock.mockRejectedValue(new Error('Draft not found'))
    const { result } = await mountHook()

    await act(async () => {
      await result.current.renameDraft('app-1', 'X')
    })

    expect(result.current.error).toMatch(/not found/i)
  })
})
