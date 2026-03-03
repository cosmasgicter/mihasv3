/**
 * Property-based tests for SecureStorage module
 * Feature: website-quality-remediation
 *
 * P1: Round-trip correctness
 * P2: PII field exclusion
 * P3: Session cleanup completeness
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import {
  secureStorage,
  stripPiiFields,
  PII_FIELDS,
} from '@/lib/secureStorage'

// ── Helpers ─────────────────────────────────────────────────────────────

/** Ensure crypto.subtle is available in the test environment */
function ensureCrypto() {
  if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) {
    // Node 19+ / Bun expose webcrypto on globalThis.crypto automatically.
    // If missing, pull from node:crypto.
    const { webcrypto } = require('node:crypto')
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, writable: true })
  }
}

/** localStorage mock backed by a plain Map */
function createLocalStorageMock() {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    get length() { return store.size },
    key: (index: number) => [...store.keys()][index] ?? null,
    // Expose keys() for Object.keys(localStorage) compatibility
    _store: store,
  }
}

/** Patch global localStorage with our mock and return a cleanup fn */
function mockLocalStorage() {
  const mock = createLocalStorageMock()

  // Object.keys(localStorage) must work — proxy the mock
  const proxy = new Proxy(mock, {
    ownKeys: () => [...mock._store.keys()],
    getOwnPropertyDescriptor: (_target, prop) => {
      if (mock._store.has(prop as string)) {
        return { configurable: true, enumerable: true, value: mock._store.get(prop as string) }
      }
      return undefined
    },
  })

  Object.defineProperty(globalThis, 'localStorage', { value: proxy, writable: true, configurable: true })
  return mock
}

// ── Arbitraries ─────────────────────────────────────────────────────────

/** Arbitrary for JSON-serializable values (no undefined, no functions) */
const jsonValueArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.double({ noNaN: true, noDefaultInfinity: true }),
  fc.boolean(),
  fc.constant(null),
)

/** Arbitrary for a flat JSON-serializable object */
const jsonObjectArb = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes('\0')),
  jsonValueArb,
  { minKeys: 0, maxKeys: 10 },
)

/** Arbitrary for a session token (non-empty string) */
const sessionTokenArb = fc.string({ minLength: 8, maxLength: 64 }).filter((s) => s.length >= 8)

/** Arbitrary for a storage key (simple alphanumeric) */
const storageKeyArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,19}$/)

/** Arbitrary for an object that always contains at least one PII field */
const objectWithPiiArb = fc.record({
  nrc_number: fc.string({ minLength: 1 }),
  passport_number: fc.string({ minLength: 1 }),
  medical_conditions: fc.string({ minLength: 1 }),
  phone: fc.string({ minLength: 1 }),
  email: fc.string({ minLength: 1 }),
  // Non-PII fields
  first_name: fc.string(),
  program_id: fc.string(),
})

// ── Tests ───────────────────────────────────────────────────────────────

