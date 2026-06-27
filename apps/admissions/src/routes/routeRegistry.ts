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
  | 'auth.callback'
  | 'payment.callback'
  | 'dashboard.redirect'
  | 'student.dashboard'
  | 'student.applicationWizard'
  | 'student.status'
  | 'student.applicationDetail'
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
  aliases?: string[]
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
  studentStatus: {
    id: 'student.status',
    path: '/student/status',
    aliases: ['/student/application-status', '/application/:id', '/student/application/:id/status'],
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
  studentApplicationDetail: {
    id: 'student.applicationDetail',
    path: '/student/application/:id',
    guard: 'student',
    skeletonType: 'detail',
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
    path: '/student/notifications',
    guard: 'student',
    skeletonType: 'detail',
    nav: { label: 'Notifications', icon: Bell, desktop: true, mobile: true, order: 60, section: 'student' },
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
    path: '/student/communications',
    guard: 'student',
    skeletonType: 'detail',
    nav: { label: 'Communications', icon: MessageSquare, desktop: true, order: 25, section: 'student' },
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

export function studentApplicationResumePath(draftId: string): string {
  const query = new URLSearchParams({ mode: 'resume', draftId })
  return `${pathFor('student.applicationWizard')}?${query.toString()}`
}

export function studentApplicationLocalResumePath(): string {
  const query = new URLSearchParams({ localDraft: 'true' })
  return `${pathFor('student.applicationWizard')}?${query.toString()}`
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

export function routeByPath(pathname: string): ProductRouteDefinition | null {
  return [...PRODUCT_ROUTES]
    .sort((a, b) => b.path.length - a.path.length)
    .find((route) => matchesRoutePath(pathname, route)) ?? null
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
