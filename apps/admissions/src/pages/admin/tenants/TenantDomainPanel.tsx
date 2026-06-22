/**
 * TenantDomainPanel (enterprise-tenant-authority, task 13.2).
 *
 * Lists the white-label hostnames that resolve to a school and (for authorized
 * actors) lets them be added or deactivated.
 *
 * Capability gating (R12.6) — the backend re-enforces every read and write:
 *   - **Read** when the actor is a Super_Admin or holds `tenant.domain.read`.
 *   - **Manage** (add / deactivate) only when the actor holds the platform
 *     `platform.domain.manage` capability. Domain creation and activation are
 *     Super_Admin-only (R7.14), so a Tenant_Admin gets a read-only view; a
 *     Tenant_Admin holding `tenant.domain.request_change` sees a note that
 *     domain changes are requested through their platform administrator.
 *
 * On a backend 403 the panel renders a precise authorization message and no
 * tenant data (R12.7).
 */
import { FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Globe2, Info } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { SectionCard } from '@/components/ui'
import { useCapabilities } from '@/contexts/CapabilityContext'
import { toast } from '@/hooks/useToast'
import { tenantAdminService } from '@/services/admin/tenants'

import { tenantErrorMessage } from './errors'
import { PanelNoAccess, PanelStateError } from './panelStates'

export function TenantDomainPanel({ institutionId }: { institutionId: string }) {
  const queryClient = useQueryClient()
  const { isSuperAdmin, can, canForInstitution } = useCapabilities()

  const canRead = isSuperAdmin || canForInstitution(institutionId, 'tenant.domain.read')
  const canManage = isSuperAdmin && can('platform.domain.manage')
  const canRequest = !isSuperAdmin && canForInstitution(institutionId, 'tenant.domain.request_change')

  const [hostname, setHostname] = useState('')

  const domainsQuery = useQuery({
    queryKey: ['admin', 'tenants', 'domains', institutionId],
    queryFn: () => tenantAdminService.listDomains(institutionId),
    enabled: Boolean(institutionId) && canRead,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] })
  }

  const createMutation = useMutation({
    mutationFn: (host: string) => tenantAdminService.createDomain(institutionId, { hostname: host, is_active: true }),
    onSuccess: () => {
      toast.success('Domain added')
      setHostname('')
      invalidate()
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Domain was not added')),
  })

  const deactivateMutation = useMutation({
    mutationFn: (domainId: string) => tenantAdminService.updateDomain(institutionId, domainId, { is_active: false }),
    onSuccess: () => {
      toast.success('Domain deactivated')
      invalidate()
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Domain was not deactivated')),
  })

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!hostname.trim()) return
    createMutation.mutate(hostname.trim())
  }

  if (!canRead) {
    return (
      <SectionCard title="Domains" description="White-label hostnames for this school." icon={<Globe2 className="h-5 w-5" />}>
        <PanelNoAccess />
      </SectionCard>
    )
  }

  const domains = domainsQuery.data || []

  return (
    <SectionCard
      title="Domains"
      description="White-label hostnames that resolve to this school."
      icon={<Globe2 className="h-5 w-5" />}
    >
      {domainsQuery.isError ? (
        <PanelStateError
          error={domainsQuery.error}
          onRetry={() => domainsQuery.refetch()}
          fallback="Could not load this school's domains."
        />
      ) : (
        <div className="space-y-4">
          {canManage && (
            <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleSubmit}>
              <Input
                value={hostname}
                onChange={(event) => setHostname(event.target.value)}
                placeholder="apply.school.edu.zm"
                aria-label="Domain hostname"
              />
              <Button type="submit" loading={createMutation.isPending}>Add domain</Button>
            </form>
          )}

          {canRequest && (
            <p className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Domain changes for your school are requested through your platform administrator. This view is read-only.
            </p>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            {domains.map((domain) => (
              <div key={domain.id} className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium text-foreground">{domain.hostname}</p>
                    <p className="text-xs text-muted-foreground">
                      {domain.is_primary ? 'Primary' : 'Secondary'} · {domain.is_active === false ? 'Inactive' : 'Active'}
                    </p>
                  </div>
                  {canManage && domain.is_active !== false && (
                    <Button type="button" size="xs" variant="outline" onClick={() => deactivateMutation.mutate(domain.id)}>
                      Deactivate
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {domains.length === 0 && <p className="text-sm text-muted-foreground">No white-label domains configured.</p>}
          </div>
        </div>
      )}
    </SectionCard>
  )
}
