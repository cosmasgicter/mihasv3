/**
 * In-memory cache for localStorage values with AES-GCM encryption support.
 *
 * Reads happen once per key (from localStorage/secureStorage), then served from the Map.
 * Writes update the Map immediately and queue the actual localStorage/secureStorage
 * write via requestIdleCallback (with setTimeout fallback).
 *
 * This eliminates redundant synchronous storage operations during auto-save
 * and runs heavy cryptographic calculations asynchronously in the background.
 *
 * ## The encrypted draft outbox across page loads (admissions-v2 task 6.3, M13)
 *
 * Draft keys (the wizard's local outbox) are stored AES-GCM encrypted under the
 * `beanola_secure_` prefix, with a key derived from the signed-in user. Two rules
 * keep a record written on one page load readable on the next:
 *
 * - **A draft write waits for the key.** Until `secureStorage.init()` has derived
 *   the user's key, `secureStorage.set` would fall back to a PII-stripped
 *   plaintext copy under the same storage key — overwriting the encrypted record
 *   (the student's unsent edits) with something no later page can decrypt. Such a
 *   write is held in memory and flushed, encrypted, once `preloadSecureStorage()`
 *   has run. Removals never need the key and are not held.
 * - **The preload never clobbers this page's own writes.** It decrypts what
 *   storage holds into the cache, but a key this page has already written or
 *   removed keeps the page's newer value.
 *
 * `whenSecureStorageReady()` lets a reader (the wizard's draft loader) wait —
 * boundedly — until the preload has run, so it reads the decrypted record instead
 * of an empty cache.
 */
import { secureStorage } from './secureStorage'
import { BROWSER_KEYS, LEGACY_BROWSER_KEYS } from './browserNamespace'
import { isDraftStorageKey } from './draftStorageKeys'

const isTesting = typeof process !== 'undefined' && (process.env.VITEST !== undefined || process.env.NODE_ENV === 'test')

const _lsCache = new Map<string, string | null>()
const _pendingWrites = new Map<string, string | null>()
/** Keys this page has written or removed through the cache; the preload leaves them alone. */
const _locallyWritten = new Set<string>()
let _writeScheduled = false
/** True once `preloadSecureStorage()` has decrypted storage into the cache for the current owner. */
let _secureReady = false
let _readyWaiters: Array<(ready: boolean) => void> = []

function settleReadyWaiters(ready: boolean): void {
  const waiters = _readyWaiters
  _readyWaiters = []
  for (const resolve of waiters) resolve(ready)
}

async function flushPendingWrites() {
  const entries = Array.from(_pendingWrites.entries())
  _pendingWrites.clear()
  _writeScheduled = false

  for (const [key, value] of entries) {
    if (value !== null && isDraftStorageKey(key) && !secureStorage.initialized) {
      // No key yet: hold the write (see the module note). A newer operation on
      // the same key that arrived while this flush was running wins.
      if (!_pendingWrites.has(key)) _pendingWrites.set(key, value)
      continue
    }
    try {
      if (value === null) {
        // Delete from both secure storage and plain storage to be safe
        await secureStorage.delete(key).catch(() => {})
        localStorage.removeItem(key)
      } else {
        // If it's a draft key, route through secureStorage encryption
        if (isDraftStorageKey(key)) {
          let parsedValue: unknown = value
          try {
            parsedValue = JSON.parse(value)
          } catch {
            // Fallback to raw value if not valid JSON
          }
          await secureStorage.set(key, parsedValue)
        } else {
          // Unrelated keys continue to write directly to localStorage
          localStorage.setItem(key, value)
        }
      }
    } catch {
      // QuotaExceededError or SecurityError — skip this key, continue batch
    }
  }
}

function scheduleFlush() {
  if (_writeScheduled) return
  _writeScheduled = true
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => {
      void flushPendingWrites()
    })
  } else {
    setTimeout(() => {
      void flushPendingWrites()
    }, 0)
  }
}

/**
 * Preload and decrypt all secure storage values into the memory cache, then
 * write any draft writes that were held for the key. Marks the cache ready.
 */
export async function preloadSecureStorage(): Promise<void> {
  if (!secureStorage.initialized) return

  try {
    const keys = await secureStorage.keys()
    for (const key of keys) {
      // This page's own write or removal is newer than what storage holds.
      if (_locallyWritten.has(key)) continue
      const value = await secureStorage.get<unknown>(key)
      if (value !== null && !_locallyWritten.has(key)) {
        const stringified = typeof value === 'string' ? value : JSON.stringify(value)
        _lsCache.set(key, stringified)
      }
    }
  } catch {
    // Best-effort preload — keep cache as-is
  } finally {
    _secureReady = true
    settleReadyWaiters(true)
    if (_pendingWrites.size > 0) scheduleFlush()
  }
}

/** Whether the secure-storage preload has run for the current owner. */
export function isSecureStorageReady(): boolean {
  return isTesting || _secureReady
}

/**
 * Resolve `true` once the secure-storage preload has run (immediately if it
 * already has), or `false` after `timeoutMs`. Never rejects.
 *
 * Under the test runner the cache reads and writes storage synchronously in
 * plaintext, so there is nothing to decrypt and the cache is always ready.
 */
export function whenSecureStorageReady(timeoutMs: number): Promise<boolean> {
  if (isSecureStorageReady()) return Promise.resolve(true)
  return new Promise<boolean>((resolve) => {
    let settled = false
    const finish = (ready: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      _readyWaiters = _readyWaiters.filter((waiter) => waiter !== finish)
      resolve(ready)
    }
    const timer = setTimeout(() => finish(false), Math.max(0, timeoutMs))
    _readyWaiters.push(finish)
  })
}

/** Read from cache, populating from storage on first access. */
export function cachedGetItem(key: string): string | null {
  if (_lsCache.has(key)) return _lsCache.get(key) ?? null

  // Fallback: check raw localStorage first
  const value = localStorage.getItem(key)
  _lsCache.set(key, value)
  return value
}

/** Write to cache immediately and queue the storage write. */
export function cachedSetItem(key: string, value: string): void {
  _lsCache.set(key, value)
  _locallyWritten.add(key)
  if (isTesting) {
    if (isDraftStorageKey(key)) {
      localStorage.setItem(key, value)
      localStorage.setItem(BROWSER_KEYS.securePrefix + key, value)
      localStorage.removeItem(LEGACY_BROWSER_KEYS.securePrefix + key)
    } else {
      localStorage.setItem(key, value)
    }
    return
  }
  _pendingWrites.set(key, value)
  scheduleFlush()
}

/** Remove from cache immediately and queue the storage removal. */
export function cachedRemoveItem(key: string): void {
  _lsCache.set(key, null)
  _locallyWritten.add(key)
  if (isTesting) {
    localStorage.removeItem(key)
    localStorage.removeItem(BROWSER_KEYS.securePrefix + key)
    localStorage.removeItem(LEGACY_BROWSER_KEYS.securePrefix + key)
    return
  }
  _pendingWrites.set(key, null)
  scheduleFlush()
}

/** Force-flush all pending writes. */
export { flushPendingWrites }

/**
 * Reset all internal state: the cache, queued and held writes, and readiness.
 * Called when the signed-in owner goes away (and by tests). A reader still
 * waiting for readiness is answered `false` rather than left to time out.
 */
export function resetCache(): void {
  _lsCache.clear()
  _pendingWrites.clear()
  _locallyWritten.clear()
  _writeScheduled = false
  _secureReady = false
  settleReadyWaiters(false)
}
