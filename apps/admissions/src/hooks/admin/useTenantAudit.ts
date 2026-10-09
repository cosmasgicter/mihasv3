/**
 * Tenant audit feed hooks (Admissions V2, task 9.5).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 9.5
 * Requirements: R3, R6.6 · Findings: **ADM-05**.
 *
 * The query key carries the **whole** server query — institution, filters and
 * page — because that is what identifies the answer. The panel this replaces put
 * `institutionId` in its cache key and then did not send it, so switching schools
 * re-fetched the same platform-wide list under a new key: a cache that
 * distinguished answers the request never distinguished.
 */
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'

import {
  tenantAuditService,
  type TenantAuditQuery,
  type TenantAuditReport,
} from '@/services/admin/tenantAudit'

export const tenantAuditKeys = {
  all: ['admin', 'tenants', 'audit'] as const,
  list: (query: TenantAuditQuery) => [...tenantAuditKeys.all, query] as const,
}

/**
 * This school's audit events, filtered and paged by the server.
 *
 * `keepPreviousData` so turning a page does not blank the totals and the filter
 * controls while the next page arrives. The counts are the server's answer for the
 * whole filtered set, so they are the same answer on page 2 as on page 1 —
 * replacing them with a loading state would suggest they are per-page.
 */
export function useTenantAudit(query: TenantAuditQuery, options?: { enabled?: boolean }) {
  return useQuery<TenantAuditReport>({
    queryKey: tenantAuditKeys.list(query),
    queryFn: () => tenantAuditService.list(query),
    enabled: (options?.enabled ?? true) && Boolean(query.institutionId),
    placeholderData: keepPreviousData,
  })
}

/**
 * Download the server's audit CSV for the current filters.
 *
 * Page-independent: `exportPath` drops the paging parameters, so this cannot
 * become "export the page I happen to be looking at" (R6.5).
 */
export function useTenantAuditExport() {
  return useMutation({
    mutationFn: (query: TenantAuditQuery) =>
      tenantAuditService.download(
        tenantAuditService.exportPath(query),
        `tenant-audit-${query.institutionId}.csv`,
      ),
  })
}
