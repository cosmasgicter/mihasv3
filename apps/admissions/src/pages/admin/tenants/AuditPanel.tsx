/**
 * The selected tenant's audit feed (Admissions V2, task 9.5).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 9.5 — "Correct tenant
 * audit and amendment notification scope".
 * Requirements: **R3** (backend authority; an out-of-scope institution is a masked
 * 404 the panel renders as a no-access state), **R6.6** (the tenant audit list and
 * export use the selected institution endpoint, require `tenant.audit.read`,
 * paginate, and never leak another tenant's events).
 * Findings: **ADM-05**.
 *
 * What this panel used to do, and no longer does: it took `institutionId`, put it
 * in its React Query key, and then called the **generic** `/admin/audit-logs/`
 * feed with `{ targetTable: 'institutions', pageSize: 15 }` — so a card titled
 * "Configuration audit" for the selected school rendered a platform-wide list,
 * switching schools re-fetched the same list, there was no paging past the first
 * fifteen rows, the category label was produced by a regex in the browser, and
 * there was no export.
 *
 * Now: the institution is in the **path**, the filters and the page are the
 * server's, the category and the facet counts come from the backend's own action
 * vocabulary (with a definition each), and the export is a backend command that
 * covers the whole filtered set and is audited server-side.
 */
import { useMemo, useState } from 'react'
import { Download, History } from 'lucide-react'

import { SectionCard, StatusBadge } from '@/components/ui'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { useCapabilities } from '@/contexts/CapabilityContext'
import { useTenantAudit, useTenantAuditExport } from '@/hooks/admin/useTenantAudit'
import { toError } from '@/lib/toError'
import {
  TENANT_AUDIT_CATEGORIES,
  type TenantAuditCategory,
  type TenantAuditEvent,
} from '@/services/admin/tenantAudit'
import { PanelStateError } from './panelStates'

const PAGE_SIZE = 15

/** The export authority (R6.5) — the platform's one tenant export grant. */
const EXPORT_CAPABILITY = 'tenant.application.export'

/**
 * Presentation for the server's category vocabulary.
 *
 * The category itself is decided by the backend from its own action vocabulary;
 * this only chooses a label and a tone for it, and every tone is paired with the
 * label so status is never colour alone.
 */
const CATEGORY_PRESENTATION: Record<
  TenantAuditCategory,
  { label: string; tone: 'info' | 'warning' | 'destructive' | 'success' | 'neutral' }
> = {
  configuration: { label: 'Configuration', tone: 'info' },
  authorization: { label: 'Authorization', tone: 'destructive' },
  review: { label: 'Review', tone: 'success' },
  document: { label: 'Documents', tone: 'neutral' },
  payment: { label: 'Payments', tone: 'warning' },
  export: { label: 'Export', tone: 'warning' },
  communication: { label: 'Communication', tone: 'neutral' },
  other: { label: 'Other', tone: 'neutral' },
}

function categoryLabel(category: string): string {
  return CATEGORY_PRESENTATION[category as TenantAuditCategory]?.label ?? category
}

function categoryTone(category: string) {
  return CATEGORY_PRESENTATION[category as TenantAuditCategory]?.tone ?? 'neutral'
}

function formatTimestamp(value: string | null): string {
  if (!value) return 'Unknown time'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? 'Unknown time' : parsed.toLocaleString()
}

function AuditEventRow({ event, definition }: { event: TenantAuditEvent; definition?: string }) {
  return (
    <li className="rounded-lg border border-border bg-background p-3" data-audit-event={event.id}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-sm font-medium text-foreground">{event.action}</p>
          <p className="mt-0.5 break-words text-xs text-muted-foreground">
            {event.entity_type}
            {event.entity_id ? ` · ${event.entity_id}` : ''}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{formatTimestamp(event.created_at)}</p>
        </div>
        <StatusBadge
          tone={categoryTone(event.category)}
          size="sm"
          label={categoryLabel(event.category)}
        />
      </div>
      {definition ? <p className="mt-2 text-xs text-muted-foreground">{definition}</p> : null}
    </li>
  )
}

