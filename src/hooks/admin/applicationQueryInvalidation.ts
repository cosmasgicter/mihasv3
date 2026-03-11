import type { QueryClient, QueryKey } from '@tanstack/react-query'

export interface AdminApplicationInvalidationOptions {
  applicationId?: string
  includeApplicationHistory?: boolean
  includePaymentStatus?: boolean
}

export function getAdminApplicationInvalidationKeys(
  options: AdminApplicationInvalidationOptions = {},
): QueryKey[] {
  const {
    applicationId,
    includeApplicationHistory = false,
    includePaymentStatus = false,
  } = options

  const keys: QueryKey[] = [
    ['applications'],
    ['application-stats'],
    ['admin-applications'],
    ['admin-dashboard-polling'],
  ]

  if (applicationId) {
    keys.push(['applications', applicationId])
  }

  if (includeApplicationHistory) {
    keys.push(['application-history'])
  }

  if (includePaymentStatus) {
    keys.push(['payment-status'])
  }

  return keys
}

export async function invalidateAdminApplicationQueries(
  queryClient: Pick<QueryClient, 'invalidateQueries'>,
  options: AdminApplicationInvalidationOptions = {},
) {
  const invalidationKeys = getAdminApplicationInvalidationKeys(options)

  await Promise.all(
    invalidationKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  )
}

export default invalidateAdminApplicationQueries
