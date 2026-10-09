/**
 * TenantStaffPanel (admissions-v2 task 4.2 — atomic staff invitation handoff).
 *
 * Lists a school's staff memberships and pending invitations and (for authorized
 * actors) lets staff be invited **by email** or disabled.
 *
 * What changed vs. the legacy panel (TEN-01 / TEN-05):
 *   - Invitations are created by a single **atomic** server command that creates
 *     the identity + invitation + membership in one transaction and emails a
 *     single-use accept link — the operator never sets or sees a password
 *     (R4.3). The old two-step "create user then create membership" flow (which
 *     could leave an orphan admin) is gone.
 *   - Staff are invited by an accessible **email search selector** backed by
 *     `searchStaffCandidates`, not by pasting a raw profile UUID (R6.3, TEN-05).
 *   - The invitable roles are the canonical `admin` / `reviewer` — the invented
 *     `staff` / `admissions` / `finance` / `viewer` roles are removed (R6.2).
 *
 * Capability gating (R6.3/R6.4) — the backend re-enforces every read and write:
 *   - **Read** when the actor is a Super_Admin or holds `tenant.staff.read`.
 *   - **Invite** when the actor is a Super_Admin (`platform.user.manage_all`) or
 *     holds `tenant.staff.invite` for the institution.
 *   - **Disable/revoke** when the actor is a Super_Admin or holds
 *     `tenant.staff.disable` for the institution.
 *
 * Mutation controls are removed (not just disabled) when the capability is
 * absent. On a backend 403 the panel renders a precise authorization message
 * and no tenant data (R12.7).
 */
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Mail, Users } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { SectionCard, StatusBadge } from '@/components/ui'
import { useCapabilities } from '@/contexts/CapabilityContext'
import { toast } from '@/hooks/useToast'
import { tenantAdminService, type TenantStaffInvitation } from '@/services/admin/tenants'

import { tenantErrorMessage } from './errors'
import { PanelNoAccess, PanelStateError } from './panelStates'
import { ResourceList, TENANT_SELECT_CLASS } from './primitives'

// Canonical invitable staff roles only (R6.2). No invented role vocabulary.
const INVITABLE_ROLES = [
  { value: 'admin', label: 'Tenant admin' },
  { value: 'reviewer', label: 'Reviewer' },
] as const

// Tenant-admin memberships confer the granted-mutation bundle; a reviewer gets
// the read bundle only. These map onto the backend `tenant.*` capabilities.
const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ['manage', 'review', 'verify_documents', 'verify_payments', 'export'],
  reviewer: ['review'],
}

function invitationTone(status: string): 'success' | 'warning' | 'muted' | 'info' {
  if (status === 'accepted') return 'success'
  if (status === 'pending') return 'info'
  if (status === 'expired') return 'warning'
  return 'muted'
}

