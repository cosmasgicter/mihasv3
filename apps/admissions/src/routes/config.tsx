import React from 'react'
import LandingPage from '@/pages/LandingPage'

// Special components that don't need lazy loading
import { DashboardRedirect } from '@/components/DashboardRedirect'
import { Navigate } from 'react-router-dom'
import {
  CANONICAL_ADMIN_DASHBOARD_PATH,
  CANONICAL_SIGN_IN_PATH,
  CANONICAL_STUDENT_DASHBOARD_PATH,
  pathFor,
  routeById,
  studentApplicationNewPath,
  type ProductRouteId,
  type RouteGuard,
  type SkeletonType,
} from './routeRegistry'

// Lazy load secondary routes for optimal code splitting.
// Keep the landing page in the entry build so the first visit can paint
// meaningful content without waiting for a route-level chunk.

// Auth pages - loaded on demand
const SignInPage = React.lazy(() => import('@/pages/auth/SignInPage'))
const SignUpPage = React.lazy(() => import('@/pages/auth/SignUpPage'))
const ForgotPasswordPage = React.lazy(() => import('@/pages/auth/ForgotPasswordPage'))
const ResetPasswordPage = React.lazy(() => import('@/pages/auth/ResetPasswordPage'))
const TermsPage = React.lazy(() => import('@/pages/TermsPage'))
const PrivacyPage = React.lazy(() => import('@/pages/PrivacyPage'))

// Lazy load non-critical pages
const StudentDashboard = React.lazy(() => import('@/pages/student/Dashboard'))
const AuthCallbackPage = React.lazy(() => import('@/pages/auth/AuthCallbackPage'))
const PaymentCallback = React.lazy(() => import('@/pages/student/PaymentCallback'))
const ApplicationWizard = React.lazy(() => import('@/pages/student/applicationWizard/index'))
const ApplicationStatus = React.lazy(() => import('@/pages/student/ApplicationStatus'))
const ApplicationDetail = React.lazy(() => import('@/pages/student/ApplicationDetail'))
const StudentSettings = React.lazy(() => import('@/pages/student/Settings'))
const StudentNotificationSettings = React.lazy(() => import('@/pages/student/NotificationSettings'))
const StudentPayment = React.lazy(() => import('@/pages/student/Payment'))
const StudentInterview = React.lazy(() => import('@/pages/student/Interview'))
const StudentCommunications = React.lazy(() => import('@/pages/student/Communications'))
const StudentHistory = React.lazy(() => import('@/pages/student/History'))
const AdminDashboard = React.lazy(() => import('@/pages/admin/Dashboard'))
const AdminApplications = React.lazy(() => import('@/pages/admin/Applications'))
const AdminPrograms = React.lazy(() => import('@/pages/admin/Programs'))
const AdminTenants = React.lazy(() => import('@/pages/admin/Tenants'))
const AdminTenantOnboarding = React.lazy(() => import('@/pages/admin/tenants/TenantOnboardingWizard'))
const AdminIntakes = React.lazy(() => import('@/pages/admin/Intakes'))
const AdminUsers = React.lazy(() => import('@/pages/admin/Users'))
const AdminSettings = React.lazy(() => import('@/pages/admin/Settings'))
const AuditTrail = React.lazy(() => import('@/pages/admin/AuditTrail'))
const AdminProgramFees = React.lazy(() => import('@/pages/admin/ProgramFees'))
const PublicApplicationTracker = React.lazy(() => import('@/pages/public/tracker/index'))
const ContactPage = React.lazy(() => import('@/pages/ContactPage'))
const NotFoundPage = React.lazy(() => import('@/pages/NotFoundPage'))

export interface RouteConfig {
  path: string
  element: React.ComponentType | React.ReactElement
  guard: RouteGuard
  lazy?: boolean
  /** Which layout-matched skeleton to show while the chunk loads */
  skeletonType?: SkeletonType
  /**
   * When true, an `admin`-guarded route additionally requires Super_Admin
   * authority. The frontend guard blocks tenant-admin deep-links as a usability
   * layer; the backend re-enforces the corresponding permission
   * (enterprise-tenant-authority R13.5). `/admin/tenants` is intentionally NOT
   * flagged — it is shared and renders the correct console per capability.
   */
  requiresSuperAdmin?: boolean
}

function fromRegistry(
  id: ProductRouteId,
  element: React.ComponentType | React.ReactElement,
  options: { lazy?: boolean; path?: string } = {},
): RouteConfig {
  const route = routeById(id)
  return {
    path: options.path ?? route.path,
    element,
    guard: route.guard,
    lazy: options.lazy,
    skeletonType: route.skeletonType,
    requiresSuperAdmin: route.requiresSuperAdmin,
  }
}

