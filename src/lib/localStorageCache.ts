/**
 * In-memory cache for localStorage values.
 *
 * Reads happen once per key (from localStorage), then served from the Map.
 * Writes update the Map immediately and queue the actual localStorage
 * write via requestIdleCallback (with setTimeout fallback).
 *
 * This eliminates redundant synchronous localStorage reads during the
 * 8-second auto-save interval and batches writes to avoid layout thrashing.
 */

const _lsCache = new Map<string, string | null>();
const _pendingWrites = new Map<string, string | null>();
let _writeScheduled = false;

function flushPendingWrites() {
  _pendingWrites.forEach((value, key) => {
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  });
  _pendingWrites.clear();
  _writeScheduled = false;
}

function scheduleFlush() {
  if (_writeScheduled) return;
  _writeScheduled = true;
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(flushPendingWrites);
  } else {
    setTimeout(flushPendingWrites, 0);
  }
}

/** Read from cache, populating from localStorage on first access. */
export function cachedGetItem(key: string): string | null {
  if (_lsCache.has(key)) return _lsCache.get(key) ?? null;
  const value = localStorage.getItem(key);
  _lsCache.set(key, value);
  return value;
}

/** Write to cache immediately and queue the localStorage write. */
export function cachedSetItem(key: string, value: string) {
  _lsCache.set(key, value);
  _pendingWrites.set(key, value);
  scheduleFlush();
}

/** Remove from cache immediately and queue the localStorage removal. */
export function cachedRemoveItem(key: string) {
  _lsCache.set(key, null);
  _pendingWrites.set(key, null);
  scheduleFlush();
}

/** Force-flush all pending writes (useful before page unload). */
export { flushPendingWrites };

/** Reset all internal state (testing only). */
export function resetCache() {
  _lsCache.clear();
  _pendingWrites.clear();
  _writeScheduled = false;
}