export function TenantStaffPanel({ institutionId }: { institutionId: string }) {
  const queryClient = useQueryClient()
  const { isSuperAdmin, can, canForInstitution } = useCapabilities()

  const canRead = isSuperAdmin || canForInstitution(institutionId, 'tenant.staff.read')
  const canInvite = isSuperAdmin ? can('platform.user.manage_all') : canForInstitution(institutionId, 'tenant.staff.invite')
  const canDisable = isSuperAdmin ? can('platform.user.manage_all') : canForInstitution(institutionId, 'tenant.staff.disable')

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<string>('admin')
  // Debounced query used to power the accessible email/name search selector.
  const [candidateQuery, setCandidateQuery] = useState('')

  useEffect(() => {
    const handle = setTimeout(() => setCandidateQuery(email.trim()), 250)
    return () => clearTimeout(handle)
  }, [email])

  const membershipsQuery = useQuery({
    queryKey: ['admin', 'tenants', 'memberships', institutionId],
    queryFn: () => tenantAdminService.listMemberships(institutionId),
    enabled: Boolean(institutionId) && canRead,
  })

  const invitationsQuery = useQuery({
    queryKey: ['admin', 'tenants', 'staff-invitations', institutionId],
    queryFn: () => tenantAdminService.listStaffInvitations(institutionId),
    enabled: Boolean(institutionId) && canRead,
  })

  // Search selector data (R6.3, TEN-05): existing identities matching the typed
  // email/name, so the operator picks a real identity instead of a raw UUID.
  const candidatesQuery = useQuery({
    queryKey: ['admin', 'tenants', 'staff-candidates', institutionId, candidateQuery],
    queryFn: () => tenantAdminService.searchStaffCandidates(candidateQuery, institutionId),
    enabled: Boolean(institutionId) && canInvite && candidateQuery.length >= 2,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] })
  }

  const inviteMutation = useMutation({
    mutationFn: () =>
      tenantAdminService.inviteStaff({
        institution_id: institutionId,
        email: email.trim(),
        role,
        permissions: ROLE_PERMISSIONS[role] ?? ['review'],
      }),
    onSuccess: () => {
      toast.success('Invitation sent — the staff member will set their own password via email')
      setEmail('')
      setRole('admin')
      invalidate()
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Invitation was not sent')),
  })

  const resendMutation = useMutation({
    mutationFn: (invitationId: string) => tenantAdminService.resendStaffInvitation(invitationId),
    onSuccess: () => {
      toast.success('Invitation resent')
      invalidate()
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Invitation was not resent')),
  })

  const revokeMutation = useMutation({
    mutationFn: (invitationId: string) => tenantAdminService.revokeStaffInvitation(invitationId),
    onSuccess: () => {
      toast.success('Invitation revoked')
      invalidate()
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Invitation was not revoked')),
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
  const invitations = (invitationsQuery.data || []) as TenantStaffInvitation[]
  const candidates = candidatesQuery.data || []
  const pendingInvitations = invitations.filter((i) => i.status === 'pending' || i.status === 'expired')

  return (
    <SectionCard
      title="Staff access"
      description="Invite staff by email; they set their own password via a secure link. Memberships grant access to this school's admissions workspace only."
      icon={<Users className="h-5 w-5" />}
    >
      {membershipsQuery.isError ? (
        <PanelStateError
          error={membershipsQuery.error}
          onRetry={() => membershipsQuery.refetch()}
          fallback="Could not load this school's staff memberships."
        />
      ) : (
        <div className="space-y-6">
          {canInvite && (
            <form
              className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto]"
              onSubmit={(event) => {
                event.preventDefault()
                if (!email.trim()) {
                  toast.error('An email address is required')
                  return
                }
                inviteMutation.mutate()
              }}
            >
              <div>
                <Input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Search or type an email"
                  aria-label="Staff email"
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  list="tenant-staff-candidates"
                />
                {/* Accessible search selector (R6.3): existing identities that
                    match the typed email/name, so no raw UUID is ever pasted. */}
                <datalist id="tenant-staff-candidates">
                  {candidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.email}>
                      {candidate.full_name} · {candidate.role || 'user'}
                    </option>
                  ))}
                </datalist>
              </div>
              <select
                value={role}
                onChange={(event) => setRole(event.target.value)}
                className={TENANT_SELECT_CLASS}
                aria-label="Staff role"
              >
                {INVITABLE_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <Button type="submit" loading={inviteMutation.isPending}>
                <Mail className="h-4 w-4" aria-hidden="true" /> Invite
              </Button>
            </form>
          )}

          {/* Pending / expired invitations with resend + revoke. */}
          {pendingInvitations.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Pending invitations</p>
              {pendingInvitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium text-foreground">{invitation.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {invitation.invited_role}
                      {invitation.resend_count ? ` · resent ${invitation.resend_count}×` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge tone={invitationTone(invitation.status)} label={invitation.status} />
                    {canInvite && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        loading={resendMutation.isPending && resendMutation.variables === invitation.id}
                        onClick={() => resendMutation.mutate(invitation.id)}
                      >
                        Resend
                      </Button>
                    )}
                    {canDisable && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        loading={revokeMutation.isPending && revokeMutation.variables === invitation.id}
                        onClick={() => revokeMutation.mutate(invitation.id)}
                      >
                        Revoke
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Active/inactive staff memberships. */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Staff memberships</p>
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
          </div>
        </div>
      )}
    </SectionCard>
  )
}
