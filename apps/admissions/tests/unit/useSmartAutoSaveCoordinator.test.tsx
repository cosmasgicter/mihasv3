/**
 * `useSmartAutoSave` — the autosave VIEW over the draft machine (task 6.3,
 * R10.2/R10.7).
 *
 * This file used to test `useSmartAutoSave` as the draft's coordinator. Task
 * 6.3 moved every one of those behaviours into the one draft machine
 * (`lib/wizardDraftController.ts`, tested in `wizardDraftController.test.ts`
 * and by the composition characterisation). The same five claims are kept here
 * through the hook the wizard renders, so they are proven on the path the
 * student actually uses: the machine, its binding and this view together.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useSmartAutoSave } from '@/pages/student/applicationWizard/hooks/useSmartAutoSave'
import { createDraftHarness, settle } from './__fixtures__/wizardDraftHarness'

function mountView(harness: ReturnType<typeof createDraftHarness>) {
  harness.machine.activate()
  return renderHook(() =>
    useSmartAutoSave({ machine: harness.machine, snapshot: harness.machine.getSnapshot() }),
  )
}

describe('useSmartAutoSave — the view over the draft machine (R10.2/R10.7)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('does not write an unchanged projection on debounce or interval', async () => {
    const h = createDraftHarness()
    h.hydrate()
    const view = mountView(h)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(24_000)
      await settle()
    })
    view.rerender()
    expect(h.server.updateCalls).toHaveLength(0)
    expect(view.result.current.saveStatus).toBe('saved')
  })

  it('re-baselines server hydration without writing the loaded projection', async () => {
    const h = createDraftHarness({ values: { residence_town: '' } })
    h.machine.activate()
    h.machine.beginHydration()
    h.setQuietly('residence_town', 'Kabwe')
    h.machine.completeHydration({ applicationId: 'app-1', serverVersion: 3, source: 'server' })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(24_000)
      await settle()
    })
    expect(h.server.updateCalls).toHaveLength(0)
  })

  it('coalesces an edit into one debounced canonical save, and Save now on top of it writes nothing more', async () => {
    const h = createDraftHarness()
    h.hydrate()
    const view = mountView(h)
    h.edit('full_name', 'After')
    view.rerender()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
      await settle()
    })
    view.rerender()
    expect(h.server.updateCalls).toHaveLength(1)
    expect(h.server.updateCalls[0]!.payload).toMatchObject({ full_name: 'After' })
    await act(async () => {
      await view.result.current.forceSave()
      await settle()
    })
    expect(h.server.updateCalls).toHaveLength(1)
  })

  it('makes an optimistic conflict terminal and never retries it', async () => {
    const h = createDraftHarness()
    h.hydrate()
    h.server.writeFromAnotherDevice({ full_name: 'Winner' })
    const view = mountView(h)
    h.edit('full_name', 'Stale edit')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
      await settle()
    })
    view.rerender()
    expect(view.result.current.saveStatus).toBe('conflict')
    expect(view.result.current.saveError).toMatch(/another tab or device/i)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
      await view.result.current.forceSave()
      await settle()
    })
    expect(h.server.updateCalls).toHaveLength(1)
  })

  it('serializes an edit made during a save and persists the latest value next', async () => {
    const h = createDraftHarness()
    h.hydrate()
    mountView(h)
    const release = h.server.holdWrites()
    h.edit('full_name', 'First edit')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
      await settle()
    })
    expect(h.server.updateCalls).toHaveLength(1)
    h.edit('full_name', 'Second edit')
    await act(async () => {
      release()
      await settle()
      await vi.advanceTimersByTimeAsync(2_000)
      await settle()
    })
    expect(h.server.updateCalls).toHaveLength(2)
    expect(h.server.updateCalls[1]!.payload).toMatchObject({ full_name: 'Second edit' })
    expect(h.server.maxInFlight).toBe(1)
  })

  it('pauses autosave behind its gate and releases it', async () => {
    const h = createDraftHarness()
    h.hydrate()
    h.machine.activate()
    const view = renderHook(
      ({ enabled }) => useSmartAutoSave({ machine: h.machine, snapshot: h.machine.getSnapshot(), enabled }),
      { initialProps: { enabled: false } },
    )
    h.edit('residence_town', 'During payment')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
      await settle()
    })
    expect(h.server.updateCalls).toHaveLength(0)
    view.rerender({ enabled: true })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
      await settle()
    })
    expect(h.server.updateCalls).toHaveLength(1)
  })
})
