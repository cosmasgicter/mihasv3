/**
 * Admin capability context (enterprise-tenant-authority).
 *
 * Sibling to `InstitutionScopeContext`: the single frontend source of truth for
 * *what the admin may do*, consumed from the backend Capability_Endpoint
 * (`GET /api/v1/admin/capabilities/`). The backend remains the security
 * boundary — this context is a usability layer that mirrors backend authority
 * so nav, panels, and controls render correctly without duplicating role logic.
 *
 * Authority is derived from the backend `is_super_admin` flag (R11.1), never
 * from raw role strings:
 *   - `isSuperAdmin`  = backend `is_super_admin`.
 *   - `isTenantAdmin` = not super-admin AND holds capabilities for ≥1 institution.
 *
 * `can()` / `canForInstitution()` evaluate the backend Capability_Set (R11.2):
 *   - super-admin: `can()` checks the platform.* capability list.
 *   - tenant-admin: `can()` checks the *selected* institution's tenant.* set
 *     (falling back to the only assigned institution when nothing is selected
 *     yet), and `canForInstitution()` checks a specific institution's set.
 *
 * The selected institution scope persists across refresh in `sessionStorage`
 * (R11.4), sharing the same key as `InstitutionScopeContext` so both contexts
 * agree on the active tenant. With no tenant scope the context yields a clear
 * no-access state and renders no tenant data (R11.5).
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useQuery } from '@tanstack/react-query'

import {
  adminCapabilityService,
  type AdminCapabilityInstitution,
} from '@/services/admin/capabilities'
import { useAuth } from '@/contexts/AuthContext'
import { isReviewer as isReviewerOrAbove } from '@/types/roles'

// Shared with InstitutionScopeContext so the selected tenant stays consistent
// across both contexts and survives a page refresh for the session.
const STORAGE_KEY = 'beanola:admin:selected-institution'

export interface CapabilityValue {
  isSuperAdmin: boolean
  isTenantAdmin: boolean
  /** Platform.* capabilities (super-admin). */
  capabilities: string[]
  /** institutionId -> tenant.* capabilities. */
  institutionCapabilities: Record<string, string[]>
  /**
   * The actor's in-scope schools with their names, straight from the capability
   * endpoint. Exposed by admissions-v2 task 9.3 so a surface that has to *name* a
   * school (the user import's target, R6.4) reads the same already-fetched,
   * already-scoped list the capability checks use, rather than issuing a second
   * institution read with a different authority.
   */
  institutions: AdminCapabilityInstitution[]
  selectedInstitutionId: string | null
  setSelectedInstitutionId: (id: string | null) => void
  can: (capability: string) => boolean
  canForInstitution: (institutionId: string, capability: string) => boolean
  /** True when the actor has no platform reach and no tenant scope (R11.5). */
  noAccess: boolean
  isLoading: boolean
}

const CapabilityContext = createContext<CapabilityValue | undefined>(undefined)

// No-scope default: zero authority, no tenant data. Used both outside the
// provider (non-admin routes) and as the fail-closed shape (R11.5, R1.6).
const NO_ACCESS_VALUE: CapabilityValue = {
  isSuperAdmin: false,
  isTenantAdmin: false,
  capabilities: [],
  institutionCapabilities: {},
  institutions: [],
  selectedInstitutionId: null,
  setSelectedInstitutionId: () => {},
  can: () => false,
  canForInstitution: () => false,
  noAccess: true,
  isLoading: false,
}

