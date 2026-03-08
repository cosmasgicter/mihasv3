import React from 'react'
import { AlertTriangle } from 'lucide-react'

export function ReportTemplates() {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 text-warning" aria-hidden="true" />
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-foreground">Report templates unavailable</h3>
          <p className="text-sm text-muted-foreground">
            This module is temporarily disabled because the legacy reports API endpoints were removed.
          </p>
        </div>
      </div>
    </div>
  )
}
