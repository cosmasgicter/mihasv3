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
import { Check, CircleDashed, Globe2, RotateCcw, ShieldCheck, X } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { SectionCard, StatusBadge } from '@/components/ui'
import { useCapabilities } from '@/contexts/CapabilityContext'
import { toast } from '@/hooks/useToast'
import { tenantAdminService } from '@/services/admin/tenants'

import { tenantErrorMessage } from './errors'
import { PanelNoAccess, PanelReadOnlyNotice, PanelStateError } from './panelStates'
import { domainStatusLabel, domainStatusTone } from './domainStatus'

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
      toast.success('Domain added: publish the DNS records to verify it')
      setHostname('')
      invalidate()
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Domain was not added')),
  })

  const activateMutation = useMutation({
    mutationFn: (domainId: string) => tenantAdminService.activateDomain(institutionId, domainId),
    onSuccess: () => {
      toast.success('Domain activated')
      invalidate()
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Domain was not activated')),
  })

  const deactivateMutation = useMutation({
    mutationFn: (domainId: string) => tenantAdminService.updateDomain(institutionId, domainId, { is_active: false }),
    onSuccess: () => {
      toast.success('Domain deactivated')
      invalidate()
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Domain was not deactivated')),
  })

  const retryMutation = useMutation({
    mutationFn: (domainId: string) => tenantAdminService.retryDomain(institutionId, domainId),
    onSuccess: () => {
      toast.success('Verification restarted: publish the DNS records if you have not already')
      invalidate()
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Verification could not be restarted')),
  })

  const approveMutation = useMutation({
    mutationFn: (domainId: string) => tenantAdminService.approveDomain(institutionId, domainId),
    onSuccess: () => {
      toast.success('Domain approved: activate it to start routing')
      invalidate()
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Domain was not approved')),
  })

  const rejectMutation = useMutation({
    mutationFn: (domainId: string) => tenantAdminService.rejectDomain(institutionId, domainId),
    onSuccess: () => {
      toast.success('Domain rejected')
      invalidate()
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Domain was not rejected')),
  })

  const reactivateMutation = useMutation({
    mutationFn: (domainId: string) => tenantAdminService.reactivateDomain(institutionId, domainId),
    onSuccess: () => {
      toast.success('Domain reactivated')
      invalidate()
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Domain was not reactivated')),
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
            <PanelReadOnlyNotice description="Domain changes for your school are requested through your platform administrator. This view is read-only." />
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            {domains.map((domain) => (
              <div key={domain.id} className="rounded-lg bg-muted p-3">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="break-words text-sm font-medium text-foreground">{domain.hostname}</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <StatusBadge tone={domainStatusTone(domain.status)} label={domainStatusLabel(domain.status)} />
                        <span>{domain.is_primary ? 'Primary' : 'Secondary'}</span>
                        {domain.is_active === false && <span>Inactive row</span>}
                      </div>
                    </div>
                    {domain.status === 'active' ? (
                      <span className="flex items-center gap-1 text-sm text-success">
                        <Check className="h-4 w-4" aria-hidden="true" /> Routing
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-sm text-muted-foreground">
                        <CircleDashed className="h-4 w-4" aria-hidden="true" /> Not routing
                      </span>
                    )}
                  </div>

                  {domain.status === 'pending_dns' && (domain.dns_target || domain.verification_token) && (
                    <div className="space-y-1 rounded-md border border-border/70 bg-muted/30 p-2 text-xs">
                      {domain.dns_target && (
                        <p className="break-all">
                          <span className="font-medium text-foreground">CNAME:</span> {domain.hostname} → {domain.dns_target}
                        </p>
                      )}
                      {domain.verification_token && (
                        <p className="break-all">
                          <span className="font-medium text-foreground">TXT:</span> _beanola-verify.{domain.hostname} = {domain.verification_token}
                        </p>
                      )}
                    </div>
                  )}

                  {domain.last_error && (
                    <p className="rounded-md border border-warning/25 bg-warning/5 p-2 text-xs text-foreground" role="alert">
                      {domain.last_error}
                    </p>
                  )}

                  {canManage && (
                    <div className="flex flex-wrap gap-2">
                      {/* Each control maps to exactly one allowed DomainStatusMachine
                          edge, so the panel and the backend lifecycle never diverge (R5.1). */}
                      {(domain.status === 'pending_dns' ||
                        domain.status === 'failed' ||
                        domain.status === 'rejected') && (
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          loading={retryMutation.isPending && retryMutation.variables === domain.id}
                          onClick={() => retryMutation.mutate(domain.id)}
                        >
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                          Re-run verification
                        </Button>
                      )}
                      {domain.status === 'pending_review' && (
                        <>
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            loading={approveMutation.isPending && approveMutation.variables === domain.id}
                            onClick={() => approveMutation.mutate(domain.id)}
                          >
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            Approve
                          </Button>
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            loading={rejectMutation.isPending && rejectMutation.variables === domain.id}
                            onClick={() => rejectMutation.mutate(domain.id)}
                          >
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                            Reject
                          </Button>
                        </>
                      )}
                      {domain.status === 'verified' && (
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          loading={activateMutation.isPending && activateMutation.variables === domain.id}
                          onClick={() => activateMutation.mutate(domain.id)}
                        >
                          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                          Activate
                        </Button>
                      )}
                      {domain.status === 'active' && (
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          loading={deactivateMutation.isPending && deactivateMutation.variables === domain.id}
                          onClick={() => deactivateMutation.mutate(domain.id)}
                        >
                          Deactivate
                        </Button>
                      )}
                      {domain.status === 'disabled' && (
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          loading={reactivateMutation.isPending && reactivateMutation.variables === domain.id}
                          onClick={() => reactivateMutation.mutate(domain.id)}
                        >
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                          Reactivate
                        </Button>
                      )}
                    </div>
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