export function AuditPanel({ institutionId }: { institutionId: string }) {
  const { isSuperAdmin, canForInstitution } = useCapabilities()
  const [page, setPage] = useState(1)
  const [category, setCategory] = useState('')

  // The institution is part of the endpoint and the category is a server filter.
  // Nothing here narrows a broader payload after the fact (ADM-05).
  const query = useMemo(
    () => ({
      institutionId,
      category: category || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [institutionId, category, page],
  )

  const auditQuery = useTenantAudit(query)
  const exportMutation = useTenantAuditExport()

  const report = auditQuery.data
  const events = report?.results ?? []
  // The page count is the server's answer, not a division done here.
  const totalPages = report?.totalPages ?? 1
  const mayExport =
    (report?.can_export ?? false) &&
    (isSuperAdmin || canForInstitution(institutionId, EXPORT_CAPABILITY))

  return (
    <SectionCard
      title="Configuration audit"
      description="Recorded activity for this school — configuration changes, authorization refusals, review decisions and exports. Filters, counts and the export are the server's."
      icon={<History className="h-5 w-5" />}
      actions={
        mayExport ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
            loading={exportMutation.isPending}
            onClick={() => exportMutation.mutate(query)}
          >
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            Export CSV
          </Button>
        ) : undefined
      }
    >
      {auditQuery.isError ? (
        // R12.7: a backend 403 shows a precise authorization message and no audit
        // data; an out-of-scope institution is a masked 404 and shows nothing
        // about the school it named.
        <PanelStateError
          error={auditQuery.error}
          onRetry={() => auditQuery.refetch()}
          fallback="Could not load the audit trail."
        />
      ) : auditQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading audit events…</p>
      ) : (
        <div className="space-y-4" data-tenant-audit={institutionId}>
          {exportMutation.isError && <ErrorDisplay message={toError(exportMutation.error).message} />}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground sm:flex-row sm:items-center sm:gap-2">
              Category
              <select
                aria-label="Filter audit events by category"
                className="min-h-touch rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value)
                  setPage(1)
                }}
              >
                <option value="">All activity</option>
                {(report?.categories ?? [...TENANT_AUDIT_CATEGORIES]).map((value) => (
                  <option key={value} value={value}>
                    {categoryLabel(value)}
                  </option>
                ))}
              </select>
            </label>
            {report ? (
              <div className="flex flex-wrap items-center gap-2" aria-label="Audit totals">
                <StatusBadge
                  tone="neutral"
                  size="sm"
                  label={`${report.facets.event_count} event${report.facets.event_count === 1 ? '' : 's'}`}
                />
                <StatusBadge
                  tone="neutral"
                  size="sm"
                  label={`${report.facets.actor_count} actor${report.facets.actor_count === 1 ? '' : 's'}`}
                />
              </div>
            ) : null}
          </div>

          {report && report.facets.by_category.length > 0 ? (
            <div className="flex flex-wrap gap-2" aria-label="Audit events by category">
              {report.facets.by_category.map((entry) => (
                <StatusBadge
                  key={entry.category}
                  tone={categoryTone(entry.category)}
                  size="sm"
                  label={`${categoryLabel(entry.category)} · ${entry.event_count}`}
                />
              ))}
            </div>
          ) : null}

          {events.length === 0 ? (
            <EmptyState
              icon={<History />}
              heading="No recorded activity yet"
              description="Configuration changes, review decisions and exports for this school will appear here as they happen."
            />
          ) : (
            <ul className="space-y-2">
              {events.map((event) => (
                <AuditEventRow
                  key={event.id}
                  event={event}
                  definition={report?.definitions?.[event.category]}
                />
              ))}
            </ul>
          )}

          {totalPages > 1 ? (
            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-muted-foreground">
                Page {report?.page ?? page} of {totalPages} · {report?.totalCount ?? 0} events
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={(report?.page ?? page) <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={(report?.page ?? page) >= totalPages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </SectionCard>
  )
}
