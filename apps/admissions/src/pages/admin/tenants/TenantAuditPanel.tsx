/**
 * TenantAuditPanel (enterprise-tenant-authority, task 13.2).
 *
 * Authority-gated wrapper around the existing `AuditPanel` audit reader.
 *
 * Capability gating (R12.6) — the backend re-enforces and additionally scopes a
 * Tenant_Admin's audit reads to their own institution (R10.8):
 *   - **Read** when the actor is a Super_Admin (`platform.audit.read_all`) or
 *     holds `tenant.audit.read` for the institution.
 *
 * The wrapped `AuditPanel` already renders a precise authorization message and
 * no tenant data on a backend 403 (R12.7).
 */
import { History } from 'lucide-react'

import { SectionCard } from '@/components/ui'
import { useCapabilities } from '@/contexts/CapabilityContext'

import { AuditPanel } from './AuditPanel'
import { PanelNoAccess } from './panelStates'

export function TenantAuditPanel({ institutionId }: { institutionId: string }) {
  const { isSuperAdmin, can, canForInstitution } = useCapabilities()

  const canRead =
    (isSuperAdmin && can('platform.audit.read_all')) || canForInstitution(institutionId, 'tenant.audit.read')

  if (!canRead) {
    return (
      <SectionCard title="Configuration audit" description="Recent tenant configuration changes." icon={<History className="h-5 w-5" />}>
        <PanelNoAccess />
      </SectionCard>
    )
  }

  return <AuditPanel institutionId={institutionId} />
}
