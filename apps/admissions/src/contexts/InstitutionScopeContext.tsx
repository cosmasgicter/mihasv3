/**
 * Admin institution-scope context.
 *
 * Single source of truth for the admin's tenant scope + the currently-selected
 * institution filter. Wraps the admin area so every admin page can:
 *   - know whether the actor is a super-admin (gets a switcher) or a scoped
 *     school admin (auto-locked to their institution, no switcher), and
 *   - read `selectedInstitutionId` to pass `?institution_id=` to admin APIs.
 *
 * For a single-institution school admin the selection is auto-locked to that
 * institution and `showSwitcher` is false. For a super-admin the default is
 * "All schools" (`selectedInstitutionId === null`) and they may narrow via the
 * switcher; the choice persists in sessionStorage for the session.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'

import { adminScopeService, type AdminScopeInstitution } from '@/services/admin/scope'
import { useAuth } from '@/contexts/AuthContext'
import { isAdmin as isAdminRole } from '@/types/roles'

const STORAGE_KEY = 'beanola:admin:selected-institution'

interface InstitutionScopeValue {
  /** Institutions the actor may act on (full list for super-admins). */
  institutions: AdminScopeInstitution[]
  /** True for super-admins (multi-institution selector shown). */
  allAccess: boolean
  /** Whether to render the institution switcher (super-admin + >1 option). */
  showSwitcher: boolean
  /** The active institution filter, or null for "All schools" (super-admin). */
  selectedInstitutionId: string | null
  setSelectedInstitutionId: (id: string | null) => void
  isLoading: boolean
}

const InstitutionScopeContext = createContext<InstitutionScopeValue | undefined>(undefined)

export function InstitutionScopeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const isAdmin = isAdminRole(user)

  const { data: scope, isLoading } = useQuery({
    queryKey: ['admin', 'scope'],
    queryFn: () => adminScopeService.getScope(),
    enabled: isAdmin,
    staleTime: 5 * 60_000,
  })

  const institutions = scope?.institutions ?? []
  const allAccess = Boolean(scope?.all_access)

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

  // A scoped school admin is auto-locked to their (single) institution; a
  // super-admin defaults to "All schools" (null) until they pick one. Reconcile
  // the persisted selection once scope resolves so a stale id can't leak.
  useEffect(() => {
    if (isLoading || !scope) return
    if (!allAccess) {
      // Scoped admin: lock to the first (typically only) institution.
      const onlyId = institutions[0]?.id ?? null
      if (selectedInstitutionId !== onlyId) setSelectedInstitutionId(onlyId)
      return
    }
    // Super-admin: drop a persisted id that is no longer a valid option.
    if (selectedInstitutionId && !institutions.some((i) => i.id === selectedInstitutionId)) {
      setSelectedInstitutionId(null)
    }
  }, [isLoading, allAccess, scope, institutions.length])

  const value = useMemo<InstitutionScopeValue>(
    () => ({
      institutions,
      allAccess,
      showSwitcher: allAccess && institutions.length > 1,
      selectedInstitutionId,
      setSelectedInstitutionId,
      isLoading,
    }),
    [institutions, allAccess, selectedInstitutionId, isLoading],
  )

  return <InstitutionScopeContext.Provider value={value}>{children}</InstitutionScopeContext.Provider>
}

export function useInstitutionScope(): InstitutionScopeValue {
  const ctx = useContext(InstitutionScopeContext)
  if (!ctx) {
    // Safe default outside the provider (e.g. non-admin routes): no scope,
    // no switcher, "All schools".
    return {
      institutions: [],
      allAccess: false,
      showSwitcher: false,
      selectedInstitutionId: null,
      setSelectedInstitutionId: () => {},
      isLoading: false,
    }
  }
  return ctx
}
