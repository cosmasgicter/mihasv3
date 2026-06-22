/**
 * TenantAccessGrantsPanel (enterprise-tenant-authority, task 13.2).
 *
 * Scoped access grants are an explicit, audited exception that extends an
 * actor's access beyond their default memberships. This global access-grant
 * tooling is **Super_Admin / explicitly-granted only** (R12.5): it renders only
 * when the actor holds the platform `platform.access_grant.manage` capability.
 * A Tenant_Admin without that grant never sees this panel at all (it renders
 * nothing), so no grant tooling or data is exposed.
 *
 * On a backend 403 the panel renders a precise authorization message and no
 * tenant data (R12.7). The backend re-enforces every read and write.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { SectionCard } from '@/components/ui'
import { useCapabilities } from '@/contexts/CapabilityContext'
import { toast } from '@/hooks/useToast'
import { tenantAdminService } from '@/services/admin/tenants'

import { tenantErrorMessage } from './errors'
import { PanelStateError } from './panelStates'
import { ResourceList, TENANT_SELECT_CLASS } from './primitives'

interface GrantFormState {
  user_id: string
  scope_type: string
  program_id: string
  application_id: string
  expires_at: string
}

const emptyForm: GrantFormState = {
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

  const grantsQuery = useQuery({
    queryKey: ['admin', 'tenants', 'grants', institutionId],
    queryFn: () => tenantAdminService.listAccessGrants({ institutionId }),
    enabled: Boolean(institutionId) && canManage,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] })
  }

  const createMutation = useMutation({
    mutationFn: () =>
      tenantAdminService.createAccessGrant({
        user_id: form.user_id.trim(),
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
              if (!form.user_id.trim()) {
                toast.error('User ID is required')
                return
              }
              if (form.scope_type === 'program_offering' && !form.program_id.trim()) {
                toast.error('Program offering ID is required')
                return
              }
              if (form.scope_type === 'application' && !form.application_id.trim()) {
                toast.error('Application ID is required')
                return
              }
              createMutation.mutate()
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                value={form.user_id}
                onChange={(event) => setForm((prev) => ({ ...prev, user_id: event.target.value }))}
                placeholder="User/Profile ID"
                aria-label="Grant user ID"
              />
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
                <Input
                  value={form.program_id}
                  onChange={(event) => setForm((prev) => ({ ...prev, program_id: event.target.value }))}
                  placeholder="Program offering ID"
                  aria-label="Grant program offering ID"
                />
              )}
              {form.scope_type === 'application' && (
                <Input
                  value={form.application_id}
                  onChange={(event) => setForm((prev) => ({ ...prev, application_id: event.target.value }))}
                  placeholder="Application ID"
                  aria-label="Grant application ID"
                />
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
