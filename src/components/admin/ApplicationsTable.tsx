import React from 'react'

import { Button } from '@/components/ui/Button'
import { useApplications } from '@/hooks/useApiServices'
import { Application } from '@/lib/supabase'

export function ApplicationsTable() {
  const { data: applications = [], isLoading, error } = useApplications()

  if (isLoading) return <div>Loading applications...</div>
  if (error) return <div>Error loading applications</div>

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full bg-card border border-border">
        <thead className="bg-muted">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-foreground uppercase">
              Application #
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-foreground uppercase">
              Student Name
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-foreground uppercase">
              Program
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-foreground uppercase">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-foreground uppercase">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {applications.map((app: Application) => (
            <tr key={app.id}>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground">
                {app.application_number}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                {app.full_name}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                {app.program}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`px-2 py-1 text-xs rounded-full ${
                  app.status === 'approved' ? 'bg-accent/10 text-accent-foreground' :
                  app.status === 'rejected' ? 'bg-destructive/10 text-destructive-foreground' :
                  'bg-accent/10 text-accent-foreground'
                }`}>
                  {app.status}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <Button variant="outline" size="sm">
                  View
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}