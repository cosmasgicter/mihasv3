import { useQuery } from '@tanstack/react-query'
import { applicationService } from '@/services/applications'

export function useApplicationsWithCounts() {
  return useQuery({
    queryKey: ['applications-with-counts'],
    queryFn: async () => {
      const result = await applicationService.list({
        sortBy: 'date',
        sortOrder: 'desc',
      })
      return result?.applications ?? []
    }
  })
}
