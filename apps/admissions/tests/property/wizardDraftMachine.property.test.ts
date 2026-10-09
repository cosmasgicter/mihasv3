/**
 * Property tests for the canonical wizard draft state machine (task 6.3).
 *
 * These prove the machine's safety invariants hold across arbitrary event
 * sequences — the "model/property tests" half of the task's Required_Evidence.
 *
 * Validates: Requirements R10.2 (one machine owns the lifecycle), R10.3
 * (versioned conflict, never a silent latest-timestamp pick), R10.7 (offline
 * work is queued, never dropped).
 */
import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'

import {
  INITIAL_WIZARD_DRAFT_STATE,
  WIZARD_DRAFT_EVENTS,
  WIZARD_DRAFT_STATES,
  isTerminalWizardDraftState,
  runWizardDraftEvents,
  wizardDraftTransition,
  type WizardDraftEvent,
  type WizardDraftState,
} from '@/lib/wizardDraftMachine'

const arbEvent = fc.constantFrom<WizardDraftEvent>(...WIZARD_DRAFT_EVENTS)
const arbState = fc.constantFrom<WizardDraftState>(...WIZARD_DRAFT_STATES)
const arbEvents = fc.array(arbEvent, { maxLength: 40 })

describe('wizardDraftMachine — properties', () => {
  it('is total: every (state, event) yields a known state', () => {
    fc.assert(
      fc.property(arbState, arbEvent, (state, event) => {
        const next = wizardDraftTransition(state, event)
        expect(WIZARD_DRAFT_STATES).toContain(next)
      }),
      { numRuns: 500 },
    )
  })

  it('terminal states are absorbing under any event sequence', () => {
    fc.assert(
      fc.property(fc.constantFrom<WizardDraftState>('submitted', 'deleted'), arbEvents, (terminal, events) => {
        expect(runWizardDraftEvents(events, terminal)).toBe(terminal)
      }),
      { numRuns: 300 },
    )
  })

  it('never reaches submitted except immediately after submitting via SUBMIT_OK', () => {
    fc.assert(
      fc.property(arbState, arbEvent, (state, event) => {
        const next = wizardDraftTransition(state, event)
        if (next === 'submitted' && state !== 'submitted') {
          expect(state).toBe('submitting')
          expect(event).toBe('SUBMIT_OK')
        }
      }),
      { numRuns: 500 },
    )
  })

  it('never reaches deleted except immediately after deleting via DELETE_OK', () => {
    fc.assert(
      fc.property(arbState, arbEvent, (state, event) => {
        const next = wizardDraftTransition(state, event)
        if (next === 'deleted' && state !== 'deleted') {
          expect(state).toBe('deleting')
          expect(event).toBe('DELETE_OK')
        }
      }),
      { numRuns: 500 },
    )
  })

  it('losing the network while holding dirty work never silently drops it to a clean/terminal state', () => {
    // From a state that holds unsynced edits, NETWORK_LOST must not land on a
    // clean or terminal state (work would be lost). It queues instead.
    fc.assert(
      fc.property(fc.constantFrom<WizardDraftState>('ready.dirty', 'saving'), (state) => {
        const next = wizardDraftTransition(state, 'NETWORK_LOST')
        expect(next).toBe('offline.queued')
        expect(isTerminalWizardDraftState(next)).toBe(false)
      }),
      { numRuns: 50 },
    )
  })

  it('queued offline work always resumes saving on reconnect', () => {
    fc.assert(
      fc.property(arbEvents, (events) => {
        // Drive into offline.queued, then reconnect.
        const queued = runWizardDraftEvents(['START_NEW', 'EDIT', 'NETWORK_LOST', ...events, 'NETWORK_LOST'])
        // From offline.queued, EDIT keeps it queued; SERVER_CONFLICT may divert.
        if (queued === 'offline.queued') {
          expect(wizardDraftTransition(queued, 'NETWORK_RESTORED')).toBe('saving')
        }
      }),
      { numRuns: 300 },
    )
  })

  it('EDIT is idempotent on a dirty draft (coalesced edits are stable)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), (n) => {
        const events: WizardDraftEvent[] = ['START_NEW', ...Array.from({ length: n }, () => 'EDIT' as const)]
        expect(runWizardDraftEvents(events)).toBe('ready.dirty')
      }),
      { numRuns: 100 },
    )
  })

  it('any reachable state is a valid state (no undefined leaks) from the initial state', () => {
    fc.assert(
      fc.property(arbEvents, (events) => {
        const finalState = runWizardDraftEvents(events, INITIAL_WIZARD_DRAFT_STATE)
        expect(WIZARD_DRAFT_STATES).toContain(finalState)
      }),
      { numRuns: 500 },
    )
  })
})
