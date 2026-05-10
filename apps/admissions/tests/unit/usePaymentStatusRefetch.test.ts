/**
 * Unit test — refetch resumes polling and clears the timeout flag (Task 37.3).
 *
 * Scope
 * -----
 * The functional React-hook harness (``renderHook``) is not available
 * in this workspace because ``@testing-library/react`` is not a
 * dependency. Instead this test pins the R14.3 refetch contract at the
 * module-surface level the way the sibling tests
 * (``usePaymentStatusTimeout.test.ts`` and
 * ``usePaymentStatusNoFailedOnTimeout.test.ts``) do: by asserting the
 * exported shape + the source invariants that guarantee the behaviour.
 *
 * The invariants pinned here are:
 *
 * 1. ``usePaymentStatus`` is exported and callable.
 * 2. ``POLL_TIMEOUT_MS`` is a positive number — the timeout branch
 *    actually exists.
 * 3. The hook source code contains the three load-bearing branches
 *    that make ``refetch()`` safe:
 *    - ``setPollingExceededTimeout(false)`` inside ``refetch`` — the
 *      flag is cleared on every manual re-check.
 *    - A single ``fetchStatus()`` call inside ``refetch`` — the hook
 *      does not fan-out multiple concurrent requests when the user
 *      retries.
 *    - No ``updateStatus('failed')`` in the ``scheduleNext`` timeout
 *      branch — the R14.3 invariant that timeouts never demote
 *      to ``failed``.
 * 4. The timeout branch in ``scheduleNext`` uses ``return`` (no
 *    ``updateStatus`` call), so on refetch the fresh poll has no
 *    poisoned state to recover from.
 *
 * Validates: Requirements R14.3.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { POLL_TIMEOUT_MS, usePaymentStatus } from '@/hooks/usePaymentStatus'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const HOOK_PATH = resolve(__dirname, '../../src/hooks/usePaymentStatus.ts')

function _readHookSource(): string {
  return readFileSync(HOOK_PATH, 'utf-8')
}

describe('usePaymentStatus — refetch contract (R14.3)', () => {
  it('exports usePaymentStatus and a positive POLL_TIMEOUT_MS', () => {
    expect(typeof usePaymentStatus).toBe('function')
    expect(typeof POLL_TIMEOUT_MS).toBe('number')
    expect(POLL_TIMEOUT_MS).toBeGreaterThan(0)
  })

  it('refetch() clears the pollingExceededTimeout flag', () => {
    const source = _readHookSource()
    // The refetch helper must unset the flag so the UI state matrix
    // can leave the ``still_confirming`` state on user request.
    expect(source).toMatch(/const refetch = useCallback\(\(\) => \{[\s\S]*?setPollingExceededTimeout\(false\)/)
  })

  it('refetch() issues exactly one fetchStatus() call per invocation', () => {
    const source = _readHookSource()
    // The refetch body should call fetchStatus() exactly once. We
    // locate the refetch block via its `useCallback` signature and
    // count occurrences.
    const match = source.match(
      /const refetch = useCallback\([\s\S]*?\n  \}, \[fetchStatus, clearPending, scheduleNext\]\)/,
    )
    expect(match).not.toBeNull()
    const body = match![0]
    const fetchCalls = body.match(/fetchStatus\(\)/g) ?? []
    expect(fetchCalls.length).toBe(1)
  })

  it('scheduleNext timeout branch never calls updateStatus(\'failed\')', () => {
    const source = _readHookSource()
    // Locate the scheduleNext function and assert its entire body
    // contains no ``updateStatus('failed')`` call. The only allowed
    // side effect of the timeout branch is
    // ``setPollingExceededTimeout(true)``.
    const scheduleNextMatch = source.match(
      /const scheduleNext = useCallback\([\s\S]*?\n  \}, \[fetchStatus\]\)/,
    )
    expect(scheduleNextMatch).not.toBeNull()
    const body = scheduleNextMatch![0]
    expect(body).not.toMatch(/updateStatus\(['"]failed['"]\)/)
    expect(body).toMatch(/setPollingExceededTimeout\(true\)/)
  })

  it('refetch() resets backoff and poll count so polling resumes at the initial interval', () => {
    const source = _readHookSource()
    // Resetting ``intervalRef.current = INITIAL_INTERVAL`` and
    // ``pollCountRef.current = 0`` inside refetch() is what
    // ``resumes polling`` means in practice — the next background poll
    // fires at the short default interval, not at the backed-off one.
    const refetchMatch = source.match(
      /const refetch = useCallback\([\s\S]*?\n  \}, \[fetchStatus, clearPending, scheduleNext\]\)/,
    )
    expect(refetchMatch).not.toBeNull()
    const body = refetchMatch![0]
    expect(body).toMatch(/intervalRef\.current = INITIAL_INTERVAL/)
    expect(body).toMatch(/pollCountRef\.current = 0/)
    // After the synchronous fetch completes, ``scheduleNext()`` is
    // chained via ``.then`` so polling resumes.
    expect(body).toMatch(/scheduleNext\(\)/)
  })
})
