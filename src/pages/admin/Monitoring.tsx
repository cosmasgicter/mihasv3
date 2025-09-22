import React from 'react'
import { MonitoringDashboard } from '@/components/admin/MonitoringDashboard'
import { MaintenancePanel } from '@/components/admin/MaintenancePanel'
import { AuthenticatedNavigation } from '@/components/ui/AuthenticatedNavigation'

export default function MonitoringPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <AuthenticatedNavigation />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          <MonitoringDashboard />
          <MaintenancePanel />
        </div>
      </div>
    </div>
  )
}