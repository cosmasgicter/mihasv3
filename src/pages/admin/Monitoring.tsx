import React from 'react'
import { MaintenancePanel } from '@/components/admin/MaintenancePanel'

export default function MonitoringPage() {
  return (
    <div className="min-h-screen bg-muted">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          <MaintenancePanel />
        </div>
      </div>
    </div>
  )
}
