import React from 'react'
import { BulkOperationsPanel } from '@/components/admin/BulkOperationsPanel'

export default function BatchOperationsPage() {
  return (
    <div className="min-h-screen bg-muted">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Batch Operations</h1>
          <p className="text-muted-foreground mt-2">
            Perform bulk operations on users and applications
          </p>
        </div>
        <BulkOperationsPanel />
      </div>
    </div>
  )
}
