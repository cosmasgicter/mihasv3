/**
 * The scoped user-directory hooks (Admissions V2, task 9.3).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 9.3
 * Requirements: R6.1, R6.2, R6.4, R6.5 · Findings: ADM-03, ADM-04, AUTH-04.
 *
 * React Query wrappers over `userDirectoryService`. The query key carries the
 * **whole** server query — every filter, the sort, and the page — because that
 * is what identifies the answer. Two filter sets are two different results, not
 * one cached list to slice in the browser, which is precisely the habit ADM-03
 * records.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  userDirectoryService,
  type UserBulkOperation,
  type UserBulkResult,
  type UserDirectoryQuery,
  type UserDirectoryReport,
  type UserImportMode,
  type UserImportPreview,
  type UserImportResult,
  type UserImportRowInput,
} from '@/services/admin/userDirectory'

export const userDirectoryKeys = {
  all: ['admin', 'users', 'directory'] as const,
  directory: (query: UserDirectoryQuery) =>
    [...userDirectoryKeys.all, query] as const,
}

/** The scoped directory: rows, facets, whole-set aggregates, page arithmetic. */
export function useUserDirectory(
  query: UserDirectoryQuery,
  options?: { enabled?: boolean },
) {
  return useQuery<UserDirectoryReport>({
    queryKey: userDirectoryKeys.directory(query),
    queryFn: () => userDirectoryService.getDirectory(query),
    enabled: options?.enabled ?? true,
    // The directory is a report an operator reads and acts on; keeping the
    // previous page on screen while the next one loads is what makes paging feel
    // like paging rather than a full reload.
    placeholderData: (previous) => previous,
  })
}

function useInvalidateDirectory() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: userDirectoryKeys.all })
  }
}

/** Create one account. */
export function useCreateDirectoryUser() {
  const invalidate = useInvalidateDirectory()
  return useMutation({
    mutationFn: (input: {
      email: string
      password: string
      first_name: string
      last_name: string
      phone?: string
      role: string
      institution_id?: string
    }) => userDirectoryService.create(input),
    onSuccess: invalidate,
  })
}

/** Update one account. Every field sent here is implemented server-side (R6.2). */
export function useUpdateDirectoryUser() {
  const invalidate = useInvalidateDirectory()
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string
      data: {
        email?: string
        first_name?: string
        last_name?: string
        phone?: string
        role?: string
        is_active?: boolean
        password?: string
      }
    }) => userDirectoryService.update(id, data),
    onSuccess: invalidate,
  })
}

/** Deactivate one account. */
export function useDeactivateDirectoryUser() {
  const invalidate = useInvalidateDirectory()
  return useMutation({
    mutationFn: (id: string) => userDirectoryService.deactivate(id),
    onSuccess: invalidate,
  })
}

/** One bulk role/status command (R6.5). */
export function useUserBulkCommand() {
  const invalidate = useInvalidateDirectory()
  return useMutation<
    UserBulkResult,
    Error,
    { operation: UserBulkOperation; user_ids: string[]; role?: string | null }
  >({
    mutationFn: (input) => userDirectoryService.bulk(input),
    onSuccess: invalidate,
  })
}

/** Validate an import without writing anything (R6.4). */
export function useUserImportPreview() {
  return useMutation<
    UserImportPreview,
    Error,
    { institution_id: string; mode?: UserImportMode; rows: UserImportRowInput[] }
  >({
    mutationFn: (input) => userDirectoryService.previewImport(input),
  })
}

/** Apply the import under its declared mode (R6.4). */
export function useUserImportCommit() {
  const invalidate = useInvalidateDirectory()
  return useMutation<
    UserImportResult,
    Error,
    { institution_id: string; mode?: UserImportMode; rows: UserImportRowInput[] }
  >({
    mutationFn: (input) => userDirectoryService.commitImport(input),
    onSuccess: (result) => {
      // Only a batch that actually wrote something invalidates the directory: a
      // rolled-back import changed nothing, and refetching would suggest it did.
      if (result.committed) invalidate()
    },
  })
}

/** Download the server's directory CSV for the current filters. */
export function useUserDirectoryExport() {
  return useMutation({
    mutationFn: (query: UserDirectoryQuery) =>
      userDirectoryService.downloadExport(
        userDirectoryService.exportPath(query),
        'users.csv',
      ),
  })
}
