import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { catalogService, programService, intakeService } from '@/services/catalog'

// Query Keys
const QUERY_KEYS = {
  catalog: ['catalog'] as const,
  programs: ['catalog', 'programs'] as const,
  intakes: ['catalog', 'intakes'] as const,
  subjects: ['catalog', 'subjects'] as const,
}

// Data Access Functions
export const catalogData = {
  // Get all programs
  usePrograms: () => {
    return useQuery({
      queryKey: QUERY_KEYS.programs,
      queryFn: () => catalogService.getPrograms(),
      staleTime: 300000 // 5 minutes
    })
  },

  // Get all intakes
  useIntakes: () => {
    return useQuery({
      queryKey: QUERY_KEYS.intakes,
      queryFn: () => catalogService.getIntakes(),
      staleTime: 300000 // 5 minutes
    })
  },

  // Get all Grade 12 subjects
  useSubjects: () => {
    return useQuery({
      queryKey: QUERY_KEYS.subjects,
      queryFn: () => catalogService.getSubjects(),
      staleTime: 600000 // 10 minutes
    })
  },

  // Program mutations
  useCreateProgram: () => {
    const queryClient = useQueryClient()
    
    return useMutation({
      mutationFn: (data: { name: string; description?: string; duration_years: number; institution_id: string }) =>
        programService.create(data),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.programs })
      }
    })
  },

  useUpdateProgram: () => {
    const queryClient = useQueryClient()
    
    return useMutation({
      mutationFn: (data: { id: string; name: string; description?: string; duration_years: number; institution_id: string }) =>
        programService.update(data),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.programs })
      }
    })
  },

  useDeleteProgram: () => {
    const queryClient = useQueryClient()
    
    return useMutation({
      mutationFn: (id: string) => programService.delete(id),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.programs })
      }
    })
  },

  // Intake mutations
  useCreateIntake: () => {
    const queryClient = useQueryClient()
    
    return useMutation({
      mutationFn: (data: { name: string; year: number; start_date: string; end_date: string; application_deadline: string; total_capacity: number; available_spots?: number }) =>
        intakeService.create(data),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.intakes })
      }
    })
  },

  useUpdateIntake: () => {
    const queryClient = useQueryClient()
    
    return useMutation({
      mutationFn: (data: { id: string; name: string; year: number; start_date: string; end_date: string; application_deadline: string; total_capacity: number; available_spots?: number }) =>
        intakeService.update(data),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.intakes })
      }
    })
  },

  useDeleteIntake: () => {
    const queryClient = useQueryClient()
    
    return useMutation({
      mutationFn: (id: string) => intakeService.delete(id),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.intakes })
      }
    })
  }
}