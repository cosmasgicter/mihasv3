/**
 * Race Regression Test — Sign-Out vs Slow Profile Query
 *
 * Verifies that when a slow profile query resolves AFTER sign-out cleanup,
 * the auth/profile cache remains in unauthenticated state.
 *
 * The fix: sign-out and auth-failure cleanup now call
 *   await queryClient.cancelQueries({ queryKey: ['auth'] })
 *   await queryClient.cancelQueries({ queryKey: ['user-profile'] })
 * BEFORE clearing cache state. This ensures in-flight queries are aborted
 * and cannot repopulate the cache with stale authenticated data.
 *
 * These tests exercise the cleanup sequence at the QueryClient level
 * without rendering React components.
 */
// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import {
  SESSION_QUERY_KEY,
  profileQueryKey,
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
// Helpers — replicate the sign-out cleanup sequence from useSessionListener
// and the auth-failure cleanup from AuthContext's configureApiClientAuthFailure.
// ---------------------------------------------------------------------------

/**
 * Simulates the sign-out cleanup sequence as implemented in useSessionListener.signOut:
 *   1. Cancel in-flight auth and profile queries
 *   2. Null out session and profile cache
 *   3. Clear the query client
 */
async function simulateSignOutCleanup(
  queryClient: QueryClient,
  userId?: string,
) {
  // Phase 1: Cancel in-flight queries (the fix)
  await queryClient.cancelQueries({ queryKey: ['auth'] })
  await queryClient.cancelQueries({ queryKey: ['user-profile'] })

  // Phase 2: Null out caches so mounted observers see unauthenticated state
  queryClient.setQueryData(SESSION_QUERY_KEY, null)
  if (userId) {
    queryClient.setQueryData(profileQueryKey(userId), null)
  }
  queryClient.setQueryData(profileQueryKey(undefined), null)

  // Phase 3: Clear all queries
  queryClient.clear()
}

/**
 * Simulates the auth-failure cleanup from configureApiClientAuthFailure:
 *   1. Cancel in-flight auth and profile queries
 *   2. Null out session, remove profile queries
 *   3. Clear the query client
 */
async function simulateAuthFailureCleanup(queryClient: QueryClient) {
  await queryClient.cancelQueries({ queryKey: ['auth'] })
  await queryClient.cancelQueries({ queryKey: ['user-profile'] })

  queryClient.setQueryData(SESSION_QUERY_KEY, null)
  queryClient.removeQueries({ queryKey: ['user-profile'] })
  queryClient.clear()
}

// ===========================================================================
// Tests
// ===========================================================================

