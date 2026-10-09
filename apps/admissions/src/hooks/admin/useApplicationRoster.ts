/**
 * The scoped applications roster hooks (Admissions V2, task 9.1).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 9.1
 * Requirements: R8.1, R8.6 · Findings: ADM-01.
 *
 * React Query wrappers over `applicationRosterService`. The query key carries
 * the **whole** server query — every filter, the sort, and the page — because
 * that is what identifies the answer. Two filter sets are two different results,
 * not one cached list to slice in the browser, which is precisely the habit
 * ADM-01 records.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  applicationRosterService,
  type ApplicationRosterQuery,
  type ApplicationRosterReport,
  type SavedApplicationFilter,
} from '@/services/admin/applications'

export const applicationRosterKeys = {
  all: ['admin', 'applications', 'roster'] as const,
  roster: (query: ApplicationRosterQuery) => [...applicationRosterKeys.all, query] as const,
  savedFilters: ['admin', 'applications', 'saved-filters'] as const,
}

/** The scoped roster: rows, facets, whole-set aggregates, and page arithmetic. */
export function useApplicationRoster(
  query: ApplicationRosterQuery,
  options?: { enabled?: boolean },
) {
  return useQuery<ApplicationRosterReport>({
    queryKey: applicationRosterKeys.roster(query),
    queryFn: () => applicationRosterService.getRoster(query),
    enabled: options?.enabled ?? true,
    // The roster is a report an operator reads and acts on; keeping the previous
    // page's answer on screen while the next one loads is what makes paging feel
    // like paging rather than a full reload.
    placeholderData: (previous) => previous,
  })
}

/** The caller's own saved queries. */
export function useSavedApplicationFilters(options?: { enabled?: boolean }) {
  return useQuery<SavedApplicationFilter[]>({
    queryKey: applicationRosterKeys.savedFilters,
    queryFn: () => applicationRosterService.listSavedFilters(),
    enabled: options?.enabled ?? true,
  })
}

/** Save (or update by name) the current view as a named server-side query. */
export function useSaveApplicationFilter() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; query: ApplicationRosterQuery; institution_id?: string }) =>
      applicationRosterService.saveFilter(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: applicationRosterKeys.savedFilters })
    },
  })
}

/** Delete one of the caller's own saved queries. */
export function useDeleteApplicationFilter() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (savedFilterId: string) => applicationRosterService.deleteFilter(savedFilterId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: applicationRosterKeys.savedFilters })
    },
  })
}

/** Download the server's roster CSV for the current filters (page-independent). */
export function useApplicationRosterExport() {
  return useMutation({
    mutationFn: (query: ApplicationRosterQuery) =>
      applicationRosterService.downloadExport(
        applicationRosterService.rosterExportPath(query),
        'applications.csv',
      ),
  })
}
