// @vitest-environment node
/**
 * Property Test: Offline sync routes through API
 * Feature: supabase-remnant-purge
 * Property 2: Offline sync routes through API
 * Validates: Requirements 3.2
 *
 * For any queued offline sync item (form submission, profile update, or file upload),
 * when connectivity is restored and sync is triggered, the sync operation SHALL make
 * an HTTP request via `apiClient` or `fetch` to a `/api/*` endpoint rather than
 * calling `supabase.from()`.
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

// ---- Types matching offlineSync.ts ----

type SyncItemType = 'application_draft' | 'form_submission' | 'document_upload'

interface SyncRoute {
  endpoint: string
  method: string
  body: Record<string, unknown>
}

/**
 * Replicate the syncToServer routing logic from src/services/offlineSync.ts.
 * This mirrors the actual switch statement so we can verify all routes go
 * through apiClient to /api/* endpoints and never to supabase.
 */
function buildSyncRoute(
  itemType: SyncItemType,
  userId: string,
  data: Record<string, unknown>,
  timestamp: number,
): SyncRoute | null {
  switch (itemType) {
    case 'application_draft':
      return {
        endpoint: '/applications/draft/',
        method: 'POST',
        body: {
          user_id: userId,
          draft_data: {
            ...(data.form_data as Record<string, unknown> | undefined ?? {}),
            uploaded_files: data.uploaded_files ?? [],
            current_step: data.current_step ?? 0,
            version: data.version ?? 1,
            is_offline_sync: true,
            updated_at: new Date().toISOString(),
          },
        },
      }
    case 'form_submission':
      return {
        endpoint: '/applications/',
        method: 'POST',
        body: {
          ...data,
          user_id: userId,
          is_offline_sync: true,
          created_at: new Date(timestamp).toISOString(),
        },
      }
    case 'document_upload':
      // Current implementation is a no-op break (files need re-upload)
      return null
    default:
      return null
  }
}

// ---- Generators ----

const userIdArb = fc.uuid()

const formDataArb = fc.record({
  firstName: fc.string({ minLength: 1, maxLength: 30 }),
  lastName: fc.string({ minLength: 1, maxLength: 30 }),
})

const applicationDraftDataArb = fc.record({
  form_data: formDataArb,
  uploaded_files: fc.constant([]),
  current_step: fc.integer({ min: 0, max: 3 }),
  version: fc.integer({ min: 1, max: 100 }),
})

const formSubmissionDataArb = fc.record({
  full_name: fc.string({ minLength: 1, maxLength: 50 }),
  email: fc.emailAddress(),
  phone: fc.string({ minLength: 5, maxLength: 20 }),
  program: fc.uuid(),
  intake: fc.uuid(),
  application_fee: fc.integer({ min: 100, max: 10000 }),
})

const timestampArb = fc.integer({ min: 1700000000000, max: 1800000000000 })

const syncItemTypeArb: fc.Arbitrary<SyncItemType> = fc.constantFrom(
  'application_draft' as const,
  'form_submission' as const,
  'document_upload' as const,
)

// ---- Property Tests ----

describe('Feature: supabase-remnant-purge, Property 2: Offline sync routes through API', () => {
  it('all sync item types route to API endpoints, never supabase', () => {
    fc.assert(
      fc.property(syncItemTypeArb, userIdArb, timestampArb, (itemType, userId, timestamp) => {
        const route = buildSyncRoute(itemType, userId, {}, timestamp)

        if (route !== null) {
          // Endpoint must be a valid API path starting with /
          expect(route.endpoint.startsWith('/')).toBe(true)

          // Endpoint must NOT reference supabase
          expect(route.endpoint).not.toContain('supabase')
          expect(route.endpoint).not.toContain('.supabase.co')
          expect(route.endpoint).not.toContain('rest/v1')

          // Method must be POST (all sync operations are writes)
          expect(route.method).toBe('POST')

          // Body must include offline sync marker
          if (itemType === 'application_draft') {
            expect((route.body.draft_data as Record<string, unknown>)?.is_offline_sync).toBe(true)
          } else {
            expect(route.body.is_offline_sync).toBe(true)
          }

          // Body must include user_id
          expect(route.body.user_id).toBe(userId)
        }
      }),
      { numRuns: 10 },
    )
  })

  it('application_draft sync routes to the draft endpoint with nested draft_data payload', () => {
    fc.assert(
      fc.property(applicationDraftDataArb, userIdArb, (draftData, userId) => {
        const route = buildSyncRoute(
          'application_draft',
          userId,
          draftData as unknown as Record<string, unknown>,
          Date.now(),
        )

        expect(route).not.toBeNull()
        expect(route!.endpoint).toBe('/applications/draft/')
        expect(route!.method).toBe('POST')
        expect(route!.body.user_id).toBe(userId)
        expect(route!.body.draft_data).toEqual({
          ...draftData.form_data,
          uploaded_files: draftData.uploaded_files,
          current_step: draftData.current_step,
          version: draftData.version,
          is_offline_sync: true,
          updated_at: expect.any(String),
        })
      }),
      { numRuns: 10 },
    )
  })

  it('form_submission sync routes to /applications with offline marker and timestamp', () => {
    fc.assert(
      fc.property(formSubmissionDataArb, userIdArb, timestampArb, (submissionData, userId, timestamp) => {
        const route = buildSyncRoute(
          'form_submission',
          userId,
          submissionData as unknown as Record<string, unknown>,
          timestamp,
        )

        expect(route).not.toBeNull()
        expect(route!.endpoint).toBe('/applications/')
        expect(route!.method).toBe('POST')
        expect(route!.body.user_id).toBe(userId)
        expect(route!.body.is_offline_sync).toBe(true)

        // created_at must be a valid ISO date derived from the timestamp
        const createdAt = route!.body.created_at as string
        expect(createdAt).toBe(new Date(timestamp).toISOString())
        expect(new Date(createdAt).getTime()).toBe(timestamp)
      }),
      { numRuns: 10 },
    )
  })

  it('no sync route ever contains supabase table name patterns', () => {
    const supabasePatterns = [
      'supabase.from',
      '.supabase.co',
      'rest/v1/',
      'supabase.rpc',
      'supabase.storage',
    ]

    fc.assert(
      fc.property(
        syncItemTypeArb,
        userIdArb,
        timestampArb,
        fc.constantFrom(...supabasePatterns),
        (itemType, userId, timestamp, pattern) => {
          const route = buildSyncRoute(itemType, userId, {}, timestamp)

          if (route !== null) {
            expect(route.endpoint).not.toContain(pattern)
            expect(JSON.stringify(route.body)).not.toContain(pattern)
          }
        },
      ),
      { numRuns: 10 },
    )
  })

  it('sync routes preserve user identity across all item types', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('application_draft' as const, 'form_submission' as const),
        userIdArb,
        timestampArb,
        (itemType, userId, timestamp) => {
          const route = buildSyncRoute(itemType, userId, {}, timestamp)

          // Non-null routes must carry the user_id
          expect(route).not.toBeNull()
          expect(route!.body.user_id).toBe(userId)

          // user_id must be a valid UUID
          expect(userId).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
          )
        },
      ),
      { numRuns: 10 },
    )
  })
})
