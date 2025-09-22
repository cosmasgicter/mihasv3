import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useApplicationsWithCounts() {
  return useQuery({
    queryKey: ['applications-with-counts'],
    queryFn: async () => {
      // Single optimized query with document counts
      const { data, error } = await supabase
        .from('applications_new')
        .select(`
          *
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data
    }
  })
}