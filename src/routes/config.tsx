import React from 'react'

// Import critical pages directly for faster loading
import SignInPage from '@/pages/auth/SignInPage'
import SignUpPage from '@/pages/auth/SignUpPage'
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage'
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage'
import LandingPage from '@/pages/LandingPage'

// Lazy load non-critical pages
const StudentDashboard = React.lazy(() => import('@/pages/student/Dashboard'))
const AuthCallbackPage = React.lazy(() => import('@/pages/auth/AuthCallbackPage'))
const ApplicationWizard = React.lazy(() => import('@/pages/student/applicationWizard/index.tsx'))
const ApplicationStatus = React.lazy(() => import('@/pages/student/ApplicationStatus'))
const ApplicationDetail = React.lazy(() => import('@/pages/student/ApplicationDetail'))
const StudentSettings = React.lazy(() => import('@/pages/student/Settings'))
const StudentNotificationSettings = React.lazy(() => import('@/pages/student/NotificationSettings'))
const AdminDashboard = React.lazy(() => import('@/pages/admin/Dashboard'))
const AdminApplications = React.lazy(() => import('@/pages/admin/Applications'))
const ApplicationsAdmin = React.lazy(() => import('@/pages/admin/ApplicationsAdmin'))
const AdminPrograms = React.lazy(() => import('@/pages/admin/Programs'))
const AdminIntakes = React.lazy(() => import('@/pages/admin/Intakes'))
const AdminUsers = React.lazy(() => import('@/pages/admin/Users'))
const AdminSettings = React.lazy(() => import('@/pages/admin/Settings'))
const AdminAnalytics = React.lazy(() => import('@/pages/admin/Analytics'))
const AIInsights = React.lazy(() => import('@/pages/admin/AIInsights'))
const WorkflowAutomation = React.lazy(() => import('@/pages/admin/WorkflowAutomation'))
const AuditTrail = React.lazy(() => import('@/pages/admin/AuditTrail'))
const RoleManagement = React.lazy(() => import('@/pages/admin/RoleManagement'))
const ApplicationFlowAnalysis = React.lazy(() => import('@/pages/admin/ApplicationFlowAnalysis'))
const PublicApplicationTracker = React.lazy(() => import('@/pages/public/tracker/index.tsx'))
const AdminTest = React.lazy(() => import('@/pages/AdminTest'))
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
  // Public routes
  { path: '/', element: LandingPage, guard: 'public' },
  { path: '/track-application', element: PublicApplicationTracker, guard: 'public', lazy: true },
  { path: '/auth/signin', element: SignInPage, guard: 'public' },
  { path: '/signin', element: SignInPage, guard: 'public' },
  { path: '/login', element: SignInPage, guard: 'public' },
  { path: '/auth/signup', element: SignUpPage, guard: 'public' },
  { path: '/auth/forgot-password', element: ForgotPasswordPage, guard: 'public' },
  { path: '/auth/reset-password', element: ResetPasswordPage, guard: 'public' },
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
  
  // Admin routes
  { path: '/admin', element: AdminDashboard, guard: 'admin', lazy: true },
  { path: '/admin/dashboard', element: AdminDashboard, guard: 'admin', lazy: true },
  { path: '/admin/profile', element: AdminSettings, guard: 'admin', lazy: true },
  { path: '/admin-test', element: AdminTest, guard: 'auth', lazy: true },
  { path: '/admin/applications', element: AdminApplications, guard: 'admin', lazy: true },
  { path: '/admin/applications-new', element: ApplicationsAdmin, guard: 'admin', lazy: true },
  { path: '/admin/programs', element: AdminPrograms, guard: 'admin', lazy: true },
  { path: '/admin/intakes', element: AdminIntakes, guard: 'admin', lazy: true },
  { path: '/admin/users', element: AdminUsers, guard: 'admin', lazy: true },
  { path: '/admin/audit', element: AuditTrail, guard: 'admin', lazy: true },
  { path: '/admin/settings', element: AdminSettings, guard: 'admin', lazy: true },
  { path: '/admin/analytics', element: AdminAnalytics, guard: 'admin', lazy: true },
  { path: '/admin/ai-insights', element: AIInsights, guard: 'admin', lazy: true },
  { path: '/admin/workflow', element: WorkflowAutomation, guard: 'admin', lazy: true },
  { path: '/admin/flow-analysis', element: ApplicationFlowAnalysis, guard: 'admin', lazy: true },
  { path: '/admin/roles', element: RoleManagement, guard: 'admin', lazy: true },
  
  // 404 routes
  { path: '/404', element: NotFoundPage, guard: 'public', lazy: true },
  { path: '*', element: <Navigate to="/404" replace />, guard: 'public' },
]