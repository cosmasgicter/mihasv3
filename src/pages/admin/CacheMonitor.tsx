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
import { PageShell } from '@/components/ui/PageShell'

export default function CacheMonitorPage() {
  const { user } = useAuth()

  // Only allow admin users
  if (!user) {
    return <Navigate to="/login" replace />
  }

  return (
    <PageShell
      title="Cache Monitor"
      subtitle="React Query cache performance"
      maxWidth="7xl"
    >
      <CacheMonitorDashboard />
    </PageShell>
  )
}