export const routes: RouteConfig[] = [
  // Public routes
  fromRegistry('public.home', LandingPage),
  fromRegistry('public.trackApplication', PublicApplicationTracker, { lazy: true }),
  fromRegistry('public.contact', ContactPage, { lazy: true }),
  fromRegistry('public.terms', TermsPage, { lazy: true }),
  fromRegistry('public.privacy', PrivacyPage, { lazy: true }),
  fromRegistry('auth.signIn', SignInPage, { lazy: true }),
  ...(routeById('auth.signIn').aliases ?? []).map((path) => fromRegistry('auth.signIn', SignInPage, { lazy: true, path })),
  fromRegistry('auth.signUp', SignUpPage, { lazy: true }),
  fromRegistry('auth.forgotPassword', ForgotPasswordPage, { lazy: true }),
  fromRegistry('auth.resetPassword', ResetPasswordPage, { lazy: true }),
  fromRegistry('auth.callback', AuthCallbackPage, { lazy: true }),
  fromRegistry('payment.callback', PaymentCallback, { lazy: true }),
  
  // Dashboard redirect (no lazy loading needed)
  fromRegistry('dashboard.redirect', <DashboardRedirect />),
  
  // Student routes
  fromRegistry('student.dashboard', StudentDashboard, { lazy: true }),
  fromRegistry('student.applicationWizard', ApplicationWizard, { lazy: true }),
  fromRegistry('student.applicationWizard', ApplicationWizard, { lazy: true, path: '/apply' }),
  // Legacy aliases — keep old bookmarks and outbound links working.
  { path: '/student/applications/new', element: <Navigate to={studentApplicationNewPath()} replace />, guard: 'student' },
  { path: '/student/applications', element: <Navigate to={CANONICAL_STUDENT_DASHBOARD_PATH} replace />, guard: 'student' },
  { path: '/student/application-status', element: <Navigate to={pathFor('student.status')} replace />, guard: 'student' },
  fromRegistry('student.status', ApplicationStatus, { lazy: true }),
  fromRegistry('student.status', ApplicationStatus, { lazy: true, path: '/application/:id' }),
  fromRegistry('student.status', ApplicationStatus, { lazy: true, path: '/student/application/:id/status' }),
  fromRegistry('student.applicationDetail', ApplicationDetail, { lazy: true }),
  { path: '/settings', element: <Navigate to={pathFor('student.settings')} replace />, guard: 'student' },
  { path: '/student/profile', element: <Navigate to={pathFor('student.settings')} replace />, guard: 'student' },
  { path: '/student/profile/edit', element: <Navigate to={pathFor('student.settings')} replace />, guard: 'student' },
  fromRegistry('student.settings', StudentSettings, { lazy: true }),
  fromRegistry('student.notifications', StudentNotificationSettings, { lazy: true }),
  fromRegistry('student.payment', StudentPayment, { lazy: true }),
  { path: '/student/payments', element: <Navigate to={pathFor('student.payment')} replace />, guard: 'student' },
  fromRegistry('student.interview', StudentInterview, { lazy: true }),
  { path: '/student/interviews', element: <Navigate to={pathFor('student.interview')} replace />, guard: 'student' },
  fromRegistry('student.communications', StudentCommunications, { lazy: true }),
  fromRegistry('student.history', StudentHistory, { lazy: true }),
  
  // Admin routes
  fromRegistry('admin.home', AdminDashboard, { lazy: true }),
  fromRegistry('admin.dashboard', AdminDashboard, { lazy: true }),
  fromRegistry('admin.profile', AdminSettings, { lazy: true }),
  fromRegistry('admin.applications', AdminApplications, { lazy: true }),
  fromRegistry('admin.programs', AdminPrograms, { lazy: true }),
  fromRegistry('admin.tenants', AdminTenants, { lazy: true }),
  // Super-admin-only tenant onboarding wizard. The frontend guard blocks
  // tenant-admin deep-links as a usability layer; the backend re-enforces every
  // mutation the wizard performs (enterprise-tenant-authority R13.5, R14.1).
  fromRegistry('admin.tenantOnboarding', AdminTenantOnboarding, { lazy: true }),
  fromRegistry('admin.intakes', AdminIntakes, { lazy: true }),
  fromRegistry('admin.users', AdminUsers, { lazy: true }),
  fromRegistry('admin.audit', AuditTrail, { lazy: true }),
  fromRegistry('admin.programFees', AdminProgramFees, { lazy: true }),
  fromRegistry('admin.settings', AdminSettings, { lazy: true }),
  
  // 404 routes
  fromRegistry('notFound', NotFoundPage, { lazy: true }),
  { path: '*', element: <Navigate to={pathFor('notFound')} replace />, guard: 'public' },
]
