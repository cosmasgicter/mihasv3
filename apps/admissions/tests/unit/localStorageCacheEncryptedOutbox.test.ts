/**
 * The encrypted draft outbox across page loads (admissions-v2 task 6.3, M13 —
 * R10.4, R10.8; finding STU-02).
 *
 * The browser run (docs/v2-evidence/6.3/raw/m13-04-*) measured two ways an edit
 * the wizard had written to the local outbox was lost on the next page load:
 *
 * 1. the loader read the outbox before the user's key was derived, so it read
 *    nothing — and the first draft write in that window fell back to a
 *    PII-stripped plaintext copy that overwrote the encrypted record;
 * 2. the record was wiped on page load (AuthContext; pinned by
 *    `authContextSecureStorageLifecycle.test.tsx`).
 *
 * These cases pin the cache's half. They run the module's PRODUCTION path — the
 * one that queues writes and encrypts them — by importing a fresh instance with
 * the test-runner flags unset; under the runner the cache writes plaintext
 * synchronously and none of this applies. "A page load" is a fresh module
 * instance over the same `localStorage`, which is what a browser reload is to
 * this module.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type CacheModule = typeof import('@/lib/localStorageCache')
type SecureModule = typeof import('@/lib/secureStorage')

const USER_ID = 'user-m13'
const DRAFT_KEY = `applicationWizardDraft:${USER_ID}:application-1`
const SECURE_DRAFT_KEY = `beanola_secure_${DRAFT_KEY}`

/** A fresh "page": the module graph re-evaluated with the runner flags unset. */
async function loadPage(): Promise<{ cache: CacheModule; secure: SecureModule['secureStorage'] }> {
  const saved = { VITEST: process.env.VITEST, NODE_ENV: process.env.NODE_ENV }
  delete process.env.VITEST
  process.env.NODE_ENV = 'production'
  vi.resetModules()
  try {
    const cache = await import('@/lib/localStorageCache')
    const { secureStorage } = await import('@/lib/secureStorage')
    return { cache, secure: secureStorage }
  } finally {
    process.env.VITEST = saved.VITEST
    process.env.NODE_ENV = saved.NODE_ENV
  }
}

/** What AuthContext does once the signed-in user is known. */
async function signInOnPage(page: { cache: CacheModule; secure: SecureModule['secureStorage'] }) {
  await page.secure.init(USER_ID)
  await page.cache.preloadSecureStorage()
}

function isPlaintextJson(raw: string | null): boolean {
  if (raw === null) return false
  try {
    JSON.parse(raw)
    return true
  } catch {
    return false
  }
}

/** Page 1: the wizard writes a pending outbox record, encrypted. */
async function writeRecordOnEarlierPage(record: Record<string, unknown>) {
  const page = await loadPage()
  await signInOnPage(page)
  page.cache.cachedSetItem(DRAFT_KEY, JSON.stringify(record))
  await page.cache.flushPendingWrites()
  await vi.waitFor(() => expect(localStorage.getItem(SECURE_DRAFT_KEY)).not.toBeNull())
  return localStorage.getItem(SECURE_DRAFT_KEY)
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
})

describe('localStorageCache — the encrypted draft outbox across page loads', () => {
  it('a record written on one page load is decrypted into the cache on the next, once the key exists', async () => {
    const stored = await writeRecordOnEarlierPage({ pending: true, serverVersion: 4, formData: { residence_town: 'Mongu' } })
    expect(isPlaintextJson(stored), 'the record is stored encrypted').toBe(false)

    const next = await loadPage()
    expect(next.cache.isSecureStorageReady()).toBe(false)
    const ready = next.cache.whenSecureStorageReady(5_000)
    await signInOnPage(next)

    await expect(ready).resolves.toBe(true)
    expect(JSON.parse(next.cache.cachedGetItem(DRAFT_KEY) ?? 'null')).toEqual({
      pending: true,
      serverVersion: 4,
      formData: { residence_town: 'Mongu' },
    })
  })

  it('holds a draft write made before the key exists, never stores it as plaintext, and writes it encrypted after the preload', async () => {
    const earlier = await writeRecordOnEarlierPage({ pending: true, serverVersion: 4, formData: { residence_town: 'Mongu' } })

    const next = await loadPage()
    vi.useFakeTimers()
    // The page writes before the key is derived (a slow phone).
    next.cache.cachedSetItem(DRAFT_KEY, JSON.stringify({ pending: false, serverVersion: 5, formData: { residence_town: 'Kabwe' } }))
    await next.cache.flushPendingWrites()
    expect(localStorage.getItem(SECURE_DRAFT_KEY), 'nothing reaches storage without the key').toBe(earlier)

    await signInOnPage(next)
    // The preload decrypted the older stored record, but this page's newer write wins.
    expect(JSON.parse(next.cache.cachedGetItem(DRAFT_KEY) ?? 'null')).toMatchObject({ serverVersion: 5 })

    vi.useRealTimers()
    await next.cache.flushPendingWrites()
    await vi.waitFor(() => expect(localStorage.getItem(SECURE_DRAFT_KEY)).not.toBe(earlier))
    const stored = localStorage.getItem(SECURE_DRAFT_KEY)
    expect(isPlaintextJson(stored), 'the held write lands encrypted').toBe(false)
    await expect(next.secure.get(DRAFT_KEY)).resolves.toMatchObject({
      serverVersion: 5,
      formData: { residence_town: 'Kabwe' },
    })
  })

  it('never resurrects a record this page removed before the preload ran', async () => {
    await writeRecordOnEarlierPage({ pending: true, serverVersion: 4, formData: { residence_town: 'Mongu' } })

    const next = await loadPage()
    vi.useFakeTimers()
    // The removal is queued but not flushed when the preload enumerates storage.
    next.cache.cachedRemoveItem(DRAFT_KEY)
    await signInOnPage(next)
    expect(next.cache.cachedGetItem(DRAFT_KEY)).toBeNull()

    vi.useRealTimers()
    await next.cache.flushPendingWrites()
    expect(localStorage.getItem(SECURE_DRAFT_KEY)).toBeNull()
  })

  it('does not hold writes to keys that are not encrypted', async () => {
    const page = await loadPage()
    page.cache.cachedSetItem('beanola_ui_preference', 'compact')
    await page.cache.flushPendingWrites()
    expect(localStorage.getItem('beanola_ui_preference')).toBe('compact')
  })
})

describe('whenSecureStorageReady', () => {
  it('answers false after the timeout when the preload never runs', async () => {
    const page = await loadPage()
    vi.useFakeTimers()
    const ready = page.cache.whenSecureStorageReady(5_000)
    await vi.advanceTimersByTimeAsync(5_000)
    await expect(ready).resolves.toBe(false)
  })

  it('answers at once when the preload has already run', async () => {
    const page = await loadPage()
    await signInOnPage(page)
    expect(page.cache.isSecureStorageReady()).toBe(true)
    await expect(page.cache.whenSecureStorageReady(0)).resolves.toBe(true)
  })

  it('is no longer ready once the owner goes away, and a waiting reader is answered false', async () => {
    const page = await loadPage()
    await signInOnPage(page)
    page.cache.resetCache()
    expect(page.cache.isSecureStorageReady()).toBe(false)

    const waiting = page.cache.whenSecureStorageReady(60_000)
    page.cache.resetCache()
    await expect(waiting).resolves.toBe(false)
  })
})
