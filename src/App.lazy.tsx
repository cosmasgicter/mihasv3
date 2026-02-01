import { lazy } from 'react'

// Admin Pages
export const AdminDashboard = lazy(() => import('@/pages/admin/Dashboard'))
export const AdminApplications = lazy(() => import('@/pages/admin/Applications'))
export const AdminUsers = lazy(() => import('@/pages/admin/Users'))
export const AdminAnalytics = lazy(() => import('@/pages/admin/Analytics'))

// Student Pages
export const StudentDashboard = lazy(() => import('@/pages/student/Dashboard'))
export const ApplicationWizard = lazy(() => import('@/pages/student/ApplicationWizard'))

// Heavy Components - use named export
export const EnhancedDashboard = lazy(() => 
  import('@/components/admin/EnhancedDashboard').then(m => ({ default: m.EnhancedDashboard }))
)
