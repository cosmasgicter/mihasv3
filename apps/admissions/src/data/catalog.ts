import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { catalogService, programService, intakeService } from '@/services/catalog'
import { QUERY_CACHE_CONFIG } from '@/lib/queryCacheConfig'

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
      ...QUERY_CACHE_CONFIG.static,
    })
  },

  // Get programs filtered by intake (uses program_intakes junction)
  useProgramsForIntake: (intakeId: string | null) => {
    return useQuery({
      queryKey: [...QUERY_KEYS.programs, 'intake', intakeId],
      queryFn: () => intakeId ? catalogService.getProgramsForIntake(intakeId) : catalogService.getPrograms(),
      ...QUERY_CACHE_CONFIG.static,
      placeholderData: keepPreviousData,
    })
  },

  // Get all intakes
  useIntakes: () => {
    return useQuery({
      queryKey: QUERY_KEYS.intakes,
      queryFn: () => catalogService.getIntakes(),
      ...QUERY_CACHE_CONFIG.static,
    })
  },

  // Get all Grade 12 subjects
  useSubjects: () => {
    return useQuery({
      queryKey: QUERY_KEYS.subjects,
      queryFn: () => catalogService.getSubjects(),
      ...QUERY_CACHE_CONFIG.static,
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
      mutationFn: (data: { name: string; year: number; start_date: string; end_date: string; application_deadline: string; max_capacity: number }) =>
        intakeService.create(data),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.intakes })
      }
    })
  },

  useUpdateIntake: () => {
    const queryClient = useQueryClient()
    
    return useMutation({
      mutationFn: (data: { id: string; name: string; year: number; start_date: string; end_date: string; application_deadline: string; max_capacity: number }) =>
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