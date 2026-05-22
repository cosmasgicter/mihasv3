/**
 * Property-based tests for the secureStorage utilities with AES-GCM and fallback.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import { secureStorage, clearSession, stripPiiFields } from '@/lib/secureStorage'

const STORAGE_PREFIX = 'mihas_secure_'
const PII_FIELDS = [
  'password',
  'token',
  'secret',
  'nrc',
  'passport_number',
  'date_of_birth',
  'bank_account',
  'credit_card',
  'nrc_number',
  'medical_conditions',
  'phone',
  'email',
] as const

function createLocalStorageMock() {
  const store = new Map<string, string>()
  return new Proxy(
    {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() {
        return store.size
      },
    },
    {
      ownKeys: () => [...store.keys()],
      getOwnPropertyDescriptor: (_target, prop) =>
        store.has(String(prop))
          ? { configurable: true, enumerable: true, value: store.get(String(prop)) }
          : undefined,
    },
  )
}

const objectWithPiiArb = fc.record({
  password: fc.string(),
  token: fc.string(),
  secret: fc.string(),
  nrc: fc.string(),
  passport_number: fc.string(),
  date_of_birth: fc.string(),
  bank_account: fc.string(),
  credit_card: fc.string(),
  nrc_number: fc.string(),
  medical_conditions: fc.string(),
  phone: fc.string(),
  email: fc.string(),
  first_name: fc.string(),
  program_id: fc.string(),
})

describe('secureStorage utility contract', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: createLocalStorageMock(),
      writable: true,
      configurable: true,
    })
  })

  afterEach(async () => {
    await clearSession()
  })

  it('removes all known PII fields while preserving non-PII fields', () => {
    fc.assert(
      fc.property(objectWithPiiArb, (data) => {
        const stripped = stripPiiFields(data)

        for (const field of PII_FIELDS) {
          expect(stripped).not.toHaveProperty(field)
        }

        expect(stripped).toHaveProperty('first_name', data.first_name)
        expect(stripped).toHaveProperty('program_id', data.program_id)
      }),
      { numRuns: 25 },
    )
  })

  it('does not mutate the original object', () => {
    fc.assert(
      fc.property(objectWithPiiArb, (data) => {
        const original = { ...data }
        stripPiiFields(data)
        expect(data).toEqual(original)
      }),
      { numRuns: 25 },
    )
  })

  it('correctly encrypts and decrypts values (round-trip)', async () => {
    await secureStorage.init('dummy-session-key')
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[a-zA-Z0-9_-]{3,15}$/),
        fc.record({
          id: fc.uuid(),
          name: fc.string(),
          age: fc.integer(),
          tags: fc.array(fc.string())
        }),
        async (key, val) => {
          await secureStorage.set(key, val)
          const retrieved = await secureStorage.get(key)
          expect(retrieved).toEqual(val)

          // Verify the value in raw localStorage is encrypted (base64 and not raw JSON)
          const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`)
          expect(raw).not.toBeNull()
          expect(raw).not.toContain(val.id) // It should be encrypted ciphertext
        }
      ),
      { numRuns: 25 }
    )
  })

  it('falls back to PII stripping when crypto is unavailable', async () => {
    const originalSubtle = globalThis.crypto.subtle
    Object.defineProperty(globalThis.crypto, 'subtle', {
      value: undefined,
      configurable: true,
      writable: true
    })

    try {
      const fallbackStorage = new (secureStorage.constructor as any)()
      await fallbackStorage.init('session-fallback')
      expect(fallbackStorage.isSecure).toBe(false)
      expect(fallbackStorage.showInsecureBanner).toBe(true)

      await fc.assert(
        fc.asyncProperty(
          fc.stringMatching(/^[a-zA-Z0-9_-]{3,15}$/),
          objectWithPiiArb,
          async (key, val) => {
            await fallbackStorage.set(key, val)
            const retrieved = await fallbackStorage.get(key)

            // Non-PII fields should remain, PII fields should be stripped
            for (const field of PII_FIELDS) {
              expect(retrieved).not.toHaveProperty(field)
            }
            expect(retrieved).toHaveProperty('first_name', val.first_name)
            expect(retrieved).toHaveProperty('program_id', val.program_id)

            // The value in raw localStorage should be plain JSON (not encrypted)
            const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`)
            expect(raw).not.toBeNull()
            expect(JSON.parse(raw!)).toEqual(stripPiiFields(val))
          }
        ),
        { numRuns: 25 }
      )
    } finally {
      Object.defineProperty(globalThis.crypto, 'subtle', {
        value: originalSubtle,
        configurable: true,
        writable: true
      })
    }
  })

  it('clearSession clears the cryptographic state', async () => {
    await secureStorage.init('dummy-session-key')
    expect(secureStorage.isSecure).toBe(true)
    expect(secureStorage.initialized).toBe(true)

    await secureStorage.set('test-key', { secret: 'data' })
    await secureStorage.clearSession()

    expect(secureStorage.isSecure).toBe(false)
    expect(secureStorage.initialized).toBe(false)
    expect(localStorage.getItem(`${STORAGE_PREFIX}test-key`)).toBeNull()
  })

  it('clearSession removes only MIHAS-prefixed keys', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.stringMatching(/^[a-z][a-z0-9_]{0,12}$/), { minLength: 1, maxLength: 10 }),
        fc.array(fc.stringMatching(/^[a-z][a-z0-9_]{0,12}$/), { minLength: 1, maxLength: 10 }),
        async (secureKeys, unrelatedKeys) => {
          localStorage.clear()

          for (const key of secureKeys) {
            localStorage.setItem(`${STORAGE_PREFIX}${key}`, 'secure')
          }
          for (const key of unrelatedKeys) {
            localStorage.setItem(`plain_${key}`, 'plain')
          }

          await clearSession()

          for (const key of secureKeys) {
            expect(localStorage.getItem(`${STORAGE_PREFIX}${key}`)).toBeNull()
          }
          for (const key of unrelatedKeys) {
            expect(localStorage.getItem(`plain_${key}`)).toBe('plain')
          }
        },
      ),
      { numRuns: 25 },
    )
  })
})
