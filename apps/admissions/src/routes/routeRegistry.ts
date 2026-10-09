import type { LucideIcon } from 'lucide-react'
import {
  Bell,
  BriefcaseBusiness,
  Calendar,
  CreditCard,
  DollarSign,
  FileSearch,
  FileText,
  GraduationCap,
  Home,
  LayoutDashboard,
  MessageSquare,
  Search,
  Settings,
  User,
  Users,
} from 'lucide-react'

export type RouteGuard = 'public' | 'auth' | 'student' | 'admin'

export type SkeletonType = 'dashboard' | 'wizard' | 'admin-table' | 'auth' | 'detail' | 'none'

export type ProductRouteId =
  | 'public.home'
  | 'public.trackApplication'
  | 'public.contact'
  | 'public.terms'
  | 'public.privacy'
  | 'auth.signIn'
  | 'auth.signUp'
  | 'auth.forgotPassword'
  | 'auth.resetPassword'
  | 'auth.acceptInvitation'
  | 'auth.callback'
  | 'payment.callback'
  | 'dashboard.redirect'
  | 'student.dashboard'
  | 'student.applicationWizard'
  | 'student.status'
  | 'student.settings'
  | 'student.notifications'
  | 'student.payment'
  | 'student.interview'
  | 'student.communications'
  | 'student.history'
  | 'admin.home'
  | 'admin.dashboard'
  | 'admin.profile'
  | 'admin.applications'
  | 'admin.programs'
  | 'admin.tenants'
  | 'admin.tenantOnboarding'
  | 'admin.intakes'
  | 'admin.users'
  | 'admin.audit'
  | 'admin.programFees'
  | 'admin.settings'
  | 'notFound'

export interface RouteNavMetadata {
  label: string
  icon: LucideIcon
  desktop?: boolean
  mobile?: boolean
  order: number
  section?: 'main' | 'management' | 'system' | 'student' | 'public'
  activeMatchPaths?: string[]
}

export interface ProductRouteDefinition {
  id: ProductRouteId
  path: string
  /**
   * Additional live paths that render the same page. An alias is *equivalent* to
   * `path` — both resolve, neither redirects.
   */
  aliases?: string[]
  /**
   * Paths that used to be a **second implementation** of this route and now
   * redirect to it (task 10.6, R13.13).
   *
   * Deliberately not an alias. An alias keeps two live URLs for one surface,
   * which is the shape R13.13 forbids; a duplicate redirect keeps the old
   * bookmark working while leaving exactly one address at which the workspace
   * actually renders. `matchesRoutePath` therefore ignores these — a duplicate
   * path is not this route, it is a hop to it — while `routeByPath` still
   * resolves them so a caller can tell the difference between "retired
   * duplicate" and "unknown URL".
   */
  duplicateRedirects?: string[]
  guard: RouteGuard
  skeletonType: SkeletonType
  requiresSuperAdmin?: boolean
  requiredCapabilities?: string[]
  nav?: RouteNavMetadata
}

