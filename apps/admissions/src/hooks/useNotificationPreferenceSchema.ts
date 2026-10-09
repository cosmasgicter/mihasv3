/**
 * The published notification-preference schema, read once and shared.
 *
 * Admissions-v2 task 10.1 — R13.4, R13.8; finding **STU-14**.
 *
 * Two surfaces need this one response:
 *
 * - **`/student/notifications`** renders the switches from it, and re-renders
 *   from the PUT's own response so what is on screen is what was stored;
 * - **`/student/communications`** reads its `delivery_state_definitions` and
 *   `retry_limit`, because the delivery-state vocabulary is published on the
 *   schema surface rather than repeated on every page of the inbox (the
 *   notification list keeps its registered `{page, pageSize, totalCount,
 *   results}` envelope).
 *
 * One query key, so the two surfaces share the cache and the inbox costs no
 * extra round trip once the settings screen has been opened — and vice versa.
 *
 * ## Why the name says "schema"
 *
 * `src/hooks/useNotificationPreferences.ts` is a **retired** path. The archived
 * `duplicate-deprecated-consolidation` spec deleted a hook of that name as one
 * of two competing answers to "read and write notification preferences", and
 * pinned both its absence (`tests/property/consolidation-dead-files.test.ts`)
 * and the absence of any import of it (`consolidation-imports.test.ts`,
 * `consolidation-eslint.test.ts`). Its ESLint restriction still redirects to
 * `@/hooks/queries/useNotificationQueries`, which that same spec also deleted.
 *
 * This hook is a different thing — it reads the **server's published schema**
 * rather than holding a field list of its own, which is the whole of STU-14 —
 * so it takes a name of its own. Reusing the retired one would have meant
 * either resurrecting a name the platform declared dead or weakening another
 * spec's drift guard to make room, and 10.1 exists because a control drifted
 * from what the platform actually does.
 */

import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { notificationService } from '@/services/notifications'
import { useAuth } from '@/contexts/AuthContext'
import {
  type NotificationPreferenceSchema,
  type PreferenceUpdate,
} from '@/lib/notificationPreferences'

export const NOTIFICATION_PREFERENCES_QUERY_KEY = ['notification-preferences'] as const

export function useNotificationPreferenceSchema() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery<NotificationPreferenceSchema | null>({
    queryKey: NOTIFICATION_PREFERENCES_QUERY_KEY,
    queryFn: () => notificationService.getPreferences(),
    enabled: Boolean(user?.id),
    // The schema changes only when the student changes it, or when the platform
    // ships a new one. Neither is a polling concern.
    staleTime: 5 * 60 * 1000,
  })

  const mutation = useMutation({
    mutationFn: (payload: PreferenceUpdate) =>
      notificationService.updatePreferences(payload),
    onSuccess: (schema) => {
      // The PUT returns the re-resolved schema, so the screen is refreshed from
      // the stored state rather than from an optimistic guess. A rejected write
      // therefore cannot leave a switch looking as though it took.
      if (schema) {
        queryClient.setQueryData(NOTIFICATION_PREFERENCES_QUERY_KEY, schema)
      } else {
        queryClient.invalidateQueries({ queryKey: NOTIFICATION_PREFERENCES_QUERY_KEY })
      }
    },
  })

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: NOTIFICATION_PREFERENCES_QUERY_KEY })
  }, [queryClient])

  return {
    schema: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refresh,
    save: mutation.mutateAsync,
    isSaving: mutation.isPending,
    saveError: mutation.error as unknown,
    savingField: (mutation.variables ? Object.keys(mutation.variables)[0] : null) ?? null,
  }
}

export default useNotificationPreferenceSchema
