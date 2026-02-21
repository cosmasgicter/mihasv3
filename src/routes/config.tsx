// @ts-nocheck
import React from 'react'

// Lazy load ALL pages for optimal code splitting
// This ensures the landing page bundle stays under 100KB (Requirement 1.4)

// Auth pages - loaded on demand
const SignInPage = React.lazy(() => import('@/pages/auth/SignInPage'))
const SignUpPage = React.lazy(() => import('@/pages/auth/SignUpPage'))
const ForgotPasswordPage = React.lazy(() => import('@/pages/auth/ForgotPasswordPage'))
const ResetPasswordPage = React.lazy(() => import('@/pages/auth/ResetPasswordPage'))

// Landing page - lazy loaded with preload hint
const LandingPage = React.lazy(() => import('@/pages/LandingPage'))

// Lazy load non-critical pages
const StudentDashboard = React.lazy(() => import('@/pages/student/Dashboard'))
const AuthCallbackPage = React.lazy(() => import('@/pages/auth/AuthCallbackPage'))
const ApplicationWizard = React.lazy(() => import('@/pages/student/applicationWizard/index.tsx'))
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
const PublicApplicationTracker = React.lazy(() => import('@/pages/public/tracker/index.tsx'))
const ContactPage = React.lazy(() => import('@/pages/ContactPage'))
const NotFoundPage = React.lazy(() => import('@/pages/NotFoundPage'))

// Special components that don't need lazy loading
import { DashboardRedirect } from '@/components/DashboardRedirect'
import { Navigate } from 'react-router-dom'

export type RouteGuard = 'public' | 'auth' | 'student' | 'admin'

export interface RouteConfig {
  path: string
  element: React.ComponentType | React.ReactElement
  guard: RouteGuard
  lazy?: boolean
}

export const routes: RouteConfig[] = [
  // Public routes - all lazy loaded for optimal bundle size
  { path: '/', element: LandingPage, guard: 'public', lazy: true },
  { path: '/track-application', element: PublicApplicationTracker, guard: 'public', lazy: true },
  { path: '/contact', element: ContactPage, guard: 'public', lazy: true },
  { path: '/auth/signin', element: SignInPage, guard: 'public', lazy: true },
  { path: '/signin', element: SignInPage, guard: 'public', lazy: true },
  { path: '/login', element: SignInPage, guard: 'public', lazy: true },
  { path: '/auth/signup', element: SignUpPage, guard: 'public', lazy: true },
  { path: '/auth/forgot-password', element: ForgotPasswordPage, guard: 'public', lazy: true },
  { path: '/auth/reset-password', element: ResetPasswordPage, guard: 'public', lazy: true },
  { path: '/auth/callback', element: AuthCallbackPage, guard: 'public', lazy: true },
  
  // Dashboard redirect (no lazy loading needed)
  { path: '/dashboard', element: <DashboardRedirect />, guard: 'public' },
  
  // Student routes
  { path: '/student/dashboard', element: StudentDashboard, guard: 'student', lazy: true },
  { path: '/apply', element: ApplicationWizard, guard: 'student', lazy: true },
  { path: '/student/application-wizard', element: ApplicationWizard, guard: 'student', lazy: true },
  { path: '/student/status', element: ApplicationStatus, guard: 'student', lazy: true },
  { path: '/application/:id', element: ApplicationStatus, guard: 'student', lazy: true },
  { path: '/student/application/:id', element: ApplicationDetail, guard: 'student', lazy: true },
  { path: '/settings', element: StudentSettings, guard: 'student', lazy: true },
  { path: '/student/profile', element: StudentSettings, guard: 'student', lazy: true },
  { path: '/student/settings', element: StudentSettings, guard: 'student', lazy: true },
  { path: '/student/notifications', element: StudentNotificationSettings, guard: 'student', lazy: true },
  { path: '/student/payment', element: StudentPayment, guard: 'student', lazy: true },
  { path: '/student/interview', element: StudentInterview, guard: 'student', lazy: true },
  
  // Admin routes
  { path: '/admin', element: AdminDashboard, guard: 'admin', lazy: true },
  { path: '/admin/dashboard', element: AdminDashboard, guard: 'admin', lazy: true },
  { path: '/admin/profile', element: AdminSettings, guard: 'admin', lazy: true },
  { path: '/admin/applications', element: AdminApplications, guard: 'admin', lazy: true },
  { path: '/admin/programs', element: AdminPrograms, guard: 'admin', lazy: true },
  { path: '/admin/intakes', element: AdminIntakes, guard: 'admin', lazy: true },
  { path: '/admin/users', element: AdminUsers, guard: 'admin', lazy: true },
  { path: '/admin/audit', element: AuditTrail, guard: 'admin', lazy: true },
  { path: '/admin/settings', element: AdminSettings, guard: 'admin', lazy: true },
  
  // 404 routes
  { path: '/404', element: NotFoundPage, guard: 'public', lazy: true },
  { path: '*', element: <Navigate to="/404" replace />, guard: 'public' },
]