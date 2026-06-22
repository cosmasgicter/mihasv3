import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'

import { SectionCard, StatusBadge } from '@/components/ui'
import { EmptyState } from '@/components/ui/EmptyState'
import { adminAuditService } from '@/services/admin/audit'

import { PanelStateError } from './panelStates'

const CATEGORY_TONE: Record<string, 'info' | 'warning' | 'destructive' | 'success' | 'neutral'> = {
  Authentication: 'info',
  Data: 'neutral',
  Security: 'destructive',
  System: 'warning',
  General: 'neutral',
}

/**
 * Recent tenant-configuration audit trail (R11.1 IA: audit).
 *
 * Reads the scoped admin audit log filtered to institution-config actions so
 * operators can review who changed tenant configuration. Non-PII only — the
 * backend audit payload already masks identifiers.
 */
export function AuditPanel({ institutionId }: { institutionId: string }) {
  const auditQuery = useQuery({
    queryKey: ['admin', 'tenants', 'audit', institutionId],
    queryFn: () => adminAuditService.list({ targetTable: 'institutions', pageSize: 15 }),
  })

  return (
    <SectionCard
      title="Configuration audit"
      description="Recent tenant configuration changes for operational review."
      icon={<History className="h-5 w-5" />}
    >
      {auditQuery.isError ? (
        // R12.7: a backend 403 shows a precise authorization message and no audit data.
        <PanelStateError
          error={auditQuery.error}
          onRetry={() => auditQuery.refetch()}
          fallback="Could not load the audit trail."
        />
      ) : auditQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading audit events…</p>
      ) : !auditQuery.data || auditQuery.data.entries.length === 0 ? (
        <EmptyState
          icon={<History />}
          heading="No recent configuration changes"
          description="Tenant configuration changes will appear here as they happen."
        />
      ) : (
        <ul className="space-y-2">
          {auditQuery.data.entries.map(entry => (
            <li key={entry.id} className="rounded-lg border border-border bg-background p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium text-foreground">{entry.action}</p>
                  <p className="mt-0.5 break-words text-xs text-muted-foreground">
                    {entry.entityType}
                    {entry.entityId ? ` · ${entry.entityId}` : ''}
                  </p>
                </div>
                <StatusBadge tone={CATEGORY_TONE[entry.category] ?? 'neutral'} label={entry.category} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}
