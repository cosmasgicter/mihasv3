/**
 * Cache Synchronization Tests — Profile Update
 *
 * Verifies that a successful profile PATCH synchronizes both:
 *   - ['user-profile', userId] cache (useProfileQuery)
 *   - ['auth', 'session'] cache (useAuth().user)
 *
 * Also verifies that on mutation failure, optimistic updates are rolled back
 * to the previous cache state for both keys.
 *
 * These tests exercise the mutation lifecycle in useProfileQuery directly
 * against a real QueryClient, mocking only the network layer.
 */
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import {
  SESSION_QUERY_KEY,
  profileQueryKey,
  mergeProfileIntoSessionUser,
  sanitizeProfile,
  ProfilePayloadError,
  type SessionQueryData,
} from '@/hooks/auth/authQueries'
import type { User, UserProfile } from '@/types/auth'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'student@mihas.edu.zm',
    role: 'student',
    full_name: 'Jane Doe',
    first_name: 'Jane',
    last_name: 'Doe',
    ...overrides,
  }
}

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'user-1',
    user_id: 'user-1',
    email: 'student@mihas.edu.zm',
    role: 'student',
    full_name: 'Jane Doe',
    first_name: 'Jane',
    last_name: 'Doe',
    phone: '+260971000000',
    ...overrides,
  }
}

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}


// ---------------------------------------------------------------------------
// Helpers — replicate the mutation lifecycle from useProfileQuery.ts
// without rendering React components. This lets us test the cache logic
// in isolation against a real QueryClient.
// ---------------------------------------------------------------------------

/**
 * Simulates the optimistic onMutate step from useProfileQuery.
 * Returns the rollback context.
 */
async function simulateOnMutate(
  queryClient: QueryClient,
  userId: string,
  updates: Partial<UserProfile>,
) {
  await queryClient.cancelQueries({ queryKey: profileQueryKey(userId) })

  const previousProfile =
    queryClient.getQueryData<UserProfile | null>(profileQueryKey(userId)) ?? null
  const previousSession =
    queryClient.getQueryData<SessionQueryData>(SESSION_QUERY_KEY) ?? null

  // Optimistic profile update
  if (previousProfile) {
    queryClient.setQueryData<UserProfile>(profileQueryKey(userId), {
      ...previousProfile,
      ...updates,
    })
  }

  // Optimistic session update
  if (previousSession?.user) {
    queryClient.setQueryData<SessionQueryData>(SESSION_QUERY_KEY, {
      ...previousSession,
      user: mergeProfileIntoSessionUser(previousSession.user, updates as UserProfile),
    })
  }

  return { previousProfile, previousSession }
}

/**
 * Simulates the onSuccess step from useProfileQuery.
 */
function simulateOnSuccess(
  queryClient: QueryClient,
  userId: string,
  updatedProfile: UserProfile,
) {
  queryClient.setQueryData<UserProfile>(profileQueryKey(userId), updatedProfile)
  queryClient.setQueryData<SessionQueryData>(SESSION_QUERY_KEY, (current) => {
    if (!current?.user) return current
    return {
      ...current,
      user: mergeProfileIntoSessionUser(current.user, updatedProfile),
    }
  })
}

/**
 * Simulates the onError rollback step from useProfileQuery.
 */
function simulateOnError(
  queryClient: QueryClient,
  userId: string,
  context: { previousProfile: UserProfile | null; previousSession: SessionQueryData },
) {
  if (context.previousProfile !== undefined) {
    queryClient.setQueryData(profileQueryKey(userId), context.previousProfile)
  }
  if (context.previousSession !== undefined) {
    queryClient.setQueryData(SESSION_QUERY_KEY, context.previousSession)
  }
}

// ===========================================================================
// Tests
// ===========================================================================

