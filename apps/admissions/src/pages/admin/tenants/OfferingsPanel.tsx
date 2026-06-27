import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GraduationCap, Layers, ListChecks, SlidersHorizontal } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { SectionCard, StatusBadge } from '@/components/ui'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { toast } from '@/hooks/useToast'
import {
  tenantAdminService,
  type TenantOffering,
  type TenantOfferingRules,
} from '@/services/admin/tenants'
import { tenantErrorMessage } from './errors'
import { TENANT_SELECT_CLASS, TokenChips } from './primitives'

interface RuleDraft {
  assignment_priority: string
  offering_status: string
  allowed_countries: string[]
  blocked_countries: string[]
}

const OFFERING_STATUSES = ['active', 'paused', 'archived']

function offeringToDraft(offering: TenantOffering): RuleDraft {
  const rules = (offering.assignment_rules || {}) as TenantOfferingRules
  return {
    assignment_priority: offering.assignment_priority == null ? '' : String(offering.assignment_priority),
    offering_status: offering.offering_status || 'active',
    allowed_countries: Array.isArray(rules.allowed_countries) ? rules.allowed_countries.map(String) : [],
    blocked_countries: Array.isArray(rules.blocked_countries) ? rules.blocked_countries.map(String) : [],
  }
}

/**
 * Structured assignment-rule builder for a school's program offerings (R11.7).
 *
 * Replaces raw JSON entry with: a priority number field, an offering-status
 * selector, and allowlist/denylist country chip builders. Persists to the
 * tenant-scoped admin offering endpoint via `updateOfferingRules`.
 */
export function OfferingsPanel({ institutionId }: { institutionId: string }) {
  const queryClient = useQueryClient()
  const [selectedOfferingId, setSelectedOfferingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<RuleDraft | null>(null)

  const offeringsQuery = useQuery({
    queryKey: ['admin', 'tenants', 'offerings', institutionId],
    queryFn: () => tenantAdminService.listOfferings(institutionId),
    enabled: Boolean(institutionId),
  })

  const offerings = useMemo(
    () => [...(offeringsQuery.data || [])].sort((a, b) => a.name.localeCompare(b.name)),
    [offeringsQuery.data]
  )
  const selectedOffering = offerings.find(item => item.id === selectedOfferingId) || null

  useEffect(() => {
    if (!selectedOfferingId && offerings.length > 0) {
      setSelectedOfferingId(offerings[0]!.id)
    }
  }, [offerings, selectedOfferingId])

  useEffect(() => {
    if (selectedOffering) {
      setDraft(offeringToDraft(selectedOffering))
    } else {
      setDraft(null)
    }
  }, [selectedOffering])

  const saveMutation = useMutation({
    mutationFn: ({ offeringId, payload }: { offeringId: string; payload: Parameters<typeof tenantAdminService.updateOfferingRules>[2] }) =>
      tenantAdminService.updateOfferingRules(institutionId, offeringId, payload),
    onSuccess: () => {
      toast.success('Routing rules saved')
      queryClient.invalidateQueries({ queryKey: ['admin', 'tenants', 'offerings', institutionId] })
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Routing rules were not saved')),
  })

  if (offeringsQuery.isError) {
    return (
      <SectionCard
        title="Offerings & assignment rules"
        description="Program offerings and the routing rules that assign applicants to this school."
        icon={<GraduationCap className="h-5 w-5" />}
      >
        <ErrorDisplay message="Could not load this school's offerings." onRetry={() => offeringsQuery.refetch()} />
      </SectionCard>
    )
  }

  if (!offeringsQuery.isLoading && offerings.length === 0) {
    return (
      <SectionCard
        title="Offerings & assignment rules"
        description="Program offerings and the routing rules that assign applicants to this school."
        icon={<GraduationCap className="h-5 w-5" />}
      >
        <EmptyState
          icon={<Layers />}
          heading="No offerings yet"
          description="This school has no program offerings. Create offerings under Programs, then return to configure their routing rules."
        />
      </SectionCard>
    )
  }

  const handleSave = () => {
    if (!selectedOffering || !draft) return
    const priority = draft.assignment_priority.trim()
    const parsedPriority = priority === '' ? undefined : Number(priority)
    if (parsedPriority !== undefined && (!Number.isFinite(parsedPriority) || parsedPriority < 0)) {
      toast.error('Priority must be a non-negative number')
      return
    }
    const rules: TenantOfferingRules = {
      ...(selectedOffering.assignment_rules || {}),
      allowed_countries: draft.allowed_countries,
      blocked_countries: draft.blocked_countries,
    }
    saveMutation.mutate({
      offeringId: selectedOffering.id,
      payload: {
        ...(parsedPriority !== undefined ? { assignment_priority: parsedPriority } : {}),
        offering_status: draft.offering_status,
        assignment_rules: rules,
      },
    })
  }

  return (
    <SectionCard
      title="Offerings & assignment rules"
      description="Lower priority numbers win during routing. Country rules constrain which applicants this offering accepts."
      icon={<GraduationCap className="h-5 w-5" />}
    >
      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="space-y-2" role="listbox" aria-label="Program offerings">
          {offerings.map(offering => {
            const isSelected = offering.id === selectedOfferingId
            const archived = (offering.offering_status || 'active') === 'archived'
            return (
              <button
                key={offering.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => setSelectedOfferingId(offering.id)}
                className={`min-h-touch w-full rounded-lg border p-3 text-left transition-colors ${
                  isSelected ? 'border-primary bg-primary/5' : 'border-border bg-background hover:border-primary/40'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{offering.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{offering.code}</p>
                  </div>
                  <StatusBadge
                    tone={archived ? 'muted' : 'success'}
                    label={offering.offering_status || 'active'}
                  />
                </div>
              </button>
            )
          })}
        </div>

        {draft && selectedOffering ? (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm">
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                  <SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> Assignment priority
                </span>
                <Input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={draft.assignment_priority}
                  onChange={event => setDraft(prev => prev && { ...prev, assignment_priority: event.target.value })}
                  placeholder="0"
                  aria-label="Assignment priority"
                />
                <span className="text-xs text-muted-foreground">Lower wins. Leave blank to keep the offering default.</span>
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                  <ListChecks className="h-4 w-4" aria-hidden="true" /> Offering status
                </span>
                <select
                  value={draft.offering_status}
                  onChange={event => setDraft(prev => prev && { ...prev, offering_status: event.target.value })}
                  className={TENANT_SELECT_CLASS}
                  aria-label="Offering status"
                >
                  {OFFERING_STATUSES.map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
                <span className="text-xs text-muted-foreground">Archived offerings stay readable but are never newly assigned.</span>
              </label>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <TokenChips
                label="Allowed countries / nationalities"
                values={draft.allowed_countries}
                onChange={next => setDraft(prev => prev && { ...prev, allowed_countries: next })}
                placeholder="e.g. Zambia"
                tone="success"
              />
              <TokenChips
                label="Excluded countries / nationalities"
                values={draft.blocked_countries}
                onChange={next => setDraft(prev => prev && { ...prev, blocked_countries: next })}
                placeholder="e.g. Other"
                tone="destructive"
              />
            </div>

            <div className="flex justify-end">
              <Button type="button" onClick={handleSave} loading={saveMutation.isPending}>
                Save routing rules
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Select an offering to configure its routing rules.</p>
        )}
      </div>
    </SectionCard>
  )
}
