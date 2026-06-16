/**
 * Speculative Prefetch — route-aware predictive data loading
 *
 * Prefetches data + chunks the user will need next based on:
 * - Current location (what pages are reachable from here?)
 * - User role (student vs admin)
 * - Network quality (skip on 2G/save-data)
 * - Idle time (use requestIdleCallback to avoid blocking)
 *
 * Goal: every page transition feels instant.
 */
import { isAdmin as checkIsAdmin } from '@/types/roles'
import { queryClient } from '@/lib/queryClient'
import {
  preloadStudentWorkspaceRoute,
  preloadAdminWorkspaceRoute,
  preloadAuthRoutes,
} from '@/lib/routePreload'

// ---------------------------------------------------------------------------
// Network-awareness guard
// ---------------------------------------------------------------------------

type NetworkInfo = { effectiveType?: string; saveData?: boolean }
type NavWithConn = Navigator & {
  connection?: NetworkInfo
  mozConnection?: NetworkInfo
  webkitConnection?: NetworkInfo
}

function canPrefetch(): boolean {
  if (typeof window === 'undefined') return false
  const nav = navigator as NavWithConn
  const c = nav?.connection || nav?.mozConnection || nav?.webkitConnection
  if (!c) return true
  if (c.saveData) return false
  return !['slow-2g', '2g'].includes(c.effectiveType || '')
}

/** Schedule work during idle time with fallback */
function idle(fn: () => void): void {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(fn, { timeout: 3000 })
  } else {
    setTimeout(fn, 150)
  }
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

const done = new Set<string>()

function once(key: string, fn: () => void): void {
  if (done.has(key) || !canPrefetch()) return
  done.add(key)
  fn()
}

// ---------------------------------------------------------------------------
// Data prefetch helpers
// ---------------------------------------------------------------------------

const STATIC_STALE = 10 * 60_000

function prefetchQuery(key: readonly unknown[], fn: () => Promise<unknown>, staleTime = STATIC_STALE): void {
  if (queryClient.getQueryData(key)) return
  queryClient.prefetchQuery({ queryKey: key, queryFn: fn, staleTime }).catch(() => {})
}

function prefetchCatalog(): void {
  once('catalog', () => {
    prefetchQuery(['catalog', 'programs'], async () => {
      const { catalogService } = await import('@/services/catalog')
      return catalogService.getPrograms()
    })
    prefetchQuery(['catalog', 'intakes'], async () => {
      const { catalogService } = await import('@/services/catalog')
      return catalogService.getIntakes()
    })
    prefetchQuery(['catalog', 'subjects'], async () => {
      const { catalogService } = await import('@/services/catalog')
      return catalogService.getSubjects()
    })
  })
}

function prefetchProfile(userId?: string): void {
  if (!userId) return
  once(`profile:${userId}`, () => {
    prefetchQuery(
      ['user-profile', userId],
      async () => {
        const { apiClient } = await import('@/services/client')
        return apiClient.request('/auth/profile/', { method: 'GET' })
      },
      5 * 60_000,
    )
  })
}

function prefetchAdminDashboard(): void {
  once('admin-dashboard-data', () => {
    prefetchQuery(
      ['admin-dashboard-polling'],
      async () => {
        const { adminDashboardService } = await import('@/services/admin/dashboard')
        const overview = await adminDashboardService.getOverview()
        // Must match the shape produced by useAdminDashboardPolling's queryFn
        // ({ stats, activity }). Seeding bare stats here desyncs the cache and
        // crashes the poller (query.data.stats === undefined).
        return { stats: overview.stats, activity: overview.recentActivity ?? [] }
      },
      30_000,
    )
  })
}

function prefetchStudentApplications(userId?: string): void {
  if (!userId) return
  once(`student-apps:${userId}`, () => {
    prefetchQuery(
      ['payment-applications', userId],
      async () => {
        const { applicationService } = await import('@/services/applications')
        const r = await applicationService.list({ mine: true })
        return (r.applications ?? []).map((app: Record<string, unknown>) => ({
          id: app.id, status: app.status,
          payment_status: typeof app.payment_status === 'string' ? app.payment_status : null,
          program: typeof app.program === 'string' ? app.program : null,
          full_name: typeof app.full_name === 'string' ? app.full_name : null,
          email: typeof app.email === 'string' ? app.email : null,
          phone: typeof app.phone === 'string' ? app.phone : null,
          application_fee: app.application_fee ?? null,
          created_at: typeof app.created_at === 'string' ? app.created_at : new Date().toISOString(),
          last_payment_audit_notes: typeof app.last_payment_audit_notes === 'string' ? app.last_payment_audit_notes : null,
        }))
      },
      2 * 60_000,
    )
  })
}

