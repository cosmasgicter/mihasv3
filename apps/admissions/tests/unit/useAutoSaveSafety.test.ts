/**
 * Autosave safety invariants (originally pinned on `src/hooks/useAutoSave.ts`).
 *
 * Admissions-v2 task 6.3 retired `useAutoSave` — by then it had no production
 * importer, and keeping it meant a second idea of "the draft" beside the one
 * draft machine R10.2 requires. The four invariants this file has always
 * guarded are now asserted on that machine (`lib/wizardDraftController.ts`),
 * behaviourally where the old file could only read source text.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import path from 'path'

import {
  WIZARD_DRAFT_AUTOSAVE_INTERVAL_MS,
  WIZARD_DRAFT_DEBOUNCE_MS,
} from '@/lib/wizardDraftController'
import { createDraftHarness, settle } from './__fixtures__/wizardDraftHarness'

const CONTROLLER_PATH = path.resolve(process.cwd(), 'src/lib/wizardDraftController.ts')
const controllerSource = fs.readFileSync(CONTROLLER_PATH, 'utf-8')

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('autosave safety invariants (the draft machine)', () => {
  it('preserves the required 8-second autosave interval', async () => {
    expect(WIZARD_DRAFT_AUTOSAVE_INTERVAL_MS).toBe(8000)
    expect(controllerSource).toContain('this.timers.setInterval(() => this.tick(), WIZARD_DRAFT_AUTOSAVE_INTERVAL_MS)')

    // And the sweep really writes pending work on that cadence when no debounce
    // was scheduled (the edit landed before the machine was activated).
    const h = createDraftHarness()
    h.hydrate()
    h.edit('residence_town', 'Interval town')
    h.machine.activate()
    await vi.advanceTimersByTimeAsync(WIZARD_DRAFT_AUTOSAVE_INTERVAL_MS - 1)
    await settle()
    expect(h.server.updateCalls).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    await settle()
    expect(h.server.updateCalls).toHaveLength(1)
  })

  it('guards against overlapping autosave requests', async () => {
    const h = createDraftHarness()
    h.machine.activate()
    h.hydrate()
    const release = h.server.holdWrites()
    h.edit('residence_town', 'One')
    await vi.advanceTimersByTimeAsync(WIZARD_DRAFT_DEBOUNCE_MS)
    await settle()
    h.edit('residence_town', 'Two')
    // Save now, Save now again and a step change while one write is in flight.
    void h.machine.saveNow()
    void h.machine.saveNow()
    void h.machine.flush()
    await vi.advanceTimersByTimeAsync(WIZARD_DRAFT_AUTOSAVE_INTERVAL_MS)
    await settle()
    release()
    await settle()
    await vi.advanceTimersByTimeAsync(WIZARD_DRAFT_DEBOUNCE_MS)
    await settle()
    expect(h.server.maxInFlight).toBe(1)
    expect(h.server.answers.residence_town).toBe('Two')
  })

  it('does not clear drafts automatically on route changes', () => {
    // The machine has no knowledge of the route; nothing it does is keyed to a pathname.
    expect(controllerSource).not.toMatch(/location\.pathname|useLocation/)
    // And the retired owner, whose storage key was the pathname, is gone.
    expect(fs.existsSync(path.resolve(process.cwd(), 'src/hooks/useAutoSave.ts'))).toBe(false)
  })

  it('treats VERSION_CONFLICT as a terminal reload/merge state, not an offline retry', async () => {
    const h = createDraftHarness()
    h.machine.activate()
    h.hydrate()
    h.server.writeFromAnotherDevice({ residence_town: 'Winner' })
    h.edit('residence_town', 'Stale')
    await vi.advanceTimersByTimeAsync(WIZARD_DRAFT_DEBOUNCE_MS)
    await settle()
    expect(h.machine.getSnapshot().state).toBe('conflict')
    h.setOnline(false)
    h.setOnline(true)
    await vi.advanceTimersByTimeAsync(WIZARD_DRAFT_AUTOSAVE_INTERVAL_MS * 4)
    await settle()
    expect(h.server.updateCalls).toHaveLength(1)
    expect(h.machine.getSnapshot().state).toBe('conflict')
    // No local timestamp heuristic decides conflicts any more.
    expect(controllerSource).not.toContain('detectConflict')
  })
})
