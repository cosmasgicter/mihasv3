/**
 * Behaviour tests for the per-section profile autosave state machine (task 6.1).
 *
 * Exercises debounced autosave, coalescing, the in-memory offline outbox +
 * reconnect flush, bounded retry with backoff, manual save, and version-token
 * conflict detection/resolution.
 *
 * Validates: Requirements R9.3, R9.5, R9.8, R16.8.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useProfileSectionAutosave } from '@/hooks/student/useProfileSectionAutosave'

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: online })
  window.dispatchEvent(new Event(online ? 'online' : 'offline'))
}

describe('useProfileSectionAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setOnline(true)
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('debounces then saves the queued delta and reports saved', async () => {
    const save = vi.fn().mockResolvedValue({ updated_at: '2026-01-01T00:00:00Z' })
    const onSaved = vi.fn()
    const { result } = renderHook(() =>
      useProfileSectionAutosave({ save, onSaved, debounceMs: 1000 }),
    )

    act(() => {
      result.current.scheduleSave('applicant', { full_name: 'Ada' })
    })
    expect(result.current.sections.applicant.status).toBe('dirty')
    expect(save).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith({ full_name: 'Ada' })
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(result.current.sections.applicant.status).toBe('saved')
  })

  it('coalesces rapid edits into a single debounced save', async () => {
    const save = vi.fn().mockResolvedValue({ updated_at: 'v1' })
    const { result } = renderHook(() =>
      useProfileSectionAutosave({ save, debounceMs: 1000 }),
    )

    act(() => {
      result.current.scheduleSave('applicant', { full_name: 'A' })
      result.current.scheduleSave('applicant', { full_name: 'Ada' })
      result.current.scheduleSave('applicant', { phone: '+260970000000' })
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith({ full_name: 'Ada', phone: '+260970000000' })
  })

  it('queues offline and flushes the in-memory outbox on reconnect', async () => {
    const save = vi.fn().mockResolvedValue({ updated_at: 'v1' })
    const { result } = renderHook(() =>
      useProfileSectionAutosave({ save, debounceMs: 1000 }),
    )

    act(() => setOnline(false))
    act(() => {
      result.current.scheduleSave('residence', { country: 'Zambia' })
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(save).not.toHaveBeenCalled()
    expect(result.current.sections.residence.status).toBe('offline')

    await act(async () => {
      setOnline(true)
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(save).toHaveBeenCalledWith({ country: 'Zambia' })
    expect(result.current.sections.residence.status).toBe('saved')
  })

  it('retries with backoff on a recoverable failure then succeeds', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ updated_at: 'v2' })
    const { result } = renderHook(() =>
      useProfileSectionAutosave({ save, debounceMs: 1000 }),
    )

    act(() => {
      result.current.scheduleSave('emergency', { next_of_kin_name: 'Byron' })
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(save).toHaveBeenCalledTimes(1)
    expect(result.current.sections.emergency.status).toBe('retrying')

    // First backoff delay is 1000ms.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(save).toHaveBeenCalledTimes(2)
    expect(result.current.sections.emergency.status).toBe('saved')
  })

  it('saveNow flushes immediately without waiting for the debounce', async () => {
    const save = vi.fn().mockResolvedValue({ updated_at: 'v1' })
    const { result } = renderHook(() =>
      useProfileSectionAutosave({ save, debounceMs: 5000 }),
    )

    act(() => {
      result.current.scheduleSave('applicant', { full_name: 'Ada' })
    })
    await act(async () => {
      result.current.saveNow('applicant')
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(save).toHaveBeenCalledTimes(1)
  })

  it('flags a conflict when the server version advances with unsynced work', async () => {
    const save = vi.fn().mockResolvedValue({ updated_at: 'v1' })
    const { result } = renderHook(() =>
      useProfileSectionAutosave({ save, debounceMs: 5000 }),
    )

    // Establish a base version, then hold local edits.
    act(() => result.current.registerServerVersion('v1'))
    act(() => {
      result.current.scheduleSave('applicant', { full_name: 'Ada' })
    })

    // A different session bumps the version.
    act(() => result.current.registerServerVersion('v2'))
    expect(result.current.sections.applicant.status).toBe('conflict')

    // Reload discards local edits and returns to idle.
    act(() => result.current.resolveConflict('applicant', 'reload'))
    expect(result.current.sections.applicant.status).toBe('idle')
  })
})