export const ROUTES = {
  publicHome: {
    id: 'public.home',
    path: '/',
    guard: 'public',
    skeletonType: 'none',
    nav: { label: 'Home', icon: Home, mobile: true, order: 10, section: 'public' },
  },
  publicTrackApplication: {
    id: 'public.trackApplication',
    path: '/track-application',
    guard: 'public',
    skeletonType: 'detail',
    nav: { label: 'Track', icon: Search, mobile: true, order: 20, section: 'public' },
  },
  publicContact: {
    id: 'public.contact',
    path: '/contact',
    guard: 'public',
    skeletonType: 'none',
  },
  publicTerms: {
    id: 'public.terms',
    path: '/terms',
    guard: 'public',
    skeletonType: 'none',
  },
  publicPrivacy: {
    id: 'public.privacy',
    path: '/privacy',
    guard: 'public',
    skeletonType: 'none',
  },
  authSignIn: {
    id: 'auth.signIn',
    path: '/auth/signin',
    aliases: ['/signin', '/login'],
    guard: 'public',
    skeletonType: 'auth',
    nav: { label: 'Sign In', icon: User, mobile: true, order: 30, section: 'public' },
  },
  authSignUp: {
    id: 'auth.signUp',
    path: '/auth/signup',
    guard: 'public',
    skeletonType: 'auth',
  },
  authForgotPassword: {
    id: 'auth.forgotPassword',
    path: '/auth/forgot-password',
    guard: 'public',
    skeletonType: 'auth',
  },
  authResetPassword: {
    id: 'auth.resetPassword',
    path: '/auth/reset-password',
    guard: 'public',
    skeletonType: 'auth',
  },
  // Staff-invitation acceptance handoff (task 4.2, R4.3): an invited tenant
  // admin/reviewer sets their OWN password by consuming a single-use token.
  // Public — the invitee is not yet signed in. Must match the backend link in
  // backend/apps/common/email_links.py → ROUTE_ACCEPT_INVITATION.
  authAcceptInvitation: {
    id: 'auth.acceptInvitation',
    path: '/auth/accept-invitation',
    guard: 'public',
    skeletonType: 'auth',
  },
  authCallback: {
    id: 'auth.callback',
    path: '/auth/callback',
    guard: 'public',
    skeletonType: 'auth',
  },
  paymentCallback: {
    id: 'payment.callback',
    path: '/payment/callback',
    guard: 'public',
    skeletonType: 'detail',
  },
  dashboardRedirect: {
    id: 'dashboard.redirect',
    path: '/dashboard',
    guard: 'public',
    skeletonType: 'none',
  },
  studentDashboard: {
    id: 'student.dashboard',
    path: '/student/dashboard',
    guard: 'student',
    skeletonType: 'dashboard',
    nav: { label: 'Dashboard', icon: Home, desktop: true, mobile: true, order: 10, section: 'student' },
  },
  studentApplicationWizard: {
    id: 'student.applicationWizard',
    path: '/student/application-wizard',
    aliases: ['/apply', '/student/applications/new'],
    guard: 'student',
    skeletonType: 'wizard',
    nav: {
      label: 'Apply',
      icon: FileText,
      desktop: true,
      mobile: true,
      order: 20,
      section: 'student',
      activeMatchPaths: ['/student/application-wizard', '/apply'],
    },
  },
  /**
   * The one canonical student application workspace (task 10.6, R13.13,
   * finding **STU-23**).
   *
   * It owns status, next action, payment position, documents, interview,
   * conditions, amendments, enrollment readiness, status history and public
   * tracking for one application. `/student/application/:id` used to be a second
   * workspace over the same data; it is now a redirect (see
   * `DuplicateRouteRedirect` in `routes/config.tsx`), which is why it is listed
   * here as `duplicateRedirects` rather than as an alias — an alias would render
   * the workspace at two live URLs, and R13.13 asks for one.
   */
  studentStatus: {
    id: 'student.status',
    path: '/student/status',
    aliases: ['/student/application-status', '/application/:id', '/student/application/:id/status'],
    duplicateRedirects: ['/student/application/:id'],
    guard: 'student',
    skeletonType: 'detail',
    nav: {
      label: 'Application Status',
      icon: BriefcaseBusiness,
      mobile: true,
      order: 80,
      section: 'student',
      activeMatchPaths: ['/student/status'],
    },
  },
  studentSettings: {
    id: 'student.settings',
    path: '/student/settings',
    aliases: ['/settings', '/student/profile', '/student/profile/edit'],
    guard: 'student',
    skeletonType: 'detail',
    nav: {
      label: 'Profile & Settings',
      icon: Settings,
      desktop: true,
      mobile: true,
      order: 70,
      section: 'student',
      activeMatchPaths: ['/student/settings', '/student/profile'],
    },
  },
  studentNotifications: {
    id: 'student.notifications',
    // Task 10.1 (R13.8): preferences only. The inbox/history is
    // `student.communications`, which is the one place messages are read.
    path: '/student/notifications',
    guard: 'student',
    skeletonType: 'detail',
    nav: { label: 'Notification settings', icon: Bell, desktop: true, mobile: true, order: 60, section: 'student' },
  },
  studentPayment: {
    id: 'student.payment',
    path: '/student/payment',
    aliases: ['/student/payments'],
    guard: 'student',
    skeletonType: 'detail',
    nav: { label: 'Payment', icon: CreditCard, desktop: true, mobile: true, order: 30, section: 'student' },
  },
  studentInterview: {
    id: 'student.interview',
    path: '/student/interview',
    aliases: ['/student/interviews'],
    guard: 'student',
    skeletonType: 'detail',
    nav: { label: 'Interview', icon: Calendar, desktop: true, mobile: true, order: 40, section: 'student' },
  },
  studentCommunications: {
    id: 'student.communications',
    // Task 10.1 (R13.8): the single communications/inbox history. `mobile: true`
    // is not decoration — this is the student's primary mobile tab, so the flag
    // now matches where the navigation actually sends them.
    path: '/student/communications',
    guard: 'student',
    skeletonType: 'detail',
    nav: { label: 'Communications', icon: MessageSquare, desktop: true, mobile: true, order: 25, section: 'student' },
  },
  studentHistory: {
    id: 'student.history',
    path: '/student/history',
    guard: 'student',
    skeletonType: 'detail',
    nav: { label: 'Activity History', icon: FileSearch, desktop: true, order: 26, section: 'student' },
  },
  adminHome: {
    id: 'admin.home',
    path: '/admin',
    guard: 'admin',
    skeletonType: 'dashboard',
  },
  adminDashboard: {
    id: 'admin.dashboard',
    path: '/admin/dashboard',
    guard: 'admin',
    skeletonType: 'dashboard',
    nav: { label: 'Dashboard', icon: LayoutDashboard, desktop: true, mobile: true, order: 10, section: 'main' },
  },
  adminProfile: {
    id: 'admin.profile',
    path: '/admin/profile',
    guard: 'admin',
    skeletonType: 'detail',
    requiresSuperAdmin: true,
  },
  adminApplications: {
    id: 'admin.applications',
    path: '/admin/applications',
    guard: 'admin',
    skeletonType: 'admin-table',
    nav: { label: 'Applications', icon: FileText, desktop: true, mobile: true, order: 20, section: 'main' },
  },
  adminPrograms: {
    id: 'admin.programs',
    path: '/admin/programs',
    guard: 'admin',
    skeletonType: 'admin-table',
    requiresSuperAdmin: true,
    nav: { label: 'Programs', icon: GraduationCap, desktop: true, mobile: true, order: 40, section: 'management' },
  },
  adminTenants: {
    id: 'admin.tenants',
    path: '/admin/tenants',
    guard: 'admin',
    skeletonType: 'admin-table',
    nav: { label: 'Tenants', icon: Users, desktop: true, mobile: true, order: 35, section: 'management' },
  },
  adminTenantOnboarding: {
    id: 'admin.tenantOnboarding',
    path: '/admin/tenants/new',
    guard: 'admin',
    skeletonType: 'admin-table',
    requiresSuperAdmin: true,
  },
  adminIntakes: {
    id: 'admin.intakes',
    path: '/admin/intakes',
    guard: 'admin',
    skeletonType: 'admin-table',
    requiresSuperAdmin: true,
    nav: { label: 'Intakes', icon: Calendar, desktop: true, mobile: true, order: 50, section: 'management' },
  },
  adminUsers: {
    id: 'admin.users',
    path: '/admin/users',
    guard: 'admin',
    skeletonType: 'admin-table',
    nav: { label: 'Users', icon: Users, desktop: true, mobile: true, order: 30, section: 'management' },
  },
  adminAudit: {
    id: 'admin.audit',
    path: '/admin/audit',
    guard: 'admin',
    skeletonType: 'admin-table',
    requiresSuperAdmin: true,
    nav: { label: 'Audit Trail', icon: FileSearch, desktop: true, mobile: true, order: 80, section: 'system' },
  },
  adminProgramFees: {
    id: 'admin.programFees',
    path: '/admin/program-fees',
    guard: 'admin',
    skeletonType: 'admin-table',
    requiresSuperAdmin: true,
    nav: { label: 'Program Fees', icon: DollarSign, desktop: true, order: 60, section: 'management' },
  },
  adminSettings: {
    id: 'admin.settings',
    path: '/admin/settings',
    guard: 'admin',
    skeletonType: 'detail',
    requiresSuperAdmin: true,
    nav: { label: 'Settings', icon: Settings, desktop: true, mobile: true, order: 90, section: 'system' },
  },
  notFound: {
    id: 'notFound',
    path: '/404',
    guard: 'public',
    skeletonType: 'none',
  },
} as const satisfies Record<string, ProductRouteDefinition>

