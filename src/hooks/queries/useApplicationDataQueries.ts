import { useQuery } from '@tanstack/react-query'

import { applicationService } from '@/services/applications'
import { catalogService } from '@/services/catalog'
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

export function usePrograms() {
  return useQuery({
    queryKey: ['programs'],
    queryFn: () => catalogService.getPrograms(),
    ...CACHE_CONFIG.static,
  })
}

export function useIntakes() {
  return useQuery({
    queryKey: ['intakes'],
    queryFn: () => catalogService.getIntakes(),
    ...CACHE_CONFIG.static,
  })
}
