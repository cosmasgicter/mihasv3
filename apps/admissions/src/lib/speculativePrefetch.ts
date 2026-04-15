/**
 * Speculative Prefetch — Instagram-style predictive data loading
 *
 * Starts loading data the user will need next before they navigate,
 * using dead time (typing password, reading content) to hide latency.
 */
import { queryClient } from '@/lib/queryClient'
import { catalogService } from '@/services/catalog'
import { preloadStudentWorkspaceRoute, preloadAdminWorkspaceRoute } from '@/lib/routePreload'

// ---------------------------------------------------------------------------
// Network-awareness guard (reuses the same pattern as routePreload.ts)
// ---------------------------------------------------------------------------

type NetworkInformationLike = {
  effectiveType?: string
  saveData?: boolean
}

type NavigatorWithConnection = Navigator & {
  connection?: NetworkInformationLike
  mozConnection?: NetworkInformationLike
  webkitConnection?: NetworkInformationLike
}

function canPrefetch(): boolean {
  if (typeof window === 'undefined') return false

  const nav = typeof navigator !== 'undefined' ? (navigator as NavigatorWithConnection) : null
  const connection = nav?.connection || nav?.mozConnection || nav?.webkitConnection || null
  if (!connection) return true
  if (connection.saveData) return false
  return !['slow-2g', '2g'].includes(connection.effectiveType || '')
}

// ---------------------------------------------------------------------------
// Deduplication set
// ---------------------------------------------------------------------------

const prefetched = new Set<string>()

// ---------------------------------------------------------------------------
// Public triggers
// ---------------------------------------------------------------------------

/**
 * Called when the user blurs the email field on the sign-in page.
 * They still need to type their password — use that dead time to
 * preload the authenticated shell and dashboard chunks.
 */
export function onSignInEmailBlur(): void {
  if (prefetched.has('email-blur')) return
  prefetched.add('email-blur')

  preloadStudentWorkspaceRoute('email-blur')
}

/**
 * Called immediately after a successful login response.
 * Preloads the right workspace chunks based on role and kicks off
 * catalog + profile prefetches in parallel with the redirect.
 */
export function onLoginSuccess(loginResponse: unknown, role?: string): void {
  if (prefetched.has('login-success')) return
  prefetched.add('login-success')

  const isAdmin = role === 'admin' || role === 'super_admin'
  if (isAdmin) {
    preloadAdminWorkspaceRoute('post-login')
  } else {
    preloadStudentWorkspaceRoute('post-login')
  }

  prefetchCatalogData()
  prefetchProfile()
}

/**
 * Called when the student dashboard mounts.
 * Prefetches data the user is likely to need next:
 * - Catalog data (for the application wizard)
 * - Application wizard chunk (in idle time)
 */
export function onDashboardMount(): void {
  if (prefetched.has('dashboard-mount')) return
  prefetched.add('dashboard-mount')

  prefetchCatalogData()

  // Preload the wizard chunk during idle time
  const idle = typeof requestIdleCallback === 'function'
    ? requestIdleCallback
    : (cb: () => void) => setTimeout(cb, 2000)

  idle(() => {
    import('@/pages/student/applicationWizard/index').catch(() => {})
  })
}

// ---------------------------------------------------------------------------
// Internal prefetch helpers
// ---------------------------------------------------------------------------

/**
 * Prefetch catalog data (programs, intakes, subjects).
 * Seeds both the `['catalog', 'x']` keys (used by data/catalog.ts hooks)
 * and the bare `['x']` keys (used by useApplicationDataQueries hooks)
 * so whichever the wizard resolves first is already warm.
 */
function prefetchCatalogData(): void {
  if (!canPrefetch()) return
  if (prefetched.has('catalog')) return
  prefetched.add('catalog')

  const staleTime = 10 * 60_000 // matches QUERY_CACHE_CONFIG.static

  // Programs — seed both key shapes
  const programsFn = () => catalogService.getPrograms()
  if (!queryClient.getQueryData(['catalog', 'programs'])) {
    queryClient.prefetchQuery({
      queryKey: ['catalog', 'programs'],
      queryFn: programsFn,
      staleTime,
    }).catch(() => {})
  }
  if (!queryClient.getQueryData(['programs'])) {
    queryClient.prefetchQuery({
      queryKey: ['programs'],
      queryFn: programsFn,
      staleTime,
    }).catch(() => {})
  }

  // Intakes
  const intakesFn = () => catalogService.getIntakes()
  if (!queryClient.getQueryData(['catalog', 'intakes'])) {
    queryClient.prefetchQuery({
      queryKey: ['catalog', 'intakes'],
      queryFn: intakesFn,
      staleTime,
    }).catch(() => {})
  }
  if (!queryClient.getQueryData(['intakes'])) {
    queryClient.prefetchQuery({
      queryKey: ['intakes'],
      queryFn: intakesFn,
      staleTime,
    }).catch(() => {})
  }

  // Subjects
  if (!queryClient.getQueryData(['catalog', 'subjects'])) {
    queryClient.prefetchQuery({
      queryKey: ['catalog', 'subjects'],
      queryFn: () => catalogService.getSubjects(),
      staleTime,
    }).catch(() => {})
  }
}

/**
 * Prefetch the user's profile data.
 */
function prefetchProfile(): void {
  if (!canPrefetch()) return
  if (prefetched.has('profile')) return
  prefetched.add('profile')

  queryClient.prefetchQuery({
    queryKey: ['user-profile', undefined],
    queryFn: async () => {
      const { apiClient } = await import('@/services/client')
      return apiClient.request('/auth/profile/', { method: 'GET' })
    },
    staleTime: 5 * 60_000,
  }).catch(() => {
    prefetched.delete('profile')
  })
}

// ---------------------------------------------------------------------------
// Reset (call on logout)
// ---------------------------------------------------------------------------

export function resetPrefetchState(): void {
  prefetched.clear()
}
