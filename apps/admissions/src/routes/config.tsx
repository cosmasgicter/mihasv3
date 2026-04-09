import React from 'react'
import LandingPage from '@/pages/LandingPage'

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
const ApplicationWizard = React.lazy(() => import('@/pages/student/applicationWizard/index'))
const ApplicationStatus = React.lazy(() => import('@/pages/student/ApplicationStatus'))
const ApplicationDetail = React.lazy(() => import('@/pages/student/ApplicationDetail'))
const StudentSettings = React.lazy(() => import('@/pages/student/Settings'))
const StudentNotificationSettings = React.lazy(() => import('@/pages/student/NotificationSettings'))
const StudentPayment = React.lazy(() => import('@/pages/student/Payment'))
const StudentInterview = React.lazy(() => import('@/pages/student/Interview'))
const AdminDashboard = React.lazy(() => import('@/pages/admin/Dashboard'))
const AdminApplications = React.lazy(() => import('@/pages/admin/Applications'))
const AdminPrograms = React.lazy(() => import('@/pages/admin/Programs'))
const AdminIntakes = React.lazy(() => import('@/pages/admin/Intakes'))
const AdminUsers = React.lazy(() => import('@/pages/admin/Users'))
const AdminSettings = React.lazy(() => import('@/pages/admin/Settings'))
const AuditTrail = React.lazy(() => import('@/pages/admin/AuditTrail'))
const AdminProgramFees = React.lazy(() => import('@/pages/admin/ProgramFees'))
const PublicApplicationTracker = React.lazy(() => import('@/pages/public/tracker/index'))
const ContactPage = React.lazy(() => import('@/pages/ContactPage'))
const NotFoundPage = React.lazy(() => import('@/pages/NotFoundPage'))

// Special components that don't need lazy loading
import { DashboardRedirect } from '@/components/DashboardRedirect'
import { Navigate } from 'react-router-dom'

export type RouteGuard = 'public' | 'auth' | 'student' | 'admin'

/** Skeleton type used as Suspense fallback for lazy-loaded routes */
export type SkeletonType = 'dashboard' | 'wizard' | 'admin-table' | 'auth' | 'detail' | 'none'

export interface RouteConfig {
  path: string
  element: React.ComponentType | React.ReactElement
  guard: RouteGuard
  lazy?: boolean
  /** Which layout-matched skeleton to show while the chunk loads */
  skeletonType?: SkeletonType
}

export const routes: RouteConfig[] = [
  // Public routes
  { path: '/', element: LandingPage, guard: 'public' },
  { path: '/track-application', element: PublicApplicationTracker, guard: 'public', lazy: true, skeletonType: 'detail' },
  { path: '/contact', element: ContactPage, guard: 'public', lazy: true, skeletonType: 'none' },
  { path: '/terms', element: TermsPage, guard: 'public', lazy: true, skeletonType: 'none' },
  { path: '/privacy', element: PrivacyPage, guard: 'public', lazy: true, skeletonType: 'none' },
  { path: '/auth/signin', element: SignInPage, guard: 'public', lazy: true, skeletonType: 'auth' },
  { path: '/signin', element: SignInPage, guard: 'public', lazy: true, skeletonType: 'auth' },
  { path: '/login', element: SignInPage, guard: 'public', lazy: true, skeletonType: 'auth' },
  { path: '/auth/signup', element: SignUpPage, guard: 'public', lazy: true, skeletonType: 'auth' },
  { path: '/auth/forgot-password', element: ForgotPasswordPage, guard: 'public', lazy: true, skeletonType: 'auth' },
  { path: '/auth/reset-password', element: ResetPasswordPage, guard: 'public', lazy: true, skeletonType: 'auth' },
  { path: '/auth/callback', element: AuthCallbackPage, guard: 'public', lazy: true, skeletonType: 'auth' },
  
  // Dashboard redirect (no lazy loading needed)
  { path: '/dashboard', element: <DashboardRedirect />, guard: 'public' },
  
  // Student routes
  { path: '/student/dashboard', element: StudentDashboard, guard: 'student', lazy: true, skeletonType: 'dashboard' },
  { path: '/apply', element: ApplicationWizard, guard: 'student', lazy: true, skeletonType: 'wizard' },
  { path: '/student/application-wizard', element: ApplicationWizard, guard: 'student', lazy: true, skeletonType: 'wizard' },
  { path: '/student/status', element: ApplicationStatus, guard: 'student', lazy: true, skeletonType: 'detail' },
  { path: '/application/:id', element: ApplicationStatus, guard: 'student', lazy: true, skeletonType: 'detail' },
  { path: '/student/application/:id', element: ApplicationDetail, guard: 'student', lazy: true, skeletonType: 'detail' },
  { path: '/settings', element: <Navigate to="/student/settings" replace />, guard: 'student' },
  { path: '/student/profile', element: <Navigate to="/student/settings" replace />, guard: 'student' },
  { path: '/student/profile/edit', element: <Navigate to="/student/settings" replace />, guard: 'student' },
  { path: '/student/settings', element: StudentSettings, guard: 'student', lazy: true, skeletonType: 'detail' },
  { path: '/student/notifications', element: StudentNotificationSettings, guard: 'student', lazy: true, skeletonType: 'detail' },
  { path: '/student/payment', element: StudentPayment, guard: 'student', lazy: true, skeletonType: 'detail' },
  { path: '/student/payments', element: <Navigate to="/student/payment" replace />, guard: 'student' },
  { path: '/student/interview', element: StudentInterview, guard: 'student', lazy: true, skeletonType: 'detail' },
  { path: '/student/interviews', element: <Navigate to="/student/interview" replace />, guard: 'student' },
  
  // Admin routes
  { path: '/admin', element: AdminDashboard, guard: 'admin', lazy: true, skeletonType: 'dashboard' },
  { path: '/admin/dashboard', element: AdminDashboard, guard: 'admin', lazy: true, skeletonType: 'dashboard' },
  { path: '/admin/profile', element: AdminSettings, guard: 'admin', lazy: true, skeletonType: 'detail' },
  { path: '/admin/applications', element: AdminApplications, guard: 'admin', lazy: true, skeletonType: 'admin-table' },
  { path: '/admin/programs', element: AdminPrograms, guard: 'admin', lazy: true, skeletonType: 'admin-table' },
  { path: '/admin/intakes', element: AdminIntakes, guard: 'admin', lazy: true, skeletonType: 'admin-table' },
  { path: '/admin/users', element: AdminUsers, guard: 'admin', lazy: true, skeletonType: 'admin-table' },
  { path: '/admin/audit', element: AuditTrail, guard: 'admin', lazy: true, skeletonType: 'admin-table' },
  { path: '/admin/program-fees', element: AdminProgramFees, guard: 'admin', lazy: true, skeletonType: 'admin-table' },
  { path: '/admin/settings', element: AdminSettings, guard: 'admin', lazy: true, skeletonType: 'detail' },
  
  // 404 routes
  { path: '/404', element: NotFoundPage, guard: 'public', lazy: true, skeletonType: 'none' },
  { path: '*', element: <Navigate to="/404" replace />, guard: 'public' },
]
