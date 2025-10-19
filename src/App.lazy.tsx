import { lazy } from 'react'

// Admin Pages
export const AdminDashboard = lazy(() => import('@/pages/admin/Dashboard'))
export const AdminApplications = lazy(() => import('@/pages/admin/Applications'))
export const AdminUsers = lazy(() => import('@/pages/admin/Users'))
export const AdminAnalytics = lazy(() => import('@/pages/admin/Analytics'))

// Student Pages
export const StudentDashboard = lazy(() => import('@/pages/student/Dashboard'))
export const ApplicationWizard = lazy(() => import('@/pages/student/applicationWizard'))

// Heavy Components
export const EnhancedDashboard = lazy(() => import('@/components/admin/EnhancedDashboard'))
export const PredictiveDashboard = lazy(() => import('@/components/admin/PredictiveDashboard'))
