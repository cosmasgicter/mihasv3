/**
 * TenantProgramsPanel (enterprise-tenant-authority, task 13.2).
 *
 * The authority-specific surface for a school's program offerings.
 *
 * Capability gating (R12.6) — the backend re-enforces every read and write:
 *   - **Read** when the actor is a Super_Admin or holds `tenant.program.read`.
 *   - **Manage** (assign canonical programs / edit routing rules) only for a
 *     Super_Admin with `platform.program_assignment.manage`. Canonical-program
 *     assignment is platform-only (R8.8), so a Tenant_Admin can only *request*
 *     offering changes (`tenant.program.request_change`) — surfaced here as a
 *     read-only listing with a note, since direct mutation is not theirs to make.
 *
 * When the actor can manage, this composes the existing `OfferingsPanel` (the
 * routing-rule builder) unchanged. On a backend 403 the read-only path renders
 * a precise authorization message and no tenant data (R12.7).
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { GraduationCap } from 'lucide-react'

import { SectionCard, StatusBadge } from '@/components/ui'
import { EmptyState } from '@/components/ui/EmptyState'
import { useCapabilities } from '@/contexts/CapabilityContext'
import { tenantAdminService } from '@/services/admin/tenants'

import { OfferingsPanel } from './OfferingsPanel'
import { PanelNoAccess, PanelReadOnlyNotice, PanelStateError } from './panelStates'

export function TenantProgramsPanel({ institutionId }: { institutionId: string }) {
  const { isSuperAdmin, can, canForInstitution } = useCapabilities()

  const canRead = isSuperAdmin || canForInstitution(institutionId, 'tenant.program.read')
  const canManage = isSuperAdmin && can('platform.program_assignment.manage')
  const canRequest = !isSuperAdmin && canForInstitution(institutionId, 'tenant.program.request_change')

  // Super-admin management path reuses the full routing-rule builder unchanged.
  if (canManage) {
    return <OfferingsPanel institutionId={institutionId} />
  }

  if (!canRead) {
    return (
      <SectionCard title="Program offerings" description="Programs this school offers." icon={<GraduationCap className="h-5 w-5" />}>
        <PanelNoAccess />
      </SectionCard>
    )
  }

  return <ReadOnlyOfferings institutionId={institutionId} canRequest={canRequest} />
}

function ReadOnlyOfferings({ institutionId, canRequest }: { institutionId: string; canRequest: boolean }) {
  const offeringsQuery = useQuery({
    queryKey: ['admin', 'tenants', 'offerings', institutionId],
    queryFn: () => tenantAdminService.listOfferings(institutionId),
    enabled: Boolean(institutionId),
  })

  const offerings = useMemo(
    () => [...(offeringsQuery.data || [])].sort((a, b) => a.name.localeCompare(b.name)),
    [offeringsQuery.data],
  )

  return (
    <SectionCard
      title="Program offerings"
      description="Programs your school offers. Canonical programs are assigned by your platform administrator."
      icon={<GraduationCap className="h-5 w-5" />}
    >
      {offeringsQuery.isError ? (
        <PanelStateError
          error={offeringsQuery.error}
          onRetry={() => offeringsQuery.refetch()}
          fallback="Could not load this school's program offerings."
        />
      ) : !offeringsQuery.isLoading && offerings.length === 0 ? (
        <EmptyState
          icon={<GraduationCap />}
          heading="No offerings yet"
          description="Your school has no program offerings yet. Contact your platform administrator to have canonical programs assigned."
        />
      ) : (
        <div className="space-y-3">
          {canRequest ? (
            <PanelReadOnlyNotice description="Offering changes for your school are requested through your platform administrator. This view is read-only." />
          ) : (
            <PanelReadOnlyNotice description="Program assignment changes are managed by your platform administrator. This view is read-only." />
          )}
          <ul className="space-y-2">
            {offerings.map((offering) => {
              const archived = (offering.offering_status || 'active') === 'archived'
              return (
                <li key={offering.id} className="rounded-lg border border-border bg-background p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{offering.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{offering.code}</p>
                    </div>
                    <StatusBadge tone={archived ? 'muted' : 'success'} label={offering.offering_status || 'active'} />
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </SectionCard>
  )
}