export const PRODUCT_ROUTES = Object.values(ROUTES)

export function routeById(id: ProductRouteId): ProductRouteDefinition {
  const route = PRODUCT_ROUTES.find((candidate) => candidate.id === id)
  if (!route) {
    throw new Error(`Unknown route id: ${id}`)
  }
  return route
}

export function pathFor(id: ProductRouteId): string {
  return routeById(id).path
}

export function studentApplicationNewPath(params: Record<string, string | undefined> = {}): string {
  const query = new URLSearchParams({ mode: 'new' })
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, value)
  })
  return `${pathFor('student.applicationWizard')}?${query.toString()}`
}

/**
 * The wizard step keys a link may address (admissions-v2 task 11.2).
 *
 * Declared here rather than imported from the wizard so the registry stays free of
 * page imports, and drift-guarded against `applicationWizard/steps/config.ts` by
 * `wizardMobileRecomposition.test.tsx` — one vocabulary, mechanically compared, the
 * same arrangement task 8.2 uses for the payment-phase mirror.
 */
export const WIZARD_DEEP_LINK_STEPS = [
  'program',
  'assignedSchool',
  'personal',
  'education',
  'payment',
  'submit',
] as const

export type WizardDeepLinkStep = (typeof WIZARD_DEEP_LINK_STEPS)[number]

