/**
 * Property tests for the draft machine's runtime (admissions-v2 task 6.3).
 *
 * Task invariants, not numbered design properties (task 6.3 has no numbered PBT
 * sub-task; this follows the convention task 8.3 used). Each property drives the
 * machine with an arbitrary interleaving of student edits (including undoing an
 * edit), non-answer form changes, Save now, step navigation, Continue, network
 * loss and recovery, injected server failures, lost responses and time, against
 * a fake server that implements the canonical draft contract.
 *
 * Validates: Requirements R10.2 (one owner), R10.3 (versioned, idempotent,
 * conflict never silently resolved), R10.7 (offline/retry without duplicate
 * requests).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fc from 'fast-check'

import { WIZARD_DRAFT_AUTOSAVE_INTERVAL_MS } from '@/lib/wizardDraftController'
import { fingerprintDraftProjection } from '@/lib/wizardDraftProjection'
import {
  DRAFT_ANSWER_FIELDS,
  projectDraftAnswers,
} from '@/pages/student/applicationWizard/lib/draftAutosave'
import { createDraftHarness, settle } from '../unit/__fixtures__/wizardDraftHarness'

type Op =
  | { kind: 'edit'; field: 'residence_town' | 'next_of_kin_name' | 'phone'; value: string }
  | { kind: 'quiet'; field: 'program' | 'intake'; value: string }
  | { kind: 'saveNow' }
  | { kind: 'flush' }
  | { kind: 'commit' }
  | { kind: 'offline' }
  | { kind: 'online' }
  | { kind: 'advance'; ms: number }
  | { kind: 'fail' }
  | { kind: 'lose' }

const editValues = {
  // The hydrated value is in each pool, so a sequence can undo an edit.
  residence_town: ['Kabwe', 'Lusaka', 'Ndola'],
  next_of_kin_name: ['Next Of Kin', 'Another Kin'],
  phone: ['+260971234567', '+260979999999'],
} as const

const arbOp: fc.Arbitrary<Op> = fc.oneof(
  { weight: 5, arbitrary: fc.constantFrom(...(Object.keys(editValues) as Array<keyof typeof editValues>)).chain((field) =>
      fc.constantFrom(...editValues[field]).map((value) => ({ kind: 'edit' as const, field, value })),
    ) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('quiet' as const), field: fc.constantFrom('program' as const, 'intake' as const), value: fc.constantFrom('a', 'b') }) },
  { weight: 2, arbitrary: fc.constant({ kind: 'saveNow' as const }) },
  { weight: 2, arbitrary: fc.constant({ kind: 'flush' as const }) },
  { weight: 1, arbitrary: fc.constant({ kind: 'commit' as const }) },
  { weight: 1, arbitrary: fc.constant({ kind: 'offline' as const }) },
  { weight: 1, arbitrary: fc.constant({ kind: 'online' as const }) },
  { weight: 4, arbitrary: fc.constantFrom(0, 500, 2_000, 8_000).map((ms) => ({ kind: 'advance' as const, ms })) },
  { weight: 1, arbitrary: fc.constant({ kind: 'fail' as const }) },
  { weight: 1, arbitrary: fc.constant({ kind: 'lose' as const }) },
)

/** Dense sequences: lengths spread uniformly up to 40, so most runs write several times. */
const arbOps = fc.array(arbOp, { minLength: 5, maxLength: 40, size: 'max' })

const pickAnswers = (source: Record<string, unknown>) => {
  const out: Record<string, unknown> = {}
  for (const field of DRAFT_ANSWER_FIELDS) out[field] = source[field]
  return out
}

