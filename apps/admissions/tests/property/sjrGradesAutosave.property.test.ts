/**
 * R6-b properties: grades are saved by the draft machine, and "Saved" is true.
 *
 * Spec: student-journey-repair task 3.23, clauses 2.33 and 2.34.
 *
 * Over generated sequences of grid edits and quiet periods, with a server that
 * stores the last grade set it was sent:
 *
 *   1. whenever the page would say "Saved", nothing is pending, and the
 *      server's grade set is the grid's savable rows (so a reload shows the same
 *      grades);
 *   2. once the machine is quiet, the server holds the last grid, however many
 *      edits came before it;
 *   3. an edit sequence that ends on the baseline sends nothing at all.
 *
 * Task invariants checked with fast-check, not numbered spec properties.
 */
import * as fc from 'fast-check'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WIZARD_DRAFT_DEBOUNCE_MS, deriveWizardDraftSaveView } from '@/lib/wizardDraftController'
import { projectWizardGrades } from '@/pages/student/applicationWizard/lib/draftGrades'
import { createDraftHarness, settle } from '../unit/__fixtures__/wizardDraftHarness'

type GradeRow = { subject_id: string; grade: number }
const id = (n: number) => `0000000${n}-0000-4000-8000-00000000000${n}`.slice(-36)

const gridArb = fc
  .array(
    fc.record({
      subject_id: fc.oneof(fc.integer({ min: 1, max: 9 }).map(id), fc.constant(''), fc.constant('Biology')),
      grade: fc.integer({ min: 0, max: 9 }),
    }),
    { maxLength: 10 },
  )
  .map((rows) => rows as GradeRow[])

const stepArb = fc.oneof(
  fc.record({ kind: fc.constant('edit' as const), grid: gridArb }),
  fc.record({ kind: fc.constant('wait' as const) }),
)

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

function build() {
  const h = createDraftHarness()
  const state = { grid: [] as GradeRow[] }
  let serverRows: GradeRow[] = []
  const sent: GradeRow[][] = []
  const adapters = h.adapters as unknown as Record<string, unknown>
  adapters.projectGrades = () => projectWizardGrades(state.grid)
  adapters.syncGrades = async (_id: string, rows: GradeRow[]) => {
    sent.push(rows)
    serverRows = rows
  }
  h.machine.activate()
  h.hydrate()
  h.machine.setGradesBaseline([])
  return {
    h,
    sent,
    server: () => serverRows,
    edit(grid: GradeRow[]) {
      state.grid = grid
      h.machine.observe()
    },
    async wait() {
      await vi.advanceTimersByTimeAsync(WIZARD_DRAFT_DEBOUNCE_MS)
      await settle()
    },
    state,
  }
}

const key = (rows: GradeRow[]) => JSON.stringify([...rows].sort((a, b) => a.subject_id.localeCompare(b.subject_id)))

describe('(R6-b) grades autosave', () => {
  it('"Saved" is only ever shown when the server holds the grid, and the server converges on the last grid', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(stepArb, { minLength: 1, maxLength: 8 }), async (steps) => {
        const run = build()
        try {
          for (const step of steps) {
            if (step.kind === 'edit') run.edit(step.grid)
            else await run.wait()
            const snapshot = run.h.machine.getSnapshot()
            const view = deriveWizardDraftSaveView(snapshot)
            if (view.status === 'saved') {
              expect(snapshot.pending).toBe(false)
              expect(key(run.server())).toBe(key(projectWizardGrades(run.state.grid).rows))
            }
          }
          await run.wait()
          await run.wait()
          expect(key(run.server())).toBe(key(projectWizardGrades(run.state.grid).rows))
          expect(run.h.machine.getSnapshot().pending).toBe(false)
        } finally {
          run.h.machine.dispose()
        }
      }),
      { numRuns: 60 },
    )
  })

  it('an edit sequence that ends on the baseline sends nothing', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(gridArb, { minLength: 1, maxLength: 5 }), async (grids) => {
        const run = build()
        try {
          for (const grid of grids) run.edit(grid)
          run.edit([])
          await run.wait()
          await run.wait()
          expect(run.sent).toEqual([])
          expect(run.h.machine.getSnapshot().pending).toBe(false)
        } finally {
          run.h.machine.dispose()
        }
      }),
      { numRuns: 40 },
    )
  })
})