function prefetchNotificationPrefs(userId?: string): void {
  if (!userId) return
  once('notif-prefs', () => {
    prefetchQuery(
      ['notification_preferences', userId],
      async () => {
        const { apiClient } = await import('@/services/client')
        return apiClient.request('/notifications/preferences/')
      },
      5 * 60_000,
    )
  })
}

function prefetchAdminUsers(): void {
  once('admin-users', () => {
    prefetchQuery(
      ['admin', 'users'],
      async () => {
        const { userService } = await import('@/services/admin/users')
        return userService.list()
      },
      60_000,
    )
  })
}

// ---------------------------------------------------------------------------
// Chunk preload helpers
// ---------------------------------------------------------------------------

function preloadChunks(imports: Array<() => Promise<unknown>>): void {
  idle(() => {
    for (const imp of imports) imp().catch(() => {})
  })
}

function preloadStudentSecondaryPages(): void {
  once('student-secondary-chunks', () => {
    preloadChunks([
      () => import('@/pages/student/Payment'),
      () => import('@/pages/student/ApplicationStatus'),
      () => import('@/pages/student/Settings'),
    ])
  })
}

function preloadStudentWizard(): void {
  once('wizard-chunk', () => {
    idle(() => { import('@/pages/student/applicationWizard/index').catch(() => {}) })
  })
}

function preloadAdminSecondaryPages(): void {
  once('admin-secondary-chunks', () => {
    preloadChunks([
      () => import('@/pages/admin/Applications'),
      () => import('@/pages/admin/Programs'),
      () => import('@/pages/admin/Users'),
    ])
  })
}

// ---------------------------------------------------------------------------
// Public triggers — called from components at key moments
// ---------------------------------------------------------------------------

/**
 * Landing page mounted. Preload auth routes in idle time so sign-in
 * page loads instantly when the user clicks "Apply Now".
 */
export function onLandingMount(): void {
  once('landing', () => {
    idle(() => { preloadAuthRoutes('landing-idle') })
  })
}

/**
 * Public tracker page mounted. Preload auth routes since users
 * often sign in after checking their application status.
 */
export function onTrackerMount(): void {
  once('tracker', () => {
    idle(() => { preloadAuthRoutes('tracker-idle') })
  })
}

/**
 * User blurred the email field on sign-in. They still need to type
 * their password — use that dead time to preload workspace chunks.
 */
export function onSignInEmailBlur(): void {
  once('email-blur', () => {
    preloadStudentWorkspaceRoute('email-blur')
  })
}

/**
 * Login succeeded. Preload everything the user will need based on role.
 */
export function onLoginSuccess(_response: unknown, role?: string): void {
  once('login-success', () => {
    // Defer all prefetch + chunk-preload work to idle time so it never
    // competes with the post-login navigation + the destination page's own
    // first paint and data fetch. The login→dashboard transition is the
    // critical path; speculative work waits for the main thread to settle.
    idle(() => {
      const isAdmin = checkIsAdmin({ role })

      if (isAdmin) {
        preloadAdminWorkspaceRoute('post-login')
        prefetchCatalog()
        prefetchProfile()
        // Prefetch admin dashboard data in parallel with redirect
        prefetchAdminDashboard()
      } else {
        preloadStudentWorkspaceRoute('post-login')
        prefetchCatalog()
        prefetchProfile()
      }
    })
  })
}

/**
 * Student dashboard mounted. Prefetch data for pages they'll visit next.
 */
export function onDashboardMount(userId?: string): void {
  once(`dashboard-mount:${userId ?? 'anonymous'}`, () => {
    // Keep dashboard entry lightweight: preload only the next-most-likely route.
    preloadStudentWizard()
  })
}

/**
 * Admin dashboard mounted. Prefetch data for pages they'll visit next.
 */
export function onAdminDashboardMount(): void {
  once('admin-dashboard-mount', () => {
    prefetchCatalog()
    // Preload secondary admin pages during idle
    preloadAdminSecondaryPages()
    // Prefetch users list (admins almost always visit this)
    idle(() => { prefetchAdminUsers() })
  })
}

/**
 * Student navigated to the application wizard. Prefetch subjects
 * (needed for education step) if not already cached.
 */
export function onWizardMount(): void {
  once('wizard-mount', () => {
    prefetchCatalog()
  })
}

/**
 * Student navigated to settings. Prefetch notification preferences
 * since the notification settings tab is one click away.
 */
export function onSettingsMount(userId?: string): void {
  prefetchNotificationPrefs(userId)
}

// ---------------------------------------------------------------------------
// Reset (call on logout)
// ---------------------------------------------------------------------------

export function resetPrefetchState(): void {
  done.clear()
}
