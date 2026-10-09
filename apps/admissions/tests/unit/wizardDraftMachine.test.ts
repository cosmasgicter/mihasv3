/**
 * Unit tests for the canonical wizard draft state machine (task 6.3).
 *
 * These pin the exact design §8.2 transition graph and the derived predicates.
 * They are the model-level coverage the task's Required_Evidence calls for
 * ("model/property tests"); the refresh/offline/two-tab/device-switch browser
 * runs are owned by task 13.2 (E2E).
 */
import { describe, expect, it } from 'vitest'

import {
  INITIAL_WIZARD_DRAFT_STATE,
  WIZARD_DRAFT_EVENTS,
  WIZARD_DRAFT_STATES,
  hasQueuedWizardDraftWork,
  isTerminalWizardDraftState,
  isUnsyncedWizardDraftState,
  runWizardDraftEvents,
  wizardDraftSaveLabel,
  wizardDraftTransition,
  type WizardDraftState,
} from '@/lib/wizardDraftMachine'

describe('wizardDraftMachine — design §8.2 graph', () => {
  it('starts uninitialized', () => {
    expect(INITIAL_WIZARD_DRAFT_STATE).toBe('uninitialized')
  })

  it('explicit new intent goes straight to a clean ready draft', () => {
    expect(wizardDraftTransition('uninitialized', 'START_NEW')).toBe('ready.clean')
  })

  it('resume intent loads, then becomes clean when hydrated', () => {
    expect(runWizardDraftEvents(['RESUME'])).toBe('loading')
    expect(runWizardDraftEvents(['RESUME', 'LOADED'])).toBe('ready.clean')
  })

  it('edit -> debounced save -> saved cycle', () => {
    expect(runWizardDraftEvents(['START_NEW', 'EDIT'])).toBe('ready.dirty')
    expect(runWizardDraftEvents(['START_NEW', 'EDIT', 'SAVE_DUE'])).toBe('saving')
    expect(runWizardDraftEvents(['START_NEW', 'EDIT', 'SAVE_DUE', 'SAVE_OK'])).toBe('ready.clean')
  })

  it('a failed save returns to dirty so the edit is retried, never lost', () => {
    expect(runWizardDraftEvents(['START_NEW', 'EDIT', 'SAVE_DUE', 'SAVE_FAILED'])).toBe('ready.dirty')
  })

  it('offline queues dirty work and flushes on reconnect', () => {
    expect(runWizardDraftEvents(['START_NEW', 'EDIT', 'NETWORK_LOST'])).toBe('offline.queued')
    expect(runWizardDraftEvents(['START_NEW', 'EDIT', 'NETWORK_LOST', 'NETWORK_RESTORED'])).toBe('saving')
  })

  it('a clean draft with no queued work stays clean when the network drops', () => {
    expect(runWizardDraftEvents(['START_NEW', 'NETWORK_LOST'])).toBe('ready.clean')
  })

  it('server conflict is explicit and resolves by reload or merge (never a silent pick)', () => {
    expect(runWizardDraftEvents(['START_NEW', 'EDIT', 'SERVER_CONFLICT'])).toBe('conflict')
    expect(runWizardDraftEvents(['START_NEW', 'EDIT', 'SERVER_CONFLICT', 'RESOLVE_RELOAD'])).toBe('loading')
    expect(runWizardDraftEvents(['START_NEW', 'EDIT', 'SERVER_CONFLICT', 'RESOLVE_MERGE'])).toBe('saving')
  })

  it('delete transitions through deleting to the terminal deleted state', () => {
    expect(runWizardDraftEvents(['START_NEW', 'DELETE'])).toBe('deleting')
    expect(runWizardDraftEvents(['START_NEW', 'DELETE', 'DELETE_OK'])).toBe('deleted')
  })

  it('a payment-linked delete is blocked and leaves the draft intact', () => {
    expect(runWizardDraftEvents(['START_NEW', 'DELETE', 'DELETE_BLOCKED'])).toBe('ready.clean')
  })

  it('submit transitions through submitting to submitted, or back to errors', () => {
    expect(runWizardDraftEvents(['START_NEW', 'SUBMIT'])).toBe('submitting')
    expect(runWizardDraftEvents(['START_NEW', 'SUBMIT', 'SUBMIT_OK'])).toBe('submitted')
    expect(runWizardDraftEvents(['START_NEW', 'SUBMIT', 'SUBMIT_FAILED'])).toBe('ready.with_errors')
  })

  it('payment activity does not move the persistence lifecycle', () => {
    expect(wizardDraftTransition('ready.clean', 'PAY')).toBe('ready.clean')
    expect(wizardDraftTransition('ready.dirty', 'PAY')).toBe('ready.dirty')
  })

  it('terminal states are absorbing for every event', () => {
    for (const event of WIZARD_DRAFT_EVENTS) {
      expect(wizardDraftTransition('submitted', event)).toBe('submitted')
      expect(wizardDraftTransition('deleted', event)).toBe('deleted')
    }
  })

  it('an inapplicable event is a no-op (adapters cannot corrupt the lifecycle)', () => {
    // SUBMIT_OK only means something inside `submitting`.
    expect(wizardDraftTransition('ready.dirty', 'SUBMIT_OK')).toBe('ready.dirty')
    // DELETE_OK only means something inside `deleting`.
    expect(wizardDraftTransition('ready.clean', 'DELETE_OK')).toBe('ready.clean')
  })
})

describe('wizardDraftMachine — predicates', () => {
  it('flags exactly the terminal states', () => {
    const terminal = WIZARD_DRAFT_STATES.filter(isTerminalWizardDraftState)
    expect(new Set(terminal)).toEqual(new Set<WizardDraftState>(['submitted', 'deleted']))
  })

  it('flags unsynced states that a page unload would lose', () => {
    const unsynced = WIZARD_DRAFT_STATES.filter(isUnsyncedWizardDraftState)
    expect(new Set(unsynced)).toEqual(
      new Set<WizardDraftState>(['ready.dirty', 'saving', 'offline.queued', 'conflict', 'ready.with_errors']),
    )
  })

  it('only offline.queued has queued work', () => {
    const queued = WIZARD_DRAFT_STATES.filter(hasQueuedWizardDraftWork)
    expect(queued).toEqual(['offline.queued'])
  })

  it('maps every state to a stable save label', () => {
    for (const state of WIZARD_DRAFT_STATES) {
      expect(typeof wizardDraftSaveLabel(state)).toBe('string')
    }
    expect(wizardDraftSaveLabel('saving')).toBe('saving')
    expect(wizardDraftSaveLabel('ready.clean')).toBe('saved')
    expect(wizardDraftSaveLabel('offline.queued')).toBe('offline')
    expect(wizardDraftSaveLabel('conflict')).toBe('conflict')
  })
})
