/**
 * R6 exploration: grades are a draft-machine channel.
 *
 * Spec: student-journey-repair task 1.6, clauses 1.30 and 1.31 (design R6-b).
 *
 * At HEAD the draft machine fingerprints answers only: a grade edit is not an
 * edit, nothing is saved on the debounce, the page says "Saved" while the grades
 * exist only in memory, and the outbox never carries them. The two optional
 * adapters the fix adds (`projectGrades`, `syncGrades`) and the baseline setter
 * (`setGradesBaseline`) are supplied here through the existing fake-server
 * harness; the machine ignores them at HEAD.
 *
 * Markers removed at the R6 checkpoint (task 3.25).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  WIZARD_DRAFT_DEBOUNCE_MS,
  deriveWizardDraftSaveView,
} from '@/lib/wizardDraftController'
import { createDraftHarness, settle } from './__fixtures__/wizardDraftHarness'

type GradeRow = { subject_id: string; grade: number }

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

/** A hydrated draft whose grade grid the test controls. */
function withGrades(initial: GradeRow[] = [], unsavableRows = 0) {
  const h = createDraftHarness()
  const state = { rows: initial, unsavableRows }
  const syncGrades = vi.fn(async () => undefined)
  const adapters = h.adapters as unknown as Record<string, unknown>
  adapters.projectGrades = () => ({ rows: state.rows, unsavableRows: state.unsavableRows })
  adapters.syncGrades = syncGrades
  h.machine.activate()
  h.hydrate()
  ;(h.machine as unknown as { setGradesBaseline?: (rows: GradeRow[]) => void }).setGradesBaseline?.(
    initial,
  )
  return {
    h,
    syncGrades,
    editGrades(rows: GradeRow[]) {
      state.rows = rows
      h.machine.observe()
    },
    setUnsavable(count: number) {
      state.unsavableRows = count
      h.machine.observe()
    },
  }
}

const PARTIAL: GradeRow[] = [
  { subject_id: '00000001-0000-4000-8000-000000000001', grade: 3 },
  { subject_id: '00000002-0000-4000-8000-000000000002', grade: 5 },
]

describe('grades in the draft machine (clauses 1.30, 1.31)', () => {
  it('a grade edit saves within the debounce with the partial rows', async () => {
    const { h, syncGrades, editGrades } = withGrades()

    editGrades(PARTIAL)
    expect(h.machine.getSnapshot().pending).toBe(true)
    await advance(WIZARD_DRAFT_DEBOUNCE_MS)

    expect(syncGrades).toHaveBeenCalledTimes(1)
    const [applicationId, rows, idempotencyKey] = syncGrades.mock.calls[0] as unknown as [
      string,
      GradeRow[],
      string,
    ]
    expect(applicationId).toBe('app-1')
    expect(rows).toEqual(PARTIAL)
    expect(rows.length).toBeLessThan(5) // a half-filled grid is saved, not held back
    expect(typeof idempotencyKey).toBe('string')
  })

  it('never derives "Saved" while grades are pending', async () => {
    const { h, editGrades } = withGrades()

    editGrades(PARTIAL)

    // HEAD: the answers are unchanged, so the machine stays clean and says "saved".
    const view = deriveWizardDraftSaveView(h.machine.getSnapshot())
    expect(h.machine.getSnapshot().pending).toBe(true)
    expect(view.status).not.toBe('saved')
  })

  it('reports rows that cannot be saved yet instead of "Saved"', async () => {
    const { h, setUnsavable } = withGrades(PARTIAL)

    setUnsavable(2)
    await advance(WIZARD_DRAFT_DEBOUNCE_MS)

    const view = deriveWizardDraftSaveView(h.machine.getSnapshot())
    expect(view.status).toBe('error')
    expect(view.message).toBe("Some grade rows can't be saved yet. Fix the highlighted rows.")
  })

  it('keeps pending grades in the outbox while offline', async () => {
    const { h, editGrades } = withGrades()
    h.setOnline(false)

    editGrades(PARTIAL)
    await advance(WIZARD_DRAFT_DEBOUNCE_MS)

    const record = h.outbox.at(-1) as unknown as { grades?: GradeRow[] } | undefined
    expect(record?.grades).toEqual(PARTIAL)
  })
})
