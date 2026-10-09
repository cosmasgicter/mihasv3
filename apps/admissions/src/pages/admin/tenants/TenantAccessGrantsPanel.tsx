/**
 * TenantAccessGrantsPanel (enterprise-tenant-authority; scoped selectors added
 * in admissions-v2 task 4.3, TEN-05).
 *
 * Scoped access grants are an explicit, audited exception that extends an
 * actor's access beyond their default memberships. This global access-grant
 * tooling is **Super_Admin / explicitly-granted only** (R12.5): it renders only
 * when the actor holds the platform `platform.access_grant.manage` capability.
 * A Tenant_Admin without that grant never sees this panel at all (it renders
 * nothing), so no grant tooling or data is exposed.
 *
 * Task 4.3 (TEN-05): the raw "User/Profile ID" and "Program offering ID" text
 * fields are replaced with accessible, tenant-scoped **search selectors** — an
 * email/name search datalist backed by `searchStaffCandidates` (resolved to the
 * canonical user id at submit), and an offering `<select>` backed by
 * `listOfferings`. No operator pastes a raw user or offering UUID. (An
 * application-scoped grant still takes the application id directly; a
 * tenant-scoped application search selector is owned by the admin-applications
 * work in Phase 9.)
 *
 * On a backend 403 the panel renders a precise authorization message and no
 * tenant data (R12.7). The backend re-enforces every read and write.
 */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { SectionCard } from '@/components/ui'
import { useCapabilities } from '@/contexts/CapabilityContext'
import { toast } from '@/hooks/useToast'
import { applicationRosterService } from '@/services/admin/applications'
import { tenantAdminService } from '@/services/admin/tenants'

import { tenantErrorMessage } from './errors'
import { PanelStateError } from './panelStates'
import { ResourceList, TENANT_SELECT_CLASS } from './primitives'

/**
 * How many recent applications the scoped selector offers. Bounded on purpose:
 * the grant is an exception for a named application, not a browse surface, and
 * the roster page itself is where an operator finds one at scale.
 */
const GRANT_APPLICATION_PAGE_SIZE = 50

interface GrantFormState {
  /** Free text (email/name) the operator searches on; resolved to a user id on submit. */
  user_search: string
  /** The canonical user id chosen from the search selector (TEN-05). */
  user_id: string
  scope_type: string
  program_id: string
  application_id: string
  expires_at: string
}

const emptyForm: GrantFormState = {
  user_search: '',
  user_id: '',
  scope_type: 'institution',
  program_id: '',
  application_id: '',
  expires_at: '',
}

function optionalString(value: string) {
  const trimmed = value.trim()
  return trimmed || undefined
}

