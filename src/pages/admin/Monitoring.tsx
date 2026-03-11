import React from 'react'
import { MaintenancePanel } from '@/components/admin/MaintenancePanel'
import { PageShell } from '@/components/ui/PageShell'

export default function MonitoringPage() {
  return (
    <PageShell
      title="System Monitoring"
      subtitle="Maintenance and system health"
      maxWidth="7xl"
    >
      <div className="space-y-8">
        <MaintenancePanel />
      </div>
    </PageShell>
  )
}