async function run(ops: Op[]) {
  const h = createDraftHarness()
  h.machine.activate()
  h.hydrate()
  const keyToCommand = new Map<string, string>()
  let keyReusedAcrossCommands = false
  let sameValueWrites = 0
  const originalUpdate = h.server.update.bind(h.server)
  h.server.update = async (applicationId, payload, expectedVersion, key, client) => {
    const command = `${expectedVersion}|${fingerprintDraftProjection(pickAnswers(payload))}`
    const known = keyToCommand.get(key)
    if (known !== undefined && known !== command) keyReusedAcrossCommands = true
    keyToCommand.set(key, command)
    const isReplay = h.server.replay.has(key)
    if (
      !isReplay &&
      expectedVersion === h.server.version &&
      fingerprintDraftProjection(pickAnswers(payload)) === fingerprintDraftProjection(pickAnswers(h.server.answers))
    ) {
      sameValueWrites += 1
    }
    return originalUpdate(applicationId, payload, expectedVersion, key, client)
  }

  for (const op of ops) {
    switch (op.kind) {
      case 'edit':
        h.edit(op.field, op.value)
        break
      case 'quiet':
        h.setQuietly(op.field, op.value)
        break
      case 'saveNow':
        await h.machine.saveNow()
        break
      case 'flush':
        await h.machine.flush()
        break
      case 'commit':
        await h.machine.commit().catch(() => undefined)
        break
      case 'offline':
        h.setOnline(false)
        break
      case 'online':
        h.setOnline(true)
        break
      case 'advance':
        await vi.advanceTimersByTimeAsync(op.ms)
        break
      case 'fail':
        h.server.failures.push(Object.assign(new Error('Service unavailable'), { status: 503 }))
        break
      case 'lose':
        h.server.loseNextResponses += 1
        break
    }
    await settle()
  }
  return { h, sameValueWrites: () => sameValueWrites, keyReusedAcrossCommands: () => keyReusedAcrossCommands }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('draft machine runtime — invariants over arbitrary interleavings', () => {
  it('never sends a same-value write: every new command changes the answers the server holds', async () => {
    let writes = 0
    let navigations = 0
    await fc.assert(
      fc.asyncProperty(arbOps, async (ops) => {
        const { h, sameValueWrites } = await run(ops)
        expect(sameValueWrites()).toBe(0)
        writes += h.server.updateCalls.length
        navigations += ops.filter((op) => op.kind === 'flush' || op.kind === 'saveNow' || op.kind === 'commit').length
        h.machine.dispose()
      }),
      { numRuns: 150 },
    )
    // The property must have been exercised, not vacuously true.
    expect(writes).toBeGreaterThan(150)
    expect(navigations).toBeGreaterThan(300)
  })

  it('keeps at most one draft command in flight and never reuses a key for a different command', async () => {
    await fc.assert(
      fc.asyncProperty(arbOps, async (ops) => {
        const { h, keyReusedAcrossCommands } = await run(ops)
        expect(h.server.maxInFlight).toBeLessThanOrEqual(1)
        expect(keyReusedAcrossCommands()).toBe(false)
        h.machine.dispose()
      }),
      { numRuns: 150 },
    )
  })

  it('with no other writer, never sends a stale version and advances the row once per change', async () => {
    await fc.assert(
      fc.asyncProperty(arbOps, async (ops) => {
        const { h } = await run(ops)
        const versionsSeen = h.server.updateCalls.map((call) => call.expectedVersion)
        for (let i = 1; i < versionsSeen.length; i += 1) {
          expect(versionsSeen[i]!).toBeGreaterThanOrEqual(versionsSeen[i - 1]!)
        }
        expect(h.machine.getSnapshot().state).not.toBe('conflict')
        h.machine.dispose()
      }),
      { numRuns: 150 },
    )
  })

  it('loses no work: once back online and given time, the server holds exactly the student’s answers', async () => {
    await fc.assert(
      fc.asyncProperty(arbOps, async (ops) => {
        const { h } = await run(ops)
        h.server.failures = []
        h.setOnline(true)
        await vi.advanceTimersByTimeAsync(WIZARD_DRAFT_AUTOSAVE_INTERVAL_MS * 8)
        await settle()
        expect(fingerprintDraftProjection(pickAnswers(h.server.answers))).toBe(
          fingerprintDraftProjection(pickAnswers(projectDraftAnswers(h.values))),
        )
        expect(h.machine.getSnapshot()).toMatchObject({ state: 'ready.clean', hasUnsyncedWork: false })
        h.machine.dispose()
      }),
      { numRuns: 150 },
    )
  })

  it('a version conflict is terminal: nothing is written after it until the student resolves it', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbOp, { minLength: 3, maxLength: 15, size: 'max' }),
        fc.array(arbOp, { minLength: 3, maxLength: 15, size: 'max' }),
        async (before, after) => {
          const { h } = await run(before)
          h.server.failures = []
          h.server.loseNextResponses = 0
          h.setOnline(true)
          await vi.advanceTimersByTimeAsync(WIZARD_DRAFT_AUTOSAVE_INTERVAL_MS * 8)
          await settle()
          // Another device wins, then this one edits from its stale version.
          h.server.writeFromAnotherDevice({ residence_town: 'Other device' })
          const winnerAnswers = { ...h.server.answers }
          h.edit('next_of_kin_name', 'Stale device edit')
          await vi.advanceTimersByTimeAsync(WIZARD_DRAFT_AUTOSAVE_INTERVAL_MS)
          await settle()
          expect(h.machine.getSnapshot().state).toBe('conflict')
          const callsAtConflict = h.server.updateCalls.length
          for (const op of after) {
            if (op.kind === 'edit') h.edit(op.field, op.value)
            else if (op.kind === 'saveNow') await h.machine.saveNow()
            else if (op.kind === 'flush') await h.machine.flush()
            else if (op.kind === 'commit') await h.machine.commit().catch(() => undefined)
            else if (op.kind === 'advance') await vi.advanceTimersByTimeAsync(op.ms)
            else if (op.kind === 'online') h.setOnline(true)
            else if (op.kind === 'offline') h.setOnline(false)
            await settle()
          }
          expect(h.server.updateCalls.length).toBe(callsAtConflict)
          expect(h.server.answers).toEqual(winnerAnswers)
          expect(h.machine.getSnapshot().state).toBe('conflict')
          h.machine.dispose()
        },
      ),
      { numRuns: 100 },
    )
  })
})
