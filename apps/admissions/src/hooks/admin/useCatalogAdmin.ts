/**
 * Canonical catalog admin hooks (Admissions V2, task 5.1).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 5.1
 * Requirements: R7.1-R7.5, R14.7 · Findings: TEN-03, DATA-01, API-02.
 *
 * React Query hooks over `catalogAdminService` so the admin catalog pages
 * (Programs, Intakes, Program Fees) consume the canonical catalog graph through
 * domain hooks — never the raw transport client (design §14.3). Every mutation
 * invalidates the affected catalog query keys so lists stay fresh after a write.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  catalogAdminService,
  type CatalogIntake,
  type CatalogIntakePayload,
  type CatalogOffering,
  type CanonicalProgramOption,
  type CreateOfferingPayload,
  type CreateProgramIntakePayload,
  type TenantInstitution,
  type TenantProgramFee,
  type TenantProgramFeePayload,
  type UpdateOfferingPayload,
} from '@/services/admin/catalog'

/** Stable React Query key factory for the admin catalog domain. */
export const catalogKeys = {
  all: ['admin', 'catalog'] as const,
  canonicalPrograms: () => [...catalogKeys.all, 'canonical-programs'] as const,
  offerings: () => [...catalogKeys.all, 'offerings'] as const,
  intakes: () => [...catalogKeys.all, 'intakes'] as const,
  institutions: () => [...catalogKeys.all, 'institutions'] as const,
  fees: () => [...catalogKeys.all, 'fees'] as const,
}

// ── Queries ────────────────────────────────────────────────────────────────

export function useCanonicalPrograms() {
  return useQuery<CanonicalProgramOption[]>({
    queryKey: catalogKeys.canonicalPrograms(),
    queryFn: () => catalogAdminService.listCanonicalPrograms(),
  })
}

export function useCatalogOfferings() {
  return useQuery<CatalogOffering[]>({
    queryKey: catalogKeys.offerings(),
    queryFn: () => catalogAdminService.listCatalogOfferings(),
  })
}

export function useCatalogIntakes() {
  return useQuery<CatalogIntake[]>({
    queryKey: catalogKeys.intakes(),
    queryFn: () => catalogAdminService.listIntakes(),
  })
}

export function useCatalogInstitutions(params?: { search?: string; active?: boolean }) {
  return useQuery<{ institutions: TenantInstitution[]; totalCount: number }>({
    queryKey: [...catalogKeys.institutions(), params ?? {}],
    queryFn: () => catalogAdminService.listInstitutions(params),
  })
}

/**
 * Fetch the fee schedules for a set of offerings, flattened and tagged with the
 * offering name for display. The fees page passes the program offerings it has
 * loaded; nothing is fetched until at least one offering exists.
 */
export function useProgramFees(
  offerings: Array<{ id: string; name: string }>,
) {
  return useQuery<Array<TenantProgramFee & { programName: string }>>({
    queryKey: [...catalogKeys.fees(), offerings.map((o) => o.id).sort()],
    enabled: offerings.length > 0,
    queryFn: async () => {
      const results = await Promise.all(
        offerings.map(async (offering) => {
          const fees = await catalogAdminService.listFees(offering.id)
          return fees.map((fee) => ({ ...fee, programName: offering.name }))
        }),
      )
      return results.flat()
    },
  })
}

// ── Mutation bundles ─────────────────────────────────────────────────────────

/** Offering create / update / deactivate — invalidates offering + fee lists. */
export function useOfferingMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: catalogKeys.offerings() })
    queryClient.invalidateQueries({ queryKey: catalogKeys.fees() })
  }

  const create = useMutation({
    mutationFn: (input: { institutionId: string; data: CreateOfferingPayload }) =>
      catalogAdminService.createOffering(input.institutionId, input.data),
    onSuccess: invalidate,
  })
  const update = useMutation({
    mutationFn: (input: { institutionId: string; offeringId: string; data: UpdateOfferingPayload }) =>
      catalogAdminService.updateOffering(input.institutionId, input.offeringId, input.data),
    onSuccess: invalidate,
  })
  const deactivate = useMutation({
    mutationFn: (input: { institutionId: string; offeringId: string }) =>
      catalogAdminService.deactivateOffering(input.institutionId, input.offeringId),
    onSuccess: invalidate,
  })
  const linkIntake = useMutation({
    mutationFn: (data: CreateProgramIntakePayload) => catalogAdminService.createProgramIntake(data),
    onSuccess: invalidate,
  })

  return { create, update, deactivate, linkIntake }
}

/** Global intake-period create / update / deactivate. */
export function useIntakeMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: catalogKeys.intakes() })

  const create = useMutation({
    mutationFn: (data: CatalogIntakePayload) => catalogAdminService.createIntake(data),
    onSuccess: invalidate,
  })
  const update = useMutation({
    mutationFn: (input: { id: string; data: Partial<CatalogIntakePayload> }) =>
      catalogAdminService.updateIntake(input.id, input.data),
    onSuccess: invalidate,
  })
  const deactivate = useMutation({
    mutationFn: (id: string) => catalogAdminService.deactivateIntake(id),
    onSuccess: invalidate,
  })

  return { create, update, deactivate }
}

/** Fee create / update / deactivate — invalidates the fee list. */
export function useFeeMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: catalogKeys.fees() })

  const create = useMutation({
    mutationFn: (input: { offeringId: string; data: TenantProgramFeePayload }) =>
      catalogAdminService.createFee(input.offeringId, input.data),
    onSuccess: invalidate,
  })
  const update = useMutation({
    mutationFn: (input: { offeringId: string; feeId: string; data: TenantProgramFeePayload }) =>
      catalogAdminService.updateFee(input.offeringId, input.feeId, input.data),
    onSuccess: invalidate,
  })
  const deactivate = useMutation({
    mutationFn: (input: { offeringId: string; feeId: string }) =>
      catalogAdminService.deactivateFee(input.offeringId, input.feeId),
    onSuccess: invalidate,
  })

  return { create, update, deactivate }
}

/** Institution (tenant) create / update / deactivate — invalidates offerings + institutions. */
export function useInstitutionMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: catalogKeys.institutions() })
    queryClient.invalidateQueries({ queryKey: catalogKeys.offerings() })
  }

  const create = useMutation({
    mutationFn: (data: Partial<TenantInstitution>) => catalogAdminService.createInstitution(data),
    onSuccess: invalidate,
  })
  const update = useMutation({
    mutationFn: (input: { id: string; data: Partial<TenantInstitution> }) =>
      catalogAdminService.updateInstitution(input.id, input.data),
    onSuccess: invalidate,
  })
  const deactivate = useMutation({
    mutationFn: (id: string) => catalogAdminService.deactivateInstitution(id),
    onSuccess: invalidate,
  })

  return { create, update, deactivate }
}