/**
 * Resume one draft, optionally at the step a server action names (task 11.2).
 *
 * The step is *advisory*: the wizard clamps an unreachable one to the
 * assigned-school checkpoint (R10.3) and says so, so a link can never dead-end a
 * student on a step they have not earned. An unrecognised step is dropped rather
 * than passed through, which keeps this builder incapable of emitting a `?step=`
 * the wizard would ignore.
 */
export function studentApplicationResumePath(draftId: string, step?: string | null): string {
  const query = new URLSearchParams({ mode: 'resume', draftId })
  if (step && (WIZARD_DEEP_LINK_STEPS as readonly string[]).includes(step)) {
    query.set('step', step)
  }
  return `${pathFor('student.applicationWizard')}?${query.toString()}`
}

export function studentApplicationLocalResumePath(): string {
  const query = new URLSearchParams({ localDraft: 'true' })
  return `${pathFor('student.applicationWizard')}?${query.toString()}`
}

/**
 * The one canonical student application workspace URL for one application
 * (task 10.6, R13.13, finding STU-23).
 *
 * Every first-party link to a student's own application goes through this. The
 * point is not brevity: before 10.6 the app linked to `/student/application/:id`
 * from three places and to `/student/application/:id/status` from others, so two
 * different pages were reached from one dashboard depending on which control the
 * student pressed. A single builder means a future rename moves every caller at
 * once, and `studentDashboardTaskFirst.test.ts` §3 fails if a raw string appears
 * instead — which matters more since the guard below, because a caller that
 * builds the path by hand does not get it.
 *
 * An id that cannot address an application has no workspace URL, so it answers
 * the dashboard rather than a traversal path — the same fallback
 * `DuplicateRouteRedirect` uses for a missing param (see {@link isDotSegment}).
 */
export function studentApplicationWorkspacePath(applicationId: string): string {
  const segment = encodeURIComponent(applicationId ?? '')
  if (!segment || isDotSegment(segment)) return pathFor('student.dashboard')
  return `/student/application/${segment}/status`
}

/**
 * Whether an already-encoded path segment is a relative-path segment.
 *
 * `encodeURIComponent` is the guard task 10.6 put on the workspace builder, and
 * for a hostile id like `a/../../admin` it works: the slashes become `%2F`, so no
 * `..` survives as a segment of its own. What it cannot do is escape a *bare* `.`
 * or `..`, because `.` is an unreserved character — `encodeURIComponent('..')` is
 * `'..'`. Percent-encoding the dots is not a fix either: the URL standard defines
 * a double-dot segment ASCII-case-insensitively as `..`, `.%2e`, `%2e.` or
 * `%2e%2e`, so `%2E%2E` is normalised away exactly like `..`.
 *
 * So the honest answer is that such an id is not an application id at all. Found
 * by admissions-v2 task 11.1's property suite
 * (`studentNextAction.property.test.ts`, counterexample `applicationId: '..'`),
 * which quantifies over every path the student's next action can build.
 */
function isDotSegment(encodedSegment: string): boolean {
  const lowered = encodedSegment.toLowerCase()
  return (
    lowered === '.' ||
    lowered === '%2e' ||
    lowered === '..' ||
    lowered === '.%2e' ||
    lowered === '%2e.' ||
    lowered === '%2e%2e'
  )
}

/** The retired duplicate paths that now redirect into `route`. */
export function duplicateRedirectPaths(route: ProductRouteDefinition): string[] {
  return [...(route.duplicateRedirects ?? [])]
}

