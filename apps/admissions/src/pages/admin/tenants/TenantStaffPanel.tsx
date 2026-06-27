/**
 * TenantStaffPanel (enterprise-tenant-authority, task 13.2).
 *
 * Lists a school's staff memberships and (for authorized actors) lets staff be
 * invited or disabled.
 *
 * Capability gating (R12.6) — the backend re-enforces every read and write, and
 * a Tenant_Admin invite is additionally scope-and-role-ceiling checked server
 * side (R6.3, R6.4):
 *   - **Read** when the actor is a Super_Admin or holds `tenant.staff.read`.
 *   - **Invite** when the actor is a Super_Admin (`platform.user.manage_all`) or
 *     holds `tenant.staff.invite` for the institution.
 *   - **Disable** when the actor is a Super_Admin (`platform.user.manage_all`) or
 *     holds `tenant.staff.disable` for the institution.
 *
 * Mutation controls are removed (not just disabled) when the capability is
 * absent. On a backend 403 the panel renders a precise authorization message
 * and no tenant data (R12.7).
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Users } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { SectionCard } from '@/components/ui'
import { useCapabilities } from '@/contexts/CapabilityContext'
import { toast } from '@/hooks/useToast'
import { tenantAdminService } from '@/services/admin/tenants'

import { tenantErrorMessage } from './errors'
import { PanelNoAccess, PanelStateError } from './panelStates'
import { ResourceList, TENANT_SELECT_CLASS } from './primitives'

interface MembershipFormState {
  user_id: string
  role: string
}

const emptyForm: MembershipFormState = { user_id: '', role: 'staff' }

export function TenantStaffPanel({ institutionId }: { institutionId: string }) {
  const queryClient = useQueryClient()
  const { isSuperAdmin, can, canForInstitution } = useCapabilities()

  const canRead = isSuperAdmin || canForInstitution(institutionId, 'tenant.staff.read')
  const canInvite = isSuperAdmin ? can('platform.user.manage_all') : canForInstitution(institutionId, 'tenant.staff.invite')
  const canDisable = isSuperAdmin ? can('platform.user.manage_all') : canForInstitution(institutionId, 'tenant.staff.disable')

  const [form, setForm] = useState<MembershipFormState>(emptyForm)

  const membershipsQuery = useQuery({
    queryKey: ['admin', 'tenants', 'memberships', institutionId],
    queryFn: () => tenantAdminService.listMemberships(institutionId),
    enabled: Boolean(institutionId) && canRead,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] })
  }

  const inviteMutation = useMutation({
    mutationFn: () =>
      tenantAdminService.createMembership({
        institution_id: institutionId,
        user_id: form.user_id.trim(),
        role: form.role,
        is_active: true,
      }),
    onSuccess: () => {
      toast.success('Staff membership added')
      setForm(emptyForm)
      invalidate()
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Staff membership was not added')),
  })

  const disableMutation = useMutation({
    mutationFn: (membershipId: string) => tenantAdminService.updateMembership(membershipId, { is_active: false }),
    onSuccess: () => {
      toast.success('Membership deactivated')
      invalidate()
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Membership was not deactivated')),
  })

  if (!canRead) {
    return (
      <SectionCard title="Staff access" description="Staff memberships for this school." icon={<Users className="h-5 w-5" />}>
        <PanelNoAccess />
      </SectionCard>
    )
  }

  const memberships = membershipsQuery.data || []

  return (
    <SectionCard
      title="Staff access"
      description="Memberships grant routine access to this school's admissions workspace."
      icon={<Users className="h-5 w-5" />}
    >
      {membershipsQuery.isError ? (
        <PanelStateError
          error={membershipsQuery.error}
          onRetry={() => membershipsQuery.refetch()}
          fallback="Could not load this school's staff memberships."
        />
      ) : (
        <>
          {canInvite && (
            <form
              className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto]"
              onSubmit={(event) => {
                event.preventDefault()
                if (!form.user_id.trim()) {
                  toast.error('User ID is required')
                  return
                }
                inviteMutation.mutate()
              }}
            >
              <Input
                value={form.user_id}
                onChange={(event) => setForm((prev) => ({ ...prev, user_id: event.target.value }))}
                placeholder="User/Profile ID"
                aria-label="Membership user ID"
              />
              <select
                value={form.role}
                onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}
                className={TENANT_SELECT_CLASS}
                aria-label="Membership role"
              >
                <option value="staff">Staff</option>
                <option value="admissions">Admissions</option>
                <option value="finance">Finance</option>
                <option value="viewer">Viewer</option>
              </select>
              <Button type="submit" loading={inviteMutation.isPending}>
                <Users className="h-4 w-4" aria-hidden="true" /> Invite
              </Button>
            </form>
          )}
          <ResourceList
            empty="No staff memberships configured."
            deactivatingId={disableMutation.isPending ? disableMutation.variables ?? null : null}
            onDeactivate={canDisable ? (id) => disableMutation.mutate(id) : undefined}
            items={memberships.map((item) => ({
              id: item.id,
              title: item.user_id,
              meta: `${item.role}${item.is_active === false ? ' · inactive' : ''}`,
              active: item.is_active !== false,
            }))}
          />
        </>
      )}
    </SectionCard>
  )
}
