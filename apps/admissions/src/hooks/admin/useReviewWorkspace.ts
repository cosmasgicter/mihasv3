/**
 * The admin review workspace hooks (Admissions V2, task 9.4).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 9.4
 * Requirements: R8.3, R8.4, R8.5 · Findings: AUTH-01, AUTH-02, API-02.
 *
 * One query for the read, one mutation per command. Two things are deliberate:
 *
 * 1. **The version comes from the query, not from the caller.** A component never
 *    holds its own copy of the version, so it cannot send a version it read three
 *    interactions ago. `useReviewCommand` reads the version out of the cached
 *    workspace at the moment the command is issued.
 * 2. **A `VERSION_CONFLICT` refetches instead of reporting failure.** Someone
 *    else decided first; the reviewer needs to see the newer decision, not an
 *    error toast. The conflict is surfaced *and* the workspace is refreshed.
 */
import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  isVersionConflict,
  reviewWorkspaceService,
  type CommandOutcome,
  type ReviewWorkspace,
} from '@/services/admin/reviewWorkspace'

export const reviewWorkspaceKeys = {
  all: ['admin', 'applications', 'workspace'] as const,
  detail: (applicationId: string) => [...reviewWorkspaceKeys.all, applicationId] as const,
}

/** The one workspace read. */
export function useReviewWorkspace(
  applicationId: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery<ReviewWorkspace>({
    queryKey: reviewWorkspaceKeys.detail(applicationId ?? 'none'),
    queryFn: () => reviewWorkspaceService.get(applicationId as string),
    enabled: Boolean(applicationId) && (options?.enabled ?? true),
    // A reviewer opening the same application twice in a session should see the
    // current answer, not a cached one from before their last decision.
    staleTime: 0,
  })
}

/**
 * Run one versioned command against the open workspace.
 *
 * `run` takes a function of the current version, so the version travelling with
 * the command is always the one the workspace last reported. On success the
 * workspace is invalidated, which is what makes the *next* command's version
 * correct without any component tracking it.
 */
export function useReviewCommand(applicationId: string | null) {
  const queryClient = useQueryClient()
  const key = reviewWorkspaceKeys.detail(applicationId ?? 'none')

  const currentVersion = useCallback((): number | null => {
    const cached = queryClient.getQueryData<ReviewWorkspace>(key)
    return cached ? cached.version : null
  }, [queryClient, key])

  const mutation = useMutation<
    CommandOutcome,
    unknown,
    (expectedVersion: number) => Promise<CommandOutcome>
  >({
    mutationFn: async (issue) => {
      const version = currentVersion()
      if (version === null) {
        // No workspace loaded means no version to stand on. Refusing here is the
        // same decision the backend would make; making it in one place keeps a
        // command from being sent with a guessed version.
        throw new Error('The application must be loaded before a decision can be recorded.')
      }
      return issue(version)
    },
    onSettled: (_data, error) => {
      // Both outcomes refresh: a success moved the version, and a conflict means
      // the reviewer is looking at a stale answer they need replaced.
      if (!error || isVersionConflict(error)) {
        void queryClient.invalidateQueries({ queryKey: key })
      }
    },
  })

  return {
    run: mutation.mutateAsync,
    isPending: mutation.isPending,
    error: mutation.error,
    conflicted: isVersionConflict(mutation.error),
    reset: mutation.reset,
    currentVersion,
  }
}

/** Refresh the open workspace (after an out-of-band change, e.g. an upload). */
export function useRefreshReviewWorkspace(applicationId: string | null) {
  const queryClient = useQueryClient()
  return useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: reviewWorkspaceKeys.detail(applicationId ?? 'none'),
    })
  }, [queryClient, applicationId])
}
