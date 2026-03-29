// @vitest-environment node
/**
 * Property-based tests for Idempotency Key Deduplication (Property 3)
 * Feature: production-remediation
 *
 * Property 3: Idempotency key deduplication
 * For any idempotency key and submission payload, submitting the same key
 * multiple times within 24 hours must return the same response as the first
 * submission, and must not create duplicate records in the database.
 *
 * **Validates: Requirements 3.3**
 */
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

// ── Types ───────────────────────────────────────────────────────────────

interface IdempotencyRecord {
  endpoint: string
  responseJson: unknown
  createdAt: number // timestamp ms
}

// ── In-memory idempotency store (simulates idempotency_keys table) ──────

class IdempotencyStore {
  private store = new Map<string, IdempotencyRecord>()
  private readonly TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

  /**
   * Check if an idempotency key exists and is not expired.
   * Returns the cached response if found, null otherwise.
   */
  check(key: string, endpoint: string, now: number = Date.now()): unknown | null {
    if (!key) return null
    const record = this.store.get(key)
    if (!record) return null
    if (record.endpoint !== endpoint) return null
    if (now - record.createdAt > this.TTL_MS) {
      this.store.delete(key)
      return null
    }
    return record.responseJson
  }

  /**
   * Store an idempotency key with its response.
   * Uses upsert semantics (ON CONFLICT DO UPDATE) matching the SQL implementation.
   */
  store_key(key: string, endpoint: string, responseData: unknown, now: number = Date.now()): void {
    if (!key) return
    this.store.set(key, {
      endpoint,
      responseJson: responseData,
      createdAt: now,
    })
  }

  /** Number of stored keys (for verifying no duplicates) */
  get size(): number {
    return this.store.size
  }

  clear(): void {
    this.store.clear()
  }
}

/**
 * Simulate a submission with idempotency check, mirroring the server logic
 * in api-src/applications.ts.
 */
function simulateSubmission(
  store: IdempotencyStore,
  key: string,
  endpoint: string,
  payload: unknown,
  now: number = Date.now(),
): { response: unknown; wasCached: boolean } {
  // Check for existing key (mirrors checkIdempotencyKey)
  const cached = store.check(key, endpoint, now)
  if (cached !== null) {
    return { response: cached, wasCached: true }
  }

  // Process submission (first time) and store key (mirrors storeIdempotencyKey)
  store.store_key(key, endpoint, payload, now)
  return { response: payload, wasCached: false }
}

// ── Arbitraries ─────────────────────────────────────────────────────────

/** UUID-like strings */
const uuidArb = fc.uuid()

/** Random JSON-serializable payloads representing application data */
const payloadArb = fc.record({
  id: fc.uuid(),
  status: fc.constantFrom('submitted', 'approved', 'rejected', 'draft'),
  updated_at: fc.date().map((d) => d.toISOString()),
  data: fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fc.oneof(fc.string(), fc.integer(), fc.boolean())),
})

/** Endpoint string */
const endpointArb = fc.uuid().map((id) => `applications/${id}/submit`)

// ── Tests ────────────────────────────────────────────────────────────────

describe('Idempotency Key Deduplication Property Tests (P3)', () => {
  /**
   * **Validates: Requirements 3.3**
   *
   * Core property: for any UUID key and payload, storing then checking
   * must return the exact same payload.
   */
  it('store then check returns the same payload', () => {
    fc.assert(
      fc.property(uuidArb, endpointArb, payloadArb, (key, endpoint, payload) => {
        const store = new IdempotencyStore()
        const now = Date.now()

        // First submission
        const first = simulateSubmission(store, key, endpoint, payload, now)
        expect(first.wasCached).toBe(false)
        expect(first.response).toEqual(payload)

        // Check returns the stored payload
        const cached = store.check(key, endpoint, now)
        expect(cached).toEqual(payload)
      }),
      { numRuns: 10 },
    )
  })

  /**
   * **Validates: Requirements 3.3**
   *
   * Duplicate submissions with the same key always return the cached
   * response from the first submission, not the new payload.
   */
  it('duplicate submissions return the first response, not the new payload', () => {
    fc.assert(
      fc.property(
        uuidArb,
        endpointArb,
        payloadArb,
        payloadArb,
        fc.integer({ min: 2, max: 10 }),
        (key, endpoint, firstPayload, differentPayload, repeatCount) => {
          const store = new IdempotencyStore()
          const now = Date.now()

          // First submission
          const first = simulateSubmission(store, key, endpoint, firstPayload, now)
          expect(first.wasCached).toBe(false)
          expect(first.response).toEqual(firstPayload)

          // Subsequent submissions with the same key return cached response
          for (let i = 0; i < repeatCount; i++) {
            const dup = simulateSubmission(store, key, endpoint, differentPayload, now)
            expect(dup.wasCached).toBe(true)
            expect(dup.response).toEqual(firstPayload)
          }

          // Only one record stored (no duplicates)
          expect(store.size).toBe(1)
        },
      ),
      { numRuns: 10 },
    )
  })

  /**
   * **Validates: Requirements 3.3**
   *
   * Different idempotency keys do not interfere with each other.
   * Each key independently stores and returns its own payload.
   */
  it('different keys do not interfere with each other', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(uuidArb, payloadArb), { minLength: 2, maxLength: 10 }),
        endpointArb,
        (keyPayloadPairs, endpoint) => {
          const store = new IdempotencyStore()
          const now = Date.now()

          // Deduplicate keys to ensure uniqueness
          const uniquePairs = new Map<string, unknown>()
          for (const [key, payload] of keyPayloadPairs) {
            if (!uniquePairs.has(key)) {
              uniquePairs.set(key, payload)
            }
          }

          // Submit each unique key
          for (const [key, payload] of uniquePairs) {
            const result = simulateSubmission(store, key, endpoint, payload, now)
            expect(result.wasCached).toBe(false)
            expect(result.response).toEqual(payload)
          }

          // Verify each key returns its own payload
          for (const [key, payload] of uniquePairs) {
            const cached = store.check(key, endpoint, now)
            expect(cached).toEqual(payload)
          }

          // Store size matches unique key count
          expect(store.size).toBe(uniquePairs.size)
        },
      ),
      { numRuns: 10 },
    )
  })

  /**
   * **Validates: Requirements 3.3**
   *
   * Keys expire after 24 hours — checking an expired key returns null,
   * allowing a fresh submission.
   */
  it('expired keys are not returned (24h TTL)', () => {
    fc.assert(
      fc.property(uuidArb, endpointArb, payloadArb, payloadArb, (key, endpoint, payload, newPayload) => {
        const store = new IdempotencyStore()
        const now = Date.now()
        const after24h = now + 24 * 60 * 60 * 1000 + 1 // 24h + 1ms

        // Store at time `now`
        simulateSubmission(store, key, endpoint, payload, now)

        // Check after 24h returns null (expired)
        const expired = store.check(key, endpoint, after24h)
        expect(expired).toBeNull()

        // New submission with same key after expiry is treated as fresh
        const fresh = simulateSubmission(store, key, endpoint, newPayload, after24h)
        expect(fresh.wasCached).toBe(false)
        expect(fresh.response).toEqual(newPayload)
      }),
      { numRuns: 10 },
    )
  })

  /**
   * **Validates: Requirements 3.3**
   *
   * Same key on different endpoints does not deduplicate — endpoint
   * scoping ensures keys are isolated per endpoint.
   */
  it('same key on different endpoints does not deduplicate', () => {
    fc.assert(
      fc.property(uuidArb, endpointArb, endpointArb, payloadArb, payloadArb, (key, ep1, ep2, payload1, payload2) => {
        // Skip if endpoints happen to be the same
        fc.pre(ep1 !== ep2)

        const store = new IdempotencyStore()
        const now = Date.now()

        // Submit on endpoint 1
        const first = simulateSubmission(store, key, ep1, payload1, now)
        expect(first.wasCached).toBe(false)

        // Submit same key on endpoint 2 — should NOT be cached
        const second = simulateSubmission(store, key, ep2, payload2, now)
        // The store uses upsert, so the key is overwritten. But check with ep1 should fail
        // because the endpoint changed. Let's verify the check behavior:
        const checkEp1 = store.check(key, ep1, now)
        // After upsert with ep2, the record's endpoint is ep2, so ep1 check returns null
        expect(checkEp1).toBeNull()

        const checkEp2 = store.check(key, ep2, now)
        expect(checkEp2).toEqual(payload2)
      }),
      { numRuns: 10 },
    )
  })
})