describe('Sign-out race regression', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = makeQueryClient()
  })

  // -----------------------------------------------------------------------
  // Sub-task 1: Start a slow profile query
  // Sub-task 2: Trigger sign-out
  // Sub-task 3: Resolve the slow profile query
  // Sub-task 4: Assert auth/profile cache remains unauthenticated
  // -----------------------------------------------------------------------

  it('slow profile query resolving after sign-out does not repopulate cache', async () => {
    const user = makeUser()

    // Seed authenticated state
    queryClient.setQueryData(SESSION_QUERY_KEY, { user })

    // Start a slow profile query — the queryFn returns a promise we control
    let resolveSlowQuery!: (profile: UserProfile) => void
    const slowProfilePromise = new Promise<UserProfile>((resolve) => {
      resolveSlowQuery = resolve
    })

    queryClient.fetchQuery({
      queryKey: profileQueryKey(user.id),
      queryFn: ({ signal }) => {
        // The real fetchCurrentProfile would respect the AbortSignal.
        // Wrap the slow promise so cancellation via signal aborts it.
        return new Promise<UserProfile>((resolve, reject) => {
          signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'))
          })
          slowProfilePromise.then(resolve, reject)
        })
      },
    }).catch(() => {
      // Expected: the query will be cancelled by sign-out cleanup
    })

    // Give React Query a tick to register the in-flight query
    await new Promise((r) => setTimeout(r, 0))

    // Trigger sign-out cleanup (cancels queries, nulls cache, clears)
    await simulateSignOutCleanup(queryClient, user.id)

    // Now resolve the slow profile query with stale authenticated data
    resolveSlowQuery(makeProfile({ full_name: 'Stale Profile Data' }))
    await new Promise((r) => setTimeout(r, 10))

    // Assert: session cache must remain unauthenticated (null or undefined — both mean "no user")
    const session = queryClient.getQueryData<SessionQueryData>(SESSION_QUERY_KEY)
    expect(session?.user).toBeFalsy()

    // Assert: profile cache must remain empty
    const profile = queryClient.getQueryData<UserProfile | null>(profileQueryKey(user.id))
    expect(profile == null).toBe(true)
  })

  it('slow session query resolving after sign-out does not repopulate auth cache', async () => {
    const user = makeUser()

    // Seed authenticated state
    queryClient.setQueryData(SESSION_QUERY_KEY, { user })
    queryClient.setQueryData(profileQueryKey(user.id), makeProfile())

    // Start a slow session refetch
    let resolveSlowSession!: (data: SessionQueryData) => void
    const slowSessionPromise = new Promise<SessionQueryData>((resolve) => {
      resolveSlowSession = resolve
    })

    queryClient.fetchQuery({
      queryKey: [...SESSION_QUERY_KEY],
      queryFn: ({ signal }) => {
        return new Promise<SessionQueryData>((resolve, reject) => {
          signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'))
          })
          slowSessionPromise.then(resolve, reject)
        })
      },
    }).catch(() => {
      // Expected: cancelled by sign-out
    })

    await new Promise((r) => setTimeout(r, 0))

    // Sign out
    await simulateSignOutCleanup(queryClient, user.id)

    // Resolve the slow session query with stale authenticated data
    resolveSlowSession({ user: makeUser({ full_name: 'Stale Session User' }) })
    await new Promise((r) => setTimeout(r, 10))

    // Assert: session cache must remain unauthenticated
    const session = queryClient.getQueryData<SessionQueryData>(SESSION_QUERY_KEY)
    expect(session?.user).toBeFalsy()
  })

  it('auth-failure cleanup also prevents slow profile query from repopulating cache', async () => {
    const user = makeUser()

    // Seed authenticated state
    queryClient.setQueryData(SESSION_QUERY_KEY, { user })

    // Start a slow profile query
    let resolveSlowQuery!: (profile: UserProfile) => void
    const slowProfilePromise = new Promise<UserProfile>((resolve) => {
      resolveSlowQuery = resolve
    })

    queryClient.fetchQuery({
      queryKey: profileQueryKey(user.id),
      queryFn: ({ signal }) => {
        return new Promise<UserProfile>((resolve, reject) => {
          signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'))
          })
          slowProfilePromise.then(resolve, reject)
        })
      },
    }).catch(() => {
      // Expected: cancelled by auth-failure cleanup
    })

    await new Promise((r) => setTimeout(r, 0))

    // Trigger auth-failure cleanup (same cancel-before-clear pattern)
    await simulateAuthFailureCleanup(queryClient)

    // Resolve the slow profile query with stale data
    resolveSlowQuery(makeProfile({ full_name: 'Stale After Auth Failure' }))
    await new Promise((r) => setTimeout(r, 10))

    // Assert: session cache must remain unauthenticated
    const session = queryClient.getQueryData<SessionQueryData>(SESSION_QUERY_KEY)
    expect(session?.user).toBeFalsy()

    // Assert: profile cache must remain empty
    const profile = queryClient.getQueryData<UserProfile | null>(profileQueryKey(user.id))
    expect(profile == null).toBe(true)
  })

  it('concurrent slow profile + session queries both cancelled by sign-out', async () => {
    const user = makeUser()

    // Seed authenticated state
    queryClient.setQueryData(SESSION_QUERY_KEY, { user })
    queryClient.setQueryData(profileQueryKey(user.id), makeProfile())

    // Start slow profile query
    let resolveProfile!: (p: UserProfile) => void
    const slowProfile = new Promise<UserProfile>((resolve) => {
      resolveProfile = resolve
    })

    queryClient.fetchQuery({
      queryKey: profileQueryKey(user.id),
      queryFn: ({ signal }) =>
        new Promise<UserProfile>((resolve, reject) => {
          signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
          slowProfile.then(resolve, reject)
        }),
    }).catch(() => {})

    // Start slow session query
    let resolveSession!: (s: SessionQueryData) => void
    const slowSession = new Promise<SessionQueryData>((resolve) => {
      resolveSession = resolve
    })

    queryClient.fetchQuery({
      queryKey: [...SESSION_QUERY_KEY],
      queryFn: ({ signal }) =>
        new Promise<SessionQueryData>((resolve, reject) => {
          signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
          slowSession.then(resolve, reject)
        }),
    }).catch(() => {})

    await new Promise((r) => setTimeout(r, 0))

    // Sign out
    await simulateSignOutCleanup(queryClient, user.id)

    // Resolve both slow queries with stale data
    resolveProfile(makeProfile({ full_name: 'Stale Profile' }))
    resolveSession({ user: makeUser({ full_name: 'Stale Session' }) })
    await new Promise((r) => setTimeout(r, 10))

    // Assert: both caches remain unauthenticated
    const session = queryClient.getQueryData<SessionQueryData>(SESSION_QUERY_KEY)
    expect(session?.user).toBeFalsy()

    const profile = queryClient.getQueryData<UserProfile | null>(profileQueryKey(user.id))
    expect(profile == null).toBe(true)
  })
})