export function CapabilityProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  /**
   * Who may hold capabilities at all.
   *
   * Admissions-v2 task 9.4 (finding **AUTH-01**) widened this from `isAdmin` to
   * **reviewer-or-above**. A scoped Reviewer does hold `tenant.*` capabilities —
   * that is the platform's own authority model — but this provider never asked
   * for them, so `AdminRoute` had nothing to admit them on and the review
   * workspace was unreachable in a browser for the one role that exists to
   * review.
   *
   * `isReviewer` is the hierarchy predicate "at least reviewer", so this reads as
   * reviewer, admin, or super-admin. Spelling it as *not a student* would be
   * wrong here: `isStudent` is also a hierarchy check ("at least student"), which
   * every role satisfies, so `!isStudent(user)` is false for everyone and would
   * disable the query entirely. A student is excluded rather than asked, because
   * the endpoint masks them as a 404 and the call would spend a request to learn
   * what the role already says. The backend remains the boundary either way.
   */
  const mayHoldCapabilities = Boolean(user) && isReviewerOrAbove(user)

  const { data: capabilitySet, isLoading } = useQuery({
    queryKey: ['admin', 'capabilities'],
    queryFn: () => adminCapabilityService.getCapabilities(),
    enabled: mayHoldCapabilities,
    staleTime: 5 * 60_000,
  })

  const isSuperAdmin = Boolean(capabilitySet?.is_super_admin)
  const platformCapabilities = useMemo(
    () => capabilitySet?.capabilities ?? [],
    [capabilitySet],
  )

  // institutionId -> tenant.* capabilities. Memoized so identity is stable for
  // the helper closures below.
  const institutionCapabilities = useMemo<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {}
    for (const inst of capabilitySet?.institutions ?? []) {
      map[inst.id] = inst.capabilities
    }
    return map
  }, [capabilitySet])

  const institutions = useMemo<AdminCapabilityInstitution[]>(
    () => capabilitySet?.institutions ?? [],
    [capabilitySet],
  )
  const scopedInstitutionIds = useMemo(
    () => Object.keys(institutionCapabilities),
    [institutionCapabilities],
  )

  // A tenant-admin is a non-super-admin who holds capabilities for at least one
  // institution. Derived from backend authority, not role strings (R11.1).
  const isTenantAdmin =
    !isSuperAdmin &&
    scopedInstitutionIds.some((id) => (institutionCapabilities[id]?.length ?? 0) > 0)

  const [selectedInstitutionId, setSelectedInstitutionIdState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return window.sessionStorage.getItem(STORAGE_KEY) || null
  })

  const setSelectedInstitutionId = (id: string | null) => {
    setSelectedInstitutionIdState(id)
    if (typeof window !== 'undefined') {
      if (id) window.sessionStorage.setItem(STORAGE_KEY, id)
      else window.sessionStorage.removeItem(STORAGE_KEY)
    }
  }

  // Reconcile the persisted selection once capabilities resolve so a stale id
  // can't leak (mirrors InstitutionScopeContext). A tenant-admin scoped to a
  // single institution is auto-locked to it; a super-admin / multi-institution
  // admin keeps a valid selection or clears an invalid one.
  useEffect(() => {
    if (isLoading || !capabilitySet) return
    if (!isSuperAdmin && scopedInstitutionIds.length === 1) {
      const onlyId = scopedInstitutionIds[0] ?? null
      if (selectedInstitutionId !== onlyId) setSelectedInstitutionId(onlyId)
      return
    }
    if (selectedInstitutionId && !scopedInstitutionIds.includes(selectedInstitutionId)) {
      setSelectedInstitutionId(null)
    }
  }, [isLoading, isSuperAdmin, capabilitySet, scopedInstitutionIds.length])

  const noAccess = !isSuperAdmin && scopedInstitutionIds.length === 0

  const value = useMemo<CapabilityValue>(() => {
    const canForInstitution = (institutionId: string, capability: string): boolean =>
      institutionCapabilities[institutionId]?.includes(capability) ?? false

    const can = (capability: string): boolean => {
      if (isSuperAdmin) return platformCapabilities.includes(capability)
      // Tenant-admin: evaluate against the selected institution, falling back
      // to the only assigned institution when nothing is selected yet.
      const effectiveId =
        selectedInstitutionId ??
        (scopedInstitutionIds.length === 1 ? scopedInstitutionIds[0] : null)
      if (!effectiveId) return false
      return canForInstitution(effectiveId, capability)
    }

    return {
      isSuperAdmin,
      isTenantAdmin,
      capabilities: platformCapabilities,
      institutionCapabilities,
      institutions,
      selectedInstitutionId,
      setSelectedInstitutionId,
      can,
      canForInstitution,
      noAccess,
      isLoading,
    }
  }, [
    isSuperAdmin,
    isTenantAdmin,
    platformCapabilities,
    institutionCapabilities,
    institutions,
    scopedInstitutionIds,
    selectedInstitutionId,
    noAccess,
    isLoading,
  ])

  return <CapabilityContext.Provider value={value}>{children}</CapabilityContext.Provider>
}

export function useCapabilities(): CapabilityValue {
  const ctx = useContext(CapabilityContext)
  // Safe default outside the provider (e.g. non-admin routes): no authority,
  // no tenant data — the same fail-closed shape used for a no-scope actor.
  return ctx ?? NO_ACCESS_VALUE
}