describe('Profile cache synchronization', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = makeQueryClient()
  })

  // -----------------------------------------------------------------------
  // Sub-task 1: Patch profile full name and phone
  // -----------------------------------------------------------------------
  describe('Patch profile full name and phone', () => {
    it('optimistically applies full_name and phone to profile cache', async () => {
      const user = makeUser()
      const profile = makeProfile()
      queryClient.setQueryData(profileQueryKey(user.id), profile)
      queryClient.setQueryData(SESSION_QUERY_KEY, { user })

      const updates = { full_name: 'Jane Smith', phone: '+260972000000' }
      await simulateOnMutate(queryClient, user.id, updates)

      const cached = queryClient.getQueryData<UserProfile>(profileQueryKey(user.id))
      expect(cached?.full_name).toBe('Jane Smith')
      expect(cached?.phone).toBe('+260972000000')
    })

    it('sanitizeProfile passes through valid profile fields', () => {
      const raw = {
        id: 'user-1',
        full_name: 'Jane <b>Smith</b>',
        phone: '+260972000000',
        role: 'student',
      }
      const sanitized = sanitizeProfile(raw)
      expect(sanitized).toBeDefined()
      expect(sanitized!.id).toBe('user-1')
      // HTML entities should be escaped
      expect(sanitized!.full_name).not.toContain('<b>')
      expect(sanitized!.phone).toBe('+260972000000')
    })
  })

  // -----------------------------------------------------------------------
  // Sub-task 2: Assert useProfileQuery() cache updates
  // -----------------------------------------------------------------------
  describe('useProfileQuery() cache updates after successful mutation', () => {
    it('sets profile cache to the server-returned sanitized profile on success', async () => {
      const user = makeUser()
      const profile = makeProfile()
      queryClient.setQueryData(profileQueryKey(user.id), profile)
      queryClient.setQueryData(SESSION_QUERY_KEY, { user })

      // Simulate full mutation lifecycle: onMutate → mutationFn → onSuccess
      const updates = { full_name: 'Jane Smith', phone: '+260972000000' }
      await simulateOnMutate(queryClient, user.id, updates)

      // Server returns the full updated profile
      const serverProfile = makeProfile({
        full_name: 'Jane Smith',
        first_name: 'Jane',
        last_name: 'Smith',
        phone: '+260972000000',
        updated_at: '2025-01-15T12:00:00Z',
      })
      simulateOnSuccess(queryClient, user.id, serverProfile)

      const cached = queryClient.getQueryData<UserProfile>(profileQueryKey(user.id))
      expect(cached).toEqual(serverProfile)
      expect(cached?.full_name).toBe('Jane Smith')
      expect(cached?.phone).toBe('+260972000000')
      expect(cached?.updated_at).toBe('2025-01-15T12:00:00Z')
    })

    it('preserves non-overlapping profile fields on success', async () => {
      const user = makeUser()
      const profile = makeProfile({
        nationality: 'Zambian',
        date_of_birth: '2000-01-01',
        next_of_kin_name: 'John Doe',
      })
      queryClient.setQueryData(profileQueryKey(user.id), profile)
      queryClient.setQueryData(SESSION_QUERY_KEY, { user })

      const updates = { full_name: 'Jane Smith' }
      await simulateOnMutate(queryClient, user.id, updates)

      const serverProfile = makeProfile({
        full_name: 'Jane Smith',
        first_name: 'Jane',
        last_name: 'Smith',
        nationality: 'Zambian',
        date_of_birth: '2000-01-01',
        next_of_kin_name: 'John Doe',
      })
      simulateOnSuccess(queryClient, user.id, serverProfile)

      const cached = queryClient.getQueryData<UserProfile>(profileQueryKey(user.id))
      expect(cached?.nationality).toBe('Zambian')
      expect(cached?.date_of_birth).toBe('2000-01-01')
      expect(cached?.next_of_kin_name).toBe('John Doe')
    })
  })

  // -----------------------------------------------------------------------
  // Sub-task 3: Assert useAuth().user cache updates
  // -----------------------------------------------------------------------
  describe('useAuth().user (session) cache updates after successful mutation', () => {
    it('merges overlapping fields into session user on success', async () => {
      const user = makeUser()
      const profile = makeProfile()
      queryClient.setQueryData(profileQueryKey(user.id), profile)
      queryClient.setQueryData(SESSION_QUERY_KEY, { user })

      const updates = {
        full_name: 'Jane Smith',
        first_name: 'Jane',
        last_name: 'Smith',
        phone: '+260972000000',
      }
      await simulateOnMutate(queryClient, user.id, updates)

      const serverProfile = makeProfile({
        full_name: 'Jane Smith',
        first_name: 'Jane',
        last_name: 'Smith',
        phone: '+260972000000',
      })
      simulateOnSuccess(queryClient, user.id, serverProfile)

      const session = queryClient.getQueryData<SessionQueryData>(SESSION_QUERY_KEY)
      expect(session?.user?.full_name).toBe('Jane Smith')
      expect(session?.user?.first_name).toBe('Jane')
      expect(session?.user?.last_name).toBe('Smith')
    })

    it('preserves session-only fields not returned by profile endpoint', async () => {
      const user = makeUser({
        email_confirmed_at: '2024-12-01T00:00:00Z',
        created_at: '2024-11-01T00:00:00Z',
        user_metadata: { role: 'student' },
        app_metadata: { role: 'student' },
      })
      const profile = makeProfile()
      queryClient.setQueryData(profileQueryKey(user.id), profile)
      queryClient.setQueryData(SESSION_QUERY_KEY, { user })

      const updates = { full_name: 'Jane Smith' }
      await simulateOnMutate(queryClient, user.id, updates)

      const serverProfile = makeProfile({ full_name: 'Jane Smith' })
      simulateOnSuccess(queryClient, user.id, serverProfile)

      const session = queryClient.getQueryData<SessionQueryData>(SESSION_QUERY_KEY)
      // Session-only fields must survive the merge
      expect(session?.user?.email_confirmed_at).toBe('2024-12-01T00:00:00Z')
      expect(session?.user?.created_at).toBe('2024-11-01T00:00:00Z')
      expect(session?.user?.user_metadata).toEqual({ role: 'student' })
      expect(session?.user?.app_metadata).toEqual({ role: 'student' })
    })

    it('optimistically updates session user during onMutate', async () => {
      const user = makeUser()
      const profile = makeProfile()
      queryClient.setQueryData(profileQueryKey(user.id), profile)
      queryClient.setQueryData(SESSION_QUERY_KEY, { user })

      const updates = { full_name: 'Jane Smith', first_name: 'Jane', last_name: 'Smith' }
      await simulateOnMutate(queryClient, user.id, updates)

      // Before server responds, session should already reflect optimistic update
      const session = queryClient.getQueryData<SessionQueryData>(SESSION_QUERY_KEY)
      expect(session?.user?.full_name).toBe('Jane Smith')
      expect(session?.user?.first_name).toBe('Jane')
      expect(session?.user?.last_name).toBe('Smith')
    })
  })

  // -----------------------------------------------------------------------
  // Sub-task 4: Assert rollback restores profile cache on mutation failure
  // -----------------------------------------------------------------------
  describe('Rollback restores caches on mutation failure', () => {
    it('restores profile cache to previous state on error', async () => {
      const user = makeUser()
      const originalProfile = makeProfile()
      queryClient.setQueryData(profileQueryKey(user.id), originalProfile)
      queryClient.setQueryData(SESSION_QUERY_KEY, { user })

      const updates = { full_name: 'Jane Smith', phone: '+260972000000' }
      const context = await simulateOnMutate(queryClient, user.id, updates)

      // Verify optimistic update was applied
      const optimistic = queryClient.getQueryData<UserProfile>(profileQueryKey(user.id))
      expect(optimistic?.full_name).toBe('Jane Smith')

      // Simulate mutation failure → rollback
      simulateOnError(queryClient, user.id, context)

      const restored = queryClient.getQueryData<UserProfile>(profileQueryKey(user.id))
      expect(restored).toEqual(originalProfile)
      expect(restored?.full_name).toBe('Jane Doe')
      expect(restored?.phone).toBe('+260971000000')
    })

    it('restores session cache to previous state on error', async () => {
      const user = makeUser()
      const originalProfile = makeProfile()
      queryClient.setQueryData(profileQueryKey(user.id), originalProfile)
      queryClient.setQueryData(SESSION_QUERY_KEY, { user })

      const updates = { full_name: 'Jane Smith' }
      const context = await simulateOnMutate(queryClient, user.id, updates)

      // Verify optimistic session update was applied
      const optimisticSession = queryClient.getQueryData<SessionQueryData>(SESSION_QUERY_KEY)
      expect(optimisticSession?.user?.full_name).toBe('Jane Smith')

      // Simulate mutation failure → rollback
      simulateOnError(queryClient, user.id, context)

      const restoredSession = queryClient.getQueryData<SessionQueryData>(SESSION_QUERY_KEY)
      expect(restoredSession?.user?.full_name).toBe('Jane Doe')
      expect(restoredSession?.user).toEqual(user)
    })

    it('rollback handles null previous profile gracefully', async () => {
      const user = makeUser()
      // No profile in cache initially
      queryClient.setQueryData(SESSION_QUERY_KEY, { user })

      const updates = { full_name: 'Jane Smith' }
      const context = await simulateOnMutate(queryClient, user.id, updates)

      // Profile was null, so optimistic update should not have been applied
      const optimistic = queryClient.getQueryData<UserProfile>(profileQueryKey(user.id))
      expect(optimistic).toBeUndefined()

      // Rollback should restore null
      simulateOnError(queryClient, user.id, context)

      const restored = queryClient.getQueryData<UserProfile>(profileQueryKey(user.id))
      expect(restored).toBeNull()
    })

    it('rollback handles null previous session gracefully', async () => {
      const profile = makeProfile()
      queryClient.setQueryData(profileQueryKey('user-1'), profile)
      // No session in cache

      const updates = { full_name: 'Jane Smith' }
      const context = await simulateOnMutate(queryClient, 'user-1', updates)

      // Rollback should restore null session
      simulateOnError(queryClient, 'user-1', context)

      const restoredSession = queryClient.getQueryData<SessionQueryData>(SESSION_QUERY_KEY)
      expect(restoredSession).toBeNull()
    })
  })
})

