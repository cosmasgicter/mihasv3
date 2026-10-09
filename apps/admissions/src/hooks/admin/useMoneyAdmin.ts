/**
 * Settlement + fee-administration report hooks (Admissions V2, task 8.4).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 8.4
 * Requirements: R3, R6.5, R8.3-R8.4, R12.5-R12.7 · Findings: ADM-06, AUTH-02.
 *
 * React Query wrappers over `settlementAdminService`. The query key carries the
 * **whole** server query — institution, filters, and page — because that is what
 * identifies the answer: the server decides the rows, the totals, and the
 * reconciliation state, so two different filter sets are two different results
 * rather than one cached list to slice in the browser (the ADM-06 defect).
 */
import { useMutation, useQuery } from '@tanstack/react-query'

import {
  settlementAdminService,
  type FeeAdminAggregates,
  type FeeAdminQuery,
  type FeeAdminRow,
  type PagedReport,
  type SettlementAggregates,
  type SettlementQuery,
  type SettlementRow,
} from '@/services/admin/settlement'

export const moneyAdminKeys = {
  all: ['admin', 'money'] as const,
  settlement: (query: SettlementQuery) => [...moneyAdminKeys.all, 'settlement', query] as const,
  fees: (query: FeeAdminQuery) => [...moneyAdminKeys.all, 'fees', query] as const,
}

/**
 * The scoped settlement report. `institutionId` is sent to the server, never used
 * to filter a broader payload after the fact.
 */
export function useSettlementReport(query: SettlementQuery, options?: { enabled?: boolean }) {
  return useQuery<PagedReport<SettlementRow, SettlementAggregates>>({
    queryKey: moneyAdminKeys.settlement(query),
    queryFn: () => settlementAdminService.getSettlementReport(query),
    enabled: options?.enabled ?? true,
  })
}

/** The scoped fee-administration report (one query, not one request per offering). */
export function useFeeReport(query: FeeAdminQuery, options?: { enabled?: boolean }) {
  return useQuery<PagedReport<FeeAdminRow, FeeAdminAggregates>>({
    queryKey: moneyAdminKeys.fees(query),
    queryFn: () => settlementAdminService.getFeeReport(query),
    enabled: options?.enabled ?? true,
  })
}

/** Download the server's settlement CSV for the current filters (page-independent). */
export function useSettlementExport() {
  return useMutation({
    mutationFn: (query: SettlementQuery) =>
      settlementAdminService.downloadExport(
        settlementAdminService.settlementExportPath(query),
        'settlement-summary.csv',
      ),
  })
}

/** Download the server's fee-administration CSV for the current filters. */
export function useFeeExport() {
  return useMutation({
    mutationFn: (query: FeeAdminQuery) =>
      settlementAdminService.downloadExport(
        settlementAdminService.feeExportPath(query),
        'program-fees.csv',
      ),
  })
}
