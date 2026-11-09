/**
 * The draft machine's grades channel beyond the exploration cases (SJR task
 * 3.23, R6-b): what it does when the write fails, in what order it writes, and
 * what a rejected or unsaveable grid looks like.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  WIZARD_DRAFT_DEBOUNCE_MS,
  WIZARD_DRAFT_MESSAGES,
  deriveWizardDraftSaveView,
} from '@/lib/wizardDraftController'
import { createDraftHarness, settle } from './__fixtures__/wizardDraftHarness'
import { deriveWizardPageSaveView } from '@/pages/student/applicationWizard/lib/pageSaveView'
import { projectWizardGrades } from '@/pages/student/applicationWizard/lib/draftGrades'

type GradeRow = { subject_id: string; grade: number }
const id = (n: number) => `0000000${n}-0000-4000-8000-00000000000${n}`
const ROWS: GradeRow[] = [1, 2, 3].map((n) => ({ subject_id: id(n), grade: 4 }))

async function advance(ms: number) {
  await vi.advanceTimersByTimeAsync(ms)
  await settle()
}
beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

function grid(sync: (applicationId: string, rows: GradeRow[], key: string) => Promise<void>) {
  const h = createDraftHarness()
  const state = { rows: [] as GradeRow[], unsavable: 0 }
  const syncGrades = vi.fn(sync)
  const adapters = h.adapters as unknown as Record<string, unknown>
  adapters.projectGrades = () => ({ rows: state.rows, unsavableRows: state.unsavable })
  adapters.syncGrades = syncGrades
  h.machine.activate()
  h.hydrate()
  h.machine.setGradesBaseline([])
  return {
    h,
    syncGrades,
    set(rows: GradeRow[]) {
      state.rows = rows
      h.machine.observe()
    },
  }
}

describe('grades channel failures', () => {
  it('keeps the grades pending and retries with the same key after a network failure', async () => {
    let attempt = 0
    const { h, syncGrades, set } = grid(async () => {
      attempt += 1
      if (attempt === 1) throw Object.assign(new Error('Failed to fetch'), { status: 0 })
    })
    set(ROWS)
    await advance(WIZARD_DRAFT_DEBOUNCE_MS)
    expect(syncGrades).toHaveBeenCalledTimes(1)
    expect(h.machine.getSnapshot().pending).toBe(true)
    expect(deriveWizardDraftSaveView(h.machine.getSnapshot()).status).toBe('retrying')
    await advance(1_000)
    expect(syncGrades).toHaveBeenCalledTimes(2)
    const keys = syncGrades.mock.calls.map((call) => (call as unknown as [string, GradeRow[], string])[2])
    expect(keys[0]).toBe(keys[1])
    expect(h.machine.getSnapshot().pending).toBe(false)
    expect(deriveWizardDraftSaveView(h.machine.getSnapshot()).status).toBe('saved')
  })

  it('does not resend a grid the server refused, and never says "Saved" for it', async () => {
    const { h, syncGrades, set } = grid(async () => {
      throw Object.assign(new Error('At least 5 unique valid subjects are required'), { status: 400 })
    })
    set(ROWS)
    await advance(WIZARD_DRAFT_DEBOUNCE_MS)
    expect(syncGrades).toHaveBeenCalledTimes(1)
    await advance(30_000)
    expect(syncGrades).toHaveBeenCalledTimes(1)
    const view = deriveWizardDraftSaveView(h.machine.getSnapshot())
    expect(h.machine.getSnapshot().pending).toBe(true)
    expect(view.status).toBe('error')
    expect(view.message).toMatch(/subjects are required/)
    // A different grid is a new command.
    set([...ROWS, { subject_id: id(4), grade: 5 }])
    await advance(WIZARD_DRAFT_DEBOUNCE_MS)
    expect(syncGrades).toHaveBeenCalledTimes(2)
  })

  it('sends the grid again in full, not a delta, and nothing when the grid returns to the baseline', async () => {
    const { h, syncGrades, set } = grid(async () => undefined)
    set(ROWS)
    await advance(WIZARD_DRAFT_DEBOUNCE_MS)
    expect(syncGrades).toHaveBeenCalledTimes(1)
    set([...ROWS, { subject_id: id(4), grade: 6 }])
    set(ROWS)
    await advance(WIZARD_DRAFT_DEBOUNCE_MS)
    expect(syncGrades).toHaveBeenCalledTimes(1)
    expect(h.machine.getSnapshot().pending).toBe(false)
  })

  it('writes answers before grades on one chain', async () => {
    const order: string[] = []
    const { h, set } = grid(async () => {
      order.push('grades')
    })
    const original = h.adapters.updateDraft
    h.adapters.updateDraft = async (...args: Parameters<typeof original>) => {
      order.push('answers')
      return original(...args)
    }
    h.edit('residence_town', 'Mongu')
    set(ROWS)
    await advance(WIZARD_DRAFT_DEBOUNCE_MS)
    expect(order).toEqual(['answers', 'grades'])
    expect(h.server.maxInFlight).toBe(1)
    expect(h.machine.getSnapshot().pending).toBe(false)
  })

  it('a 404 on the grades write detaches the draft like an answers write does', async () => {
    const { h, set } = grid(async () => {
      throw Object.assign(new Error('Draft not found'), { status: 404 })
    })
    set(ROWS)
    await advance(WIZARD_DRAFT_DEBOUNCE_MS)
    expect(h.machine.getSnapshot().applicationId).toBeNull()
  })

  it('commit() with only grades pending writes them, then confirms with a read', async () => {
    const { h, syncGrades, set } = grid(async () => undefined)
    set(ROWS)
    const record = await h.machine.commit()
    expect(syncGrades).toHaveBeenCalledTimes(1)
    expect(record).toMatchObject({ id: 'app-1' })
    expect(h.server.readCalls.length).toBe(1)
  })

  it('does not treat an empty grid over an empty baseline as a pending change', async () => {
    const { h, syncGrades, set } = grid(async () => undefined)
    set([])
    await advance(WIZARD_DRAFT_DEBOUNCE_MS)
    expect(syncGrades).not.toHaveBeenCalled()
    expect(h.machine.getSnapshot().pending).toBe(false)
  })
})

describe('the grid as the channel sees it', () => {
  it('sends canonical subjects with grades 1 to 9, once each', () => {
    const projected = projectWizardGrades([
      { subject_id: id(1), grade: 3 },
      { subject_id: id(1), grade: 7 },
      { subject_id: id(2), grade: 9 },
    ])
    expect(projected.rows).toEqual([
      { subject_id: id(1), grade: 3 },
      { subject_id: id(2), grade: 9 },
    ])
    expect(projected.unsavableRows).toBe(0)
  })

  it('ignores a row with no subject yet and counts the rest that cannot be sent', () => {
    const projected = projectWizardGrades([
      { subject_id: '', grade: 1 },
      { subject_id: 'Biology', grade: 3 },
      { subject_id: id(1), grade: 0 },
      { subject_id: id(2), grade: 5 },
    ])
    expect(projected.rows).toEqual([{ subject_id: id(2), grade: 5 }])
    expect(projected.unsavableRows).toBe(2)
  })
})

describe('the page save view', () => {
  const saved = { status: 'saved', message: null } as const
  it('shows saving while a document uploads and an error when one failed', () => {
    expect(deriveWizardPageSaveView(saved, { documentsUploading: true, documentsFailed: false })).toEqual({
      status: 'saving',
      message: null,
    })
    expect(deriveWizardPageSaveView(saved, { documentsUploading: false, documentsFailed: true })).toEqual({
      status: 'error',
      message: "A document didn't upload. Try it again.",
    })
  })
  it('passes the machine view through otherwise, and a conflict outranks documents', () => {
    expect(deriveWizardPageSaveView(saved, { documentsUploading: false, documentsFailed: false })).toBe(saved)
    const conflict = { status: 'conflict', message: WIZARD_DRAFT_MESSAGES.versionConflict } as const
    expect(deriveWizardPageSaveView(conflict, { documentsUploading: true, documentsFailed: true })).toBe(conflict)
  })
})