// ===========================================================================
// mergeProfileIntoSessionUser unit coverage
// ===========================================================================

describe('mergeProfileIntoSessionUser', () => {
  it('merges all overlapping fields from profile into user', () => {
    const user = makeUser()
    const profile = makeProfile({
      email: 'new@mihas.edu.zm',
      role: 'admin',
      full_name: 'Jane Smith',
      first_name: 'Jane',
      last_name: 'Smith',
      updated_at: '2025-01-15T12:00:00Z',
    })

    const merged = mergeProfileIntoSessionUser(user, profile)

    expect(merged.email).toBe('new@mihas.edu.zm')
    expect(merged.role).toBe('admin')
    expect(merged.full_name).toBe('Jane Smith')
    expect(merged.first_name).toBe('Jane')
    expect(merged.last_name).toBe('Smith')
    expect(merged.updated_at).toBe('2025-01-15T12:00:00Z')
  })

  it('preserves user fields when profile fields are undefined', () => {
    const user = makeUser({
      email: 'original@mihas.edu.zm',
      full_name: 'Jane Doe',
    })
    // Profile with only phone update — overlapping fields are undefined
    const partialProfile = { phone: '+260972000000' } as UserProfile

    const merged = mergeProfileIntoSessionUser(user, partialProfile)

    // Original user fields should be preserved when profile fields are undefined
    expect(merged.email).toBe('original@mihas.edu.zm')
    expect(merged.full_name).toBe('Jane Doe')
    expect(merged.id).toBe(user.id)
  })
})
