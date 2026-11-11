/**
 * TenantListPanel (enterprise-tenant-authority, task 13.2).
 *
 * The school/tenant selector for the tenant consoles. Authority-aware:
 *   - A Super_Admin sees **all** tenants and the **"Quick create (profile only)"** control (was "New institution", task 30.6)
 *     (R12.2), gated on the `platform.tenant.create` capability.
 *   - A non-super-admin (if this panel is ever rendered for them) sees **only**
 *     the institutions passed in (the backend already scopes the list to their
 *     memberships/grants) and **never** the quick-create control
 *     (R12.3, R12.4).
 *
 * On a backend 403 loading the list it renders a precise authorization message
 * and no tenant data (R12.7). The control visibility here is a usability layer;
 * the backend re-enforces every create.
 */
import { Building2, Plus } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui'
import { useCapabilities } from '@/contexts/CapabilityContext'
import type { TenantInstitution } from '@/services/admin/tenants'

import { PanelStateError } from './panelStates'

interface TenantListPanelProps {
  institutions: TenantInstitution[]
  selectedId: string | null
  onSelect: (id: string) => void
  /** Provided only by the super-admin console; gated by `platform.tenant.create`. */
  onNew?: () => void
  heading?: string
  isError?: boolean
  error?: unknown
  isLoading?: boolean
  onRetry?: () => void
}

export function TenantListPanel({
  institutions,
  selectedId,
  onSelect,
  onNew,
  heading = 'Schools',
  isError,
  error,
  isLoading,
  onRetry,
}: TenantListPanelProps) {
  const { can } = useCapabilities()

  // R12.2 / R12.4: the quick-create control is shown only to an actor with
  // the platform tenant-create capability — never to a tenant-admin.
  const canCreate = Boolean(onNew) && can('platform.tenant.create')

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="min-w-0 text-base font-semibold text-foreground">{heading}</h2>
        {canCreate && (
          /* Secondary: the wizard is the primary path; this opens the blank inline profile form (task 30.6, R17.11). */
          <Button type="button" size="sm" variant="secondary" onClick={onNew}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Quick create (profile only)
          </Button>
        )}
      </div>

      {isError ? (
        // R12.7: no tenant data on a backend 403 — show the authorization message only.
        <PanelStateError error={error} onRetry={onRetry} fallback="Could not load schools." />
      ) : (
        <div className="space-y-2">
          {institutions.map((tenant) => (
            <button
              key={tenant.id}
              type="button"
              onClick={() => onSelect(tenant.id)}
              aria-pressed={selectedId === tenant.id}
              className={`min-h-touch w-full rounded-lg border p-3 text-left transition-colors ${
                selectedId === tenant.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-card hover:border-primary/40'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {/* Wrapped, not truncated: a long school name is not cut off at 390 px (task 30.6, R17.12). */}
                  <p className="break-words text-sm font-semibold text-foreground">{tenant.brand_name || tenant.name}</p>
                  <p className="break-words text-sm text-muted-foreground">{tenant.full_name || tenant.name}</p>
                </div>
                <StatusBadge
                  tone={tenant.is_active === false ? 'muted' : 'success'}
                  label={tenant.is_active === false ? `${tenant.code} · off` : tenant.code}
                />
              </div>
            </button>
          ))}
          {!isLoading && institutions.length === 0 && (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Building2 className="h-4 w-4" aria-hidden="true" /> No schools have been onboarded yet.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
