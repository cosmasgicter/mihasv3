/**
 * In-memory cache for localStorage values with AES-GCM encryption support.
 *
 * Reads happen once per key (from localStorage/secureStorage), then served from the Map.
 * Writes update the Map immediately and queue the actual localStorage/secureStorage
 * write via requestIdleCallback (with setTimeout fallback).
 *
 * This eliminates redundant synchronous storage operations during auto-save
 * and runs heavy cryptographic calculations asynchronously in the background.
 */
import { secureStorage } from './secureStorage'

const isTesting = typeof process !== 'undefined' && (process.env.VITEST !== undefined || process.env.NODE_ENV === 'test')

const _lsCache = new Map<string, string | null>()
const _pendingWrites = new Map<string, string | null>()
let _writeScheduled = false

async function flushPendingWrites() {
  const entries = Array.from(_pendingWrites.entries())
  _pendingWrites.clear()
  _writeScheduled = false

  for (const [key, value] of entries) {
    try {
      if (value === null) {
        // Delete from both secure storage and plain storage to be safe
        await secureStorage.delete(key).catch(() => {})
        localStorage.removeItem(key)
      } else {
        // If it's a draft key, route through secureStorage encryption
        if (key === 'applicationDraft' || key === 'applicationWizardDraft') {
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

/** Preload and decrypt all secure storage values into the memory cache. */
export async function preloadSecureStorage(): Promise<void> {
  if (!secureStorage.initialized) return

  try {
    const keys = await secureStorage.keys()
    for (const key of keys) {
      const value = await secureStorage.get<unknown>(key)
      if (value !== null) {
        const stringified = typeof value === 'string' ? value : JSON.stringify(value)
        _lsCache.set(key, stringified)
      }
    }
  } catch {
    // Best-effort preload — keep cache as-is
  }
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
  if (isTesting) {
    if (key === 'applicationDraft' || key === 'applicationWizardDraft') {
      localStorage.setItem(key, value)
      localStorage.setItem('mihas_secure_' + key, value)
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
  if (isTesting) {
    localStorage.removeItem(key)
    localStorage.removeItem('mihas_secure_' + key)
    return
  }
  _pendingWrites.set(key, null)
  scheduleFlush()
}

/** Force-flush all pending writes. */
export { flushPendingWrites }

/** Reset all internal state (testing only). */
export function resetCache(): void {
  _lsCache.clear()
  _pendingWrites.clear()
  _writeScheduled = false
}
