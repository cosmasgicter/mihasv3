/**
 * Cache Monitor Page
 * 
 * Admin page for monitoring React Query cache performance
 * 
 * Validates: Requirements 3.5
 */

import React from 'react'
import { CacheMonitorDashboard } from '@/components/admin/CacheMonitorDashboard'
import { useAuth } from '@/contexts/AuthContext'
import { Navigate } from 'react-router-dom'

export default function CacheMonitorPage() {
  const { user } = useAuth()

  // Only allow admin users
  if (!user) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="container mx-auto py-6 px-4">
      <CacheMonitorDashboard />
    </div>
  )
}