describe('SecureStorage Property Tests', () => {
  beforeEach(() => {
    ensureCrypto()
    mockLocalStorage()
  })

  afterEach(async () => {
    await secureStorage.clearSession()
  })

  // Feature: website-quality-remediation, Property 1: SecureStorage encryption round-trip
  // **Validates: Requirements 1.1, 24.3**
  describe('P1: Round-trip correctness', () => {
    it('decrypt(encrypt(data)) === data for arbitrary JSON-serializable objects', async () => {
      await fc.assert(
        fc.asyncProperty(
          sessionTokenArb,
          storageKeyArb,
          jsonObjectArb,
          async (token, key, data) => {
            await secureStorage.clearSession()
            await secureStorage.init(token)

            await secureStorage.set(key, data)
            const retrieved = await secureStorage.get(key)

            expect(retrieved).toEqual(data)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('round-trips primitive values (strings, numbers, booleans, null)', async () => {
      await fc.assert(
        fc.asyncProperty(
          sessionTokenArb,
          storageKeyArb,
          jsonValueArb,
          async (token, key, value) => {
            await secureStorage.clearSession()
            await secureStorage.init(token)

            await secureStorage.set(key, value)
            const retrieved = await secureStorage.get(key)

            expect(retrieved).toEqual(value)
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  // Feature: website-quality-remediation, Property 2: PII field exclusion
  // **Validates: Requirements 1.2, 1.6**
  describe('P2: PII field exclusion from client-side storage', () => {
    it('stripPiiFields removes all PII fields while preserving non-PII fields', () => {
      fc.assert(
        fc.property(objectWithPiiArb, (data) => {
          const stripped = stripPiiFields(data)

          // No PII fields should remain
          for (const field of PII_FIELDS) {
            expect(stripped).not.toHaveProperty(field)
          }

          // Non-PII fields should be preserved
          expect(stripped).toHaveProperty('first_name')
          expect((stripped as Record<string, unknown>).first_name).toBe(data.first_name)
          expect(stripped).toHaveProperty('program_id')
          expect((stripped as Record<string, unknown>).program_id).toBe(data.program_id)
        }),
        { numRuns: 100 },
      )
    })

    it('stripPiiFields does not mutate the original object', () => {
      fc.assert(
        fc.property(objectWithPiiArb, (data) => {
          const original = { ...data }
          stripPiiFields(data)

          // Original should still have all PII fields
          for (const field of PII_FIELDS) {
            expect(data).toHaveProperty(field)
            expect((data as Record<string, unknown>)[field]).toBe(
              (original as Record<string, unknown>)[field],
            )
          }
        }),
        { numRuns: 100 },
      )
    })

    it('fallback mode stores no PII fields in localStorage', async () => {
      // Simulate crypto.subtle being unavailable
      const originalCrypto = globalThis.crypto
      Object.defineProperty(globalThis, 'crypto', { value: undefined, writable: true, configurable: true })

      try {
        await fc.assert(
          fc.asyncProperty(
            storageKeyArb,
            objectWithPiiArb,
            async (key, data) => {
              await secureStorage.clearSession()
              await secureStorage.init('any-token')

              expect(secureStorage.isSecure).toBe(false)

              await secureStorage.set(key, data)

              // Read raw localStorage value — should be plain JSON without PII
              const raw = localStorage.getItem(secureStorage.STORAGE_PREFIX + key)
              expect(raw).not.toBeNull()

              const parsed = JSON.parse(raw!)
              for (const field of PII_FIELDS) {
                expect(parsed).not.toHaveProperty(field)
              }
            },
          ),
          { numRuns: 50 },
        )
      } finally {
        Object.defineProperty(globalThis, 'crypto', { value: originalCrypto, writable: true, configurable: true })
      }
    })
  })

  // Feature: website-quality-remediation, Property 3: Session cleanup completeness
  // **Validates: Requirements 1.3**
  describe('P3: Session cleanup completeness', () => {
    it('clearSession removes all keys with the secure prefix', async () => {
      await fc.assert(
        fc.asyncProperty(
          sessionTokenArb,
          fc.array(storageKeyArb, { minLength: 1, maxLength: 10 }),
          jsonObjectArb,
          async (token, keys, data) => {
            await secureStorage.clearSession()
            await secureStorage.init(token)

            // Store multiple items
            const uniqueKeys = [...new Set(keys)]
            for (const key of uniqueKeys) {
              await secureStorage.set(key, data)
            }

            // Verify items exist
            const keysBefore = await secureStorage.keys()
            expect(keysBefore.length).toBeGreaterThan(0)

            // Clear session
            await secureStorage.clearSession()

            // No keys with the prefix should remain
            const keysAfter = Object.keys(localStorage).filter((k) =>
              k.startsWith(secureStorage.STORAGE_PREFIX),
            )
            expect(keysAfter).toHaveLength(0)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('clearSession does not remove non-prefixed localStorage keys', async () => {
      await fc.assert(
        fc.asyncProperty(
          sessionTokenArb,
          storageKeyArb,
          jsonObjectArb,
          async (token, key, data) => {
            await secureStorage.clearSession()
            await secureStorage.init(token)

            // Store a secure item and a non-secure item
            await secureStorage.set(key, data)
            const externalKey = 'external_' + key
            localStorage.setItem(externalKey, 'should-survive')

            await secureStorage.clearSession()

            // External key should still exist
            expect(localStorage.getItem(externalKey)).toBe('should-survive')
          },
        ),
        { numRuns: 100 },
      )
    })
  })
})
