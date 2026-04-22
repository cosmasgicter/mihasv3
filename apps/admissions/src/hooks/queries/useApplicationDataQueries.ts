import { useQuery } from '@tanstack/react-query'

import { applicationService } from '@/services/applications'
import { CACHE_CONFIG } from '@/hooks/queries/useQueryConfig'

export function useApplications(userId: string) {
  return useQuery({
    queryKey: ['applications', userId],
    queryFn: () => applicationService.list({ user_id: userId }),
    ...CACHE_CONFIG.applications,
  })
}

export function useApplication(id: string) {
  return useQuery({
    queryKey: ['application', id],
    queryFn: () => applicationService.getById(id),
    ...CACHE_CONFIG.applications,
    enabled: !!id,
  })
}
