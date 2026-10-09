/**
 * User read/write data hooks (Admissions V2, task 9.3).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 9.3.
 * Requirements: R6.1, R6.2 · Findings: ADM-03, AUTH-04.
 *
 * `useList()` is gone. It called `userService.list()` with **no arguments** — the
 * first server page — and the directory page then filtered, sorted, paginated,
 * and exported the array it got back. The scoped query lives in
 * `hooks/admin/useUserDirectory.ts`, which takes the whole server query as its
 * cache key. Anything that needs the directory reads that.
 *
 * The write hooks stay here (existing callers import them from this module) but
 * they now send the endpoint's **own** field contract: `first_name`/`last_name`,
 * `email`, `phone`, `role`, `is_active`. `email` and `phone` used to be sent and
 * silently discarded inside a `200 OK`.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { userService } from '@/services/admin/users'
import { userDirectoryKeys } from '@/hooks/admin/useUserDirectory'
import { userDirectoryService } from '@/services/admin/userDirectory'

// Query Keys
const QUERY_KEYS = {
  users: ['users'] as const,
  userDetail: (id: string) => ['users', 'detail', id] as const,
}

/** Split a display name the way the server does, for the write payload. */
function splitFullName(fullName: string): { first_name: string; last_name: string } {
  const normalized = fullName.trim().replace(/\s+/g, ' ')
  if (!normalized) return { first_name: '', last_name: '' }
  const [first, ...rest] = normalized.split(' ')
  return { first_name: first ?? '', last_name: rest.join(' ') || (first ?? '') }
}

function useInvalidateUsers() {
  const queryClient = useQueryClient()
  return (id?: string) => {
    if (id) queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userDetail(id) })
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.users })
    // The directory is the surface an operator is looking at, and it is keyed by
    // the whole server query — so the prefix is what has to be invalidated.
    queryClient.invalidateQueries({ queryKey: userDirectoryKeys.all })
  }
}

// Data Access Functions
export const usersData = {
  // Create user
  useCreate: () => {
    const invalidate = useInvalidateUsers()

    return useMutation({
      mutationFn: (data: {
        email: string
        password: string
        full_name: string
        phone?: string
        role: string
        institution_id?: string
      }) =>
        userDirectoryService.create({
          email: data.email,
          password: data.password,
          ...splitFullName(data.full_name),
          phone: data.phone,
          role: data.role,
          institution_id: data.institution_id,
        }),
      onSuccess: () => invalidate(),
    })
  },

  // Update user
  useUpdate: () => {
    const invalidate = useInvalidateUsers()

    return useMutation({
      mutationFn: ({
        id,
        data,
      }: {
        id: string
        data: {
          full_name?: string
          first_name?: string
          last_name?: string
          email?: string
          phone?: string
          role?: string
          is_active?: boolean
        }
      }) => {
        const { full_name, ...rest } = data
        return userDirectoryService.update(id, {
          ...rest,
          ...(full_name !== undefined ? splitFullName(full_name) : {}),
        })
      },
      onSuccess: (_result, { id }) => invalidate(id),
    })
  },

  // Deactivate user (never a delete — applications, documents, and audit rows
  // stay attached to the account).
  useRemove: () => {
    const invalidate = useInvalidateUsers()

    return useMutation({
      mutationFn: (id: string) => userDirectoryService.deactivate(id),
      onSuccess: () => invalidate(),
    })
  },

  // Read the target user's backend-derived Effective_Capabilities (read-only).
  // The fake permission editor + updatePermissions mutation are retired
  // (task 2.4): platform role, membership, and access grants are the only
  // authority mutations, each managed through its own canonical command.
  useEffectiveCapabilities: (userId?: string) => {
    return useQuery({
      queryKey: ['user-effective-capabilities', userId],
      queryFn: () => (userId ? userService.getEffectiveCapabilities(userId) : Promise.resolve(null)),
      enabled: Boolean(userId),
    })
  },
}