function matchesPathPattern(pathname: string, pattern: string): boolean {
  if (pathname === pattern || pathname.startsWith(`${pattern}/`)) return true

  const patternSegments = pattern.split('/').filter(Boolean)
  const pathSegments = pathname.split('/').filter(Boolean)
  if (patternSegments.length !== pathSegments.length) return false

  return patternSegments.every((segment, index) => segment.startsWith(':') || segment === pathSegments[index])
}

export function matchesRoutePath(pathname: string, route: ProductRouteDefinition): boolean {
  if (matchesPathPattern(pathname, route.path)) return true
  return Boolean(route.aliases?.some((alias) => matchesPathPattern(pathname, alias)))
}

/**
 * True when `pathname` is a retired duplicate that redirects into `route`
 * (task 10.6). Kept separate from `matchesRoutePath` on purpose: a duplicate
 * path is *not* this route — it is a hop to it — and collapsing the two would
 * make nav highlighting and skeleton selection treat a redirect as a
 * destination.
 */
export function matchesDuplicateRedirect(
  pathname: string,
  route: ProductRouteDefinition,
): boolean {
  return Boolean(route.duplicateRedirects?.some((path) => matchesPathPattern(pathname, path)))
}

export function routeByPath(pathname: string): ProductRouteDefinition | null {
  const sorted = [...PRODUCT_ROUTES].sort((a, b) => b.path.length - a.path.length)
  // Live paths win over retired duplicates: `/student/application/:id/status` is
  // the workspace itself, and `/student/application/:id` is the redirect into it,
  // so the longer live path must be tested first or the redirect would swallow it.
  return (
    sorted.find((route) => matchesRoutePath(pathname, route)) ??
    sorted.find((route) => matchesDuplicateRedirect(pathname, route)) ??
    null
  )
}

export function routesByGuard(guard: RouteGuard): ProductRouteDefinition[] {
  return PRODUCT_ROUTES.filter((route) => route.guard === guard)
}

export function adminRoutes(): ProductRouteDefinition[] {
  return routesByGuard('admin')
}

export function studentRoutes(): ProductRouteDefinition[] {
  return routesByGuard('student')
}

export function adminNavRoutes(): ProductRouteDefinition[] {
  return adminRoutes()
    .filter((route) => route.nav?.desktop || route.nav?.mobile)
    .sort((a, b) => (a.nav?.order ?? 0) - (b.nav?.order ?? 0))
}

export function canAccessRoute(
  route: ProductRouteDefinition,
  options: {
    isSuperAdmin?: boolean
    hasCapability?: (capability: string) => boolean
  } = {},
): boolean {
  if (route.requiresSuperAdmin && !options.isSuperAdmin) return false
  if (route.requiredCapabilities?.length) {
    const hasCapability = options.hasCapability
    if (!hasCapability) return false
    return route.requiredCapabilities.every((capability) => hasCapability(capability))
  }
  return true
}

export function accessibleAdminNavRoutes(options: {
  isSuperAdmin?: boolean
  hasCapability?: (capability: string) => boolean
}): ProductRouteDefinition[] {
  return adminNavRoutes().filter((route) => canAccessRoute(route, options))
}

export function studentNavRoutes(): ProductRouteDefinition[] {
  return studentRoutes()
    .filter((route) => route.nav?.desktop || route.nav?.mobile)
    .sort((a, b) => (a.nav?.order ?? 0) - (b.nav?.order ?? 0))
}

export function publicNavRoutes(): ProductRouteDefinition[] {
  return routesByGuard('public')
    .filter((route) => route.nav?.section === 'public')
    .sort((a, b) => (a.nav?.order ?? 0) - (b.nav?.order ?? 0))
}

export const CANONICAL_ADMIN_TENANTS_PATH = pathFor('admin.tenants')
export const CANONICAL_ADMIN_TENANT_ONBOARDING_PATH = pathFor('admin.tenantOnboarding')
export const CANONICAL_ADMIN_DASHBOARD_PATH = pathFor('admin.dashboard')
export const CANONICAL_STUDENT_DASHBOARD_PATH = pathFor('student.dashboard')
export const CANONICAL_STUDENT_APPLICATION_WIZARD_PATH = pathFor('student.applicationWizard')
export const CANONICAL_SIGN_IN_PATH = pathFor('auth.signIn')
