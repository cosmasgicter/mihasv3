import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { catalogService, programService, intakeService } from '@/services/catalog'
import type { AssignmentPreview } from '@/services/catalog'
import { QUERY_CACHE_CONFIG } from '@/lib/queryCacheConfig'

// Query Keys
const QUERY_KEYS = {
  catalog: ['catalog'] as const,
  context: ['catalog', 'context'] as const,
  programs: ['catalog', 'programs'] as const,
  intakes: ['catalog', 'intakes'] as const,
  subjects: ['catalog', 'subjects'] as const,
  assignmentPreview: ['catalog', 'assignment-preview'] as const,
}

export interface UseAssignmentPreviewArgs {
  programId: string | null
  intakeId: string | null
  nationality?: string | null
  country?: string | null
  institution?: string | null
}

// Data Access Functions
export const catalogData = {
  useContext: () => {
    return useQuery({
      queryKey: QUERY_KEYS.context,
      queryFn: () => catalogService.getContext(),
      ...QUERY_CACHE_CONFIG.static,
    })
  },

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
      queryKey: [...QUERY_KEYS.programs, 'canonical', 'intake', intakeId],
      queryFn: async () => {
        const context = await catalogService.getContext()
        const institution = context.portal_type === 'white_label' ? context.institution_id || undefined : undefined
        if (!intakeId) return catalogService.getCanonicalPrograms({ institution })
        const canonical = await catalogService.getCanonicalPrograms({ intake: intakeId, institution })
        if (canonical.programs.length > 0) return canonical
        return catalogService.getProgramsForIntake(intakeId)
      },
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

  /**
   * Resolve the assigned school + fee + required documents + contact for a
   * chosen canonical program + intake (R10.2). Only runs once both ids are
   * present. The query result drives the assigned-school checkpoint and gates
   * payment (R10.3): payment is unreachable until this resolves successfully.
   */
  useAssignmentPreview: ({ programId, intakeId, nationality, country, institution }: UseAssignmentPreviewArgs) => {
    return useQuery<AssignmentPreview>({
      queryKey: [...QUERY_KEYS.assignmentPreview, programId, intakeId, nationality ?? null, country ?? null, institution ?? null],
      queryFn: () => catalogService.getAssignmentPreview({
        programId: programId as string,
        intakeId: intakeId as string,
        nationality,
        country,
        institution,
      }),
      enabled: Boolean(programId && intakeId),
      ...QUERY_CACHE_CONFIG.static,
      retry: false,
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
