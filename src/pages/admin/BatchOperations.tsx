import React from 'react'
import { BulkOperationsPanel } from '@/components/admin/BulkOperationsPanel'
import { PageShell } from '@/components/ui/PageShell'

export default function BatchOperationsPage() {
  return (
    <PageShell
      title="Batch Operations"
      subtitle="Perform bulk operations on users and applications"
      maxWidth="7xl"
    >
      <BulkOperationsPanel />
    </PageShell>
  )
}
