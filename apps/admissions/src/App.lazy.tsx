import { lazy } from 'react'

// Admin Pages
export const AdminDashboard = lazy(() => import('@/pages/admin/Dashboard'))
export const AdminApplications = lazy(() => import('@/pages/admin/Applications'))
export const AdminUsers = lazy(() => import('@/pages/admin/Users'))

// Student Pages
export const StudentDashboard = lazy(() => import('@/pages/student/Dashboard'))
export const ApplicationWizard = lazy(() => import('@/pages/student/ApplicationWizard'))