export function TenantAccessGrantsPanel({ institutionId }: { institutionId: string }) {
  const queryClient = useQueryClient()
  const { isSuperAdmin, can } = useCapabilities()

  // R12.5: global access-grant tooling is super-admin / explicitly-granted only.
  const canManage = isSuperAdmin && can('platform.access_grant.manage')

  const [form, setForm] = useState<GrantFormState>(emptyForm)
  // Debounced query powering the accessible user search selector (TEN-05).
  const [candidateQuery, setCandidateQuery] = useState('')

  useEffect(() => {
    const handle = setTimeout(() => setCandidateQuery(form.user_search.trim()), 250)
    return () => clearTimeout(handle)
  }, [form.user_search])

  const grantsQuery = useQuery({
    queryKey: ['admin', 'tenants', 'grants', institutionId],
    queryFn: () => tenantAdminService.listAccessGrants({ institutionId }),
    enabled: Boolean(institutionId) && canManage,
  })

  // Scoped user candidates for the search selector — the same tenant-scoped
  // identity search the staff invite uses (R6.3, TEN-05).
  const candidatesQuery = useQuery({
    queryKey: ['admin', 'tenants', 'grant-candidates', institutionId, candidateQuery],
    queryFn: () => tenantAdminService.searchStaffCandidates(candidateQuery, institutionId),
    enabled: Boolean(institutionId) && canManage && candidateQuery.length >= 2,
  })

  // The tenant's offerings for the program-offering scope selector (TEN-05).
  const offeringsQuery = useQuery({
    queryKey: ['admin', 'tenants', 'offerings', institutionId],
    queryFn: () => tenantAdminService.listOfferings(institutionId),
    enabled: Boolean(institutionId) && canManage,
  })

  /*
    The tenant-scoped application selector's source (TEN-05, closing task 4.3's
    deferral). `institution_id` is a **server** filter resolved against the
    actor's scope before any lookup, so this list cannot contain another school's
    application and an out-of-scope id cannot be confirmed to exist. Fetched only
    when an application-scoped grant is actually being composed.
  */
  const applicationsQuery = useQuery({
    queryKey: ['admin', 'tenants', 'grant-applications', institutionId],
    queryFn: () =>
      applicationRosterService.getRoster({
        institution_id: institutionId,
        pageSize: GRANT_APPLICATION_PAGE_SIZE,
        sort: 'submitted_at',
        order: 'desc',
      }),
    enabled: Boolean(institutionId) && canManage && form.scope_type === 'application',
  })

  const candidates = useMemo(() => candidatesQuery.data || [], [candidatesQuery.data])
  const applications = useMemo(() => applicationsQuery.data?.results ?? [], [applicationsQuery.data])
  const offerings = useMemo(
    () => [...(offeringsQuery.data || [])].sort((a, b) => a.name.localeCompare(b.name)),
    [offeringsQuery.data],
  )

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] })
  }

  /** Resolve the typed search text to a canonical user id (TEN-05). */
  const resolveUserId = (): string | null => {
    if (form.user_id) return form.user_id
    const term = form.user_search.trim().toLowerCase()
    if (!term) return null
    const match = candidates.find(
      (candidate) => candidate.email.toLowerCase() === term || candidate.id.toLowerCase() === term,
    )
    return match ? match.id : null
  }

  const createMutation = useMutation({
    mutationFn: (userId: string) =>
      tenantAdminService.createAccessGrant({
        user_id: userId,
        scope_type: form.scope_type,
        institution_id: form.scope_type === 'institution' ? institutionId : undefined,
        program_id: form.scope_type === 'program_offering' ? optionalString(form.program_id) : undefined,
        application_id: form.scope_type === 'application' ? optionalString(form.application_id) : undefined,
        expires_at: optionalString(form.expires_at),
        is_active: true,
      }),
    onSuccess: () => {
      toast.success('Access grant added')
      setForm(emptyForm)
      invalidate()
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Access grant was not added')),
  })

  const deactivateMutation = useMutation({
    mutationFn: (grantId: string) => tenantAdminService.updateAccessGrant(grantId, { is_active: false }),
    onSuccess: () => {
      toast.success('Access grant deactivated')
      invalidate()
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Access grant was not deactivated')),
  })

  // R12.5: never render global grant tooling to an actor without the capability.
  if (!canManage) {
    return null
  }

  const grants = grantsQuery.data || []

  return (
    <SectionCard
      title="Access grants"
      description="Scoped, audited exceptions that extend a user's access beyond their default memberships."
      icon={<KeyRound className="h-5 w-5" />}
    >
      {grantsQuery.isError ? (
        <PanelStateError
          error={grantsQuery.error}
          onRetry={() => grantsQuery.refetch()}
          fallback="Could not load access grants."
        />
      ) : (
        <>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              const userId = resolveUserId()
              if (!userId) {
                toast.error('Search for and select a user by email')
                return
              }
              if (form.scope_type === 'program_offering' && !form.program_id.trim()) {
                toast.error('Select a program offering')
                return
              }
              if (form.scope_type === 'application' && !form.application_id.trim()) {
                toast.error('Application ID is required')
                return
              }
              createMutation.mutate(userId)
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Input
                  value={form.user_search}
                  onChange={(event) =>
                    setForm((prev) => {
                      const nextSearch = event.target.value
                      // Resolve the id when the typed value exactly matches a
                      // candidate email; otherwise clear the resolved id.
                      const match = (candidatesQuery.data || []).find(
                        (candidate) => candidate.email.toLowerCase() === nextSearch.trim().toLowerCase(),
                      )
                      return { ...prev, user_search: nextSearch, user_id: match ? match.id : '' }
                    })
                  }
                  placeholder="Search a user by email or name"
                  aria-label="Grant user search"
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  list="tenant-grant-candidates"
                />
                {/* Accessible search selector (TEN-05): existing identities that
                    match the typed email/name — no raw user UUID is pasted. */}
                <datalist id="tenant-grant-candidates">
                  {candidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.email}>
                      {candidate.full_name} · {candidate.role || 'user'}
                    </option>
                  ))}
                </datalist>
              </div>
              <select
                value={form.scope_type}
                onChange={(event) => setForm((prev) => ({ ...prev, scope_type: event.target.value }))}
                className={TENANT_SELECT_CLASS}
                aria-label="Grant scope type"
              >
                <option value="institution">Institution</option>
                <option value="program_offering">Program offering</option>
                <option value="application">Application</option>
              </select>
              {form.scope_type === 'program_offering' && (
                <select
                  value={form.program_id}
                  onChange={(event) => setForm((prev) => ({ ...prev, program_id: event.target.value }))}
                  className={TENANT_SELECT_CLASS}
                  aria-label="Grant program offering"
                  disabled={offeringsQuery.isLoading}
                >
                  <option value="">Select an offering…</option>
                  {offerings.map((offering) => (
                    <option key={offering.id} value={offering.id}>
                      {offering.name}
                    </option>
                  ))}
                </select>
              )}
              {/*
                The application-scoped grant's selector (task 11.4, TEN-05).

                Task 4.3 replaced this panel's user and offering UUID fields with
                scoped selectors and left this one field as raw entry, recording
                why: "a scoped application search selector is owned by the
                admin-applications work in Phase 9". Phase 9 built it — task 9.1's
                roster contract takes a `search` and an `institution_id` and
                resolves both against the actor's scope on the **server** before
                either reaches a query, so an out-of-scope identifier is a 404
                rather than a confirming empty list. That is the search this
                selector uses, scoped to the school this panel is on.
              */}
              {form.scope_type === 'application' && (
                <select
                  value={form.application_id}
                  onChange={(event) => setForm((prev) => ({ ...prev, application_id: event.target.value }))}
                  className={TENANT_SELECT_CLASS}
                  aria-label="Grant application"
                  disabled={applicationsQuery.isLoading}
                >
                  <option value="">Select an application…</option>
                  {applications.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.application_number ?? row.id} · {row.full_name ?? 'Unnamed applicant'} · {row.program_name}
                    </option>
                  ))}
                </select>
              )}
              <Input
                value={form.expires_at}
                onChange={(event) => setForm((prev) => ({ ...prev, expires_at: event.target.value }))}
                placeholder="Expires at, optional"
                aria-label="Grant expiry"
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" loading={createMutation.isPending}>
                <KeyRound className="h-4 w-4" aria-hidden="true" /> Add grant
              </Button>
            </div>
          </form>
          <ResourceList
            empty="No scoped grants configured."
            deactivatingId={deactivateMutation.isPending ? deactivateMutation.variables ?? null : null}
            onDeactivate={(id) => deactivateMutation.mutate(id)}
            items={grants.map((item) => ({
              id: item.id,
              title: item.user_id,
              meta: `${item.scope_type}${item.expires_at ? ` · expires ${item.expires_at}` : ''}`,
              active: item.is_active !== false,
            }))}
          />
        </>
      )}
    </SectionCard>
  )
}
