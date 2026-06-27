/**
 * Tenant-admin school console (enterprise-tenant-authority).
 *
 * Rendered by the `Tenants.tsx` switcher when `isTenantAdmin` is true. Shows
 * ONLY the assigned institution(s) — never the platform-wide tenant list, the
 * "New institution" control, or global access-grant tooling (R12.3, R12.4,
 * R12.5). The backend scopes `GET /api/v1/admin/institutions/` to the actor's
 * memberships/grants, so this console can only ever read its own tenant(s);
 * capability gating here is a usability layer and the backend re-enforces every
 * read and write.
 *
 * Task 13.2: the console composes the same authority-specific panels as the
 * super-admin console (`TenantBrandingPanel`, `TenantDomainPanel`,
 * `TenantProgramsPanel`, `TenantStaffPanel`, `TenantDocumentsPanel`,
 * `TenantAuditPanel`) — each renders read/request affordances and removes
 * mutation controls the actor lacks the capability for, and fails closed on a
 * backend 403 (R12.6, R12.7). Tabs appear only for the `tenant.*` read
 * capabilities the actor actually holds for the active institution.
 */
import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Building2, Globe2, Mail, Phone, ShieldCheck } from 'lucide-react'

import { Seo } from '@/components/seo/Seo'
import { SectionCard, StatusBadge } from '@/components/ui'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageShell } from '@/components/ui/PageShell'
import { DashboardSkeleton } from '@/components/ui'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCapabilities } from '@/contexts/CapabilityContext'
import { tenantAdminService } from '@/services/admin/tenants'

import { TenantAuditPanel } from './TenantAuditPanel'
import { TenantBrandingPanel } from './TenantBrandingPanel'
import { TenantDocumentsPanel } from './TenantDocumentsPanel'
import { TenantDomainPanel } from './TenantDomainPanel'
import { TenantProgramsPanel } from './TenantProgramsPanel'
import { TenantStaffPanel } from './TenantStaffPanel'

/** A labelled read-only profile field. Renders nothing when the value is empty. */
function ProfileField({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="break-words text-sm text-foreground">{value}</p>
      </div>
    </div>
  )
}

export function TenantAdminSchoolConsole() {
  const {
    institutionCapabilities,
    selectedInstitutionId,
    setSelectedInstitutionId,
    canForInstitution,
  } = useCapabilities()

  // Institutions the actor is scoped to, per the backend capability set.
  const scopedIds = useMemo(() => Object.keys(institutionCapabilities), [institutionCapabilities])

  // Backend scopes this list to the actor's memberships/grants, so it only ever
  // returns the assigned institution(s) — never the full platform tenant list.
  const institutionsQuery = useQuery({
    queryKey: ['admin', 'tenants', 'my-institutions'],
    queryFn: () => tenantAdminService.listInstitutions(),
  })

  const institutions = useMemo(
    () => [...(institutionsQuery.data?.institutions || [])].sort((a, b) => a.name.localeCompare(b.name)),
    [institutionsQuery.data?.institutions]
  )

  // Resolve the active institution: the persisted selection when valid, else
  // the only assigned institution, else the first one in the list.
  const activeId =
    (selectedInstitutionId && scopedIds.includes(selectedInstitutionId) ? selectedInstitutionId : null) ??
    (scopedIds.length === 1 ? scopedIds[0]! : institutions[0]?.id ?? null)

  // Lock a single-institution tenant-admin to their one school so the selection
  // is consistent across refresh (shared sessionStorage key).
  useEffect(() => {
    if (activeId && selectedInstitutionId !== activeId) {
      setSelectedInstitutionId(activeId)
    }
  }, [activeId, selectedInstitutionId, setSelectedInstitutionId])

  const activeInstitution = institutions.find((inst) => inst.id === activeId) || null

  // Tabs are gated by the `tenant.*` read capabilities the actor holds for the
  // active institution (R12.6). Each entry maps a capability to its panel.
  const tabs = useMemo(() => {
    if (!activeId) return [] as Array<{ value: string; label: string; render: () => JSX.Element }>
    const defs: Array<{ value: string; label: string; capability: string; render: () => JSX.Element }> = [
      { value: 'branding', label: 'Branding', capability: 'tenant.profile.read', render: () => <TenantBrandingPanel institutionId={activeId} /> },
      { value: 'domains', label: 'Domains', capability: 'tenant.domain.read', render: () => <TenantDomainPanel institutionId={activeId} /> },
      { value: 'programs', label: 'Programs', capability: 'tenant.program.read', render: () => <TenantProgramsPanel institutionId={activeId} /> },
      { value: 'documents', label: 'Required docs', capability: 'tenant.document.read', render: () => <TenantDocumentsPanel institutionId={activeId} /> },
      { value: 'staff', label: 'Staff access', capability: 'tenant.staff.read', render: () => <TenantStaffPanel institutionId={activeId} /> },
      { value: 'audit', label: 'Audit', capability: 'tenant.audit.read', render: () => <TenantAuditPanel institutionId={activeId} /> },
    ]
    return defs.filter((def) => canForInstitution(activeId, def.capability))
  }, [activeId, canForInstitution])

  if (institutionsQuery.isLoading) {
    return <DashboardSkeleton />
  }

  return (
    <>
      <Seo title="My School | Beanola Admissions" description="View and manage your assigned school on the Beanola admissions platform." path="/admin/tenants" noindex />
      <PageShell
        title="My school"
        subtitle="View and manage the school assigned to your account."
        tone="admin"
        maxWidth="full"
      >
        {!activeInstitution ? (
          <EmptyState
            icon={<Building2 />}
            heading="No school assigned"
            description="Your account is not currently scoped to a school. Contact your platform administrator if you believe this is an error."
          />
        ) : (
          <div className="space-y-6">
            {/* Multi-school switcher (no "New institution" control — R12.4). */}
            {institutions.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {institutions.map((inst) => (
                  <button
                    key={inst.id}
                    type="button"
                    onClick={() => setSelectedInstitutionId(inst.id)}
                    aria-pressed={inst.id === activeId}
                    className={`min-h-touch rounded-lg border px-4 py-2 text-left transition-colors ${
                      inst.id === activeId ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/40'
                    }`}
                  >
                    <span className="text-sm font-semibold text-foreground">{inst.brand_name || inst.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{inst.code}</span>
                  </button>
                ))}
              </div>
            )}

            <SectionCard
              title="School profile"
              description="Your school's branding and admissions contact details."
              icon={<Building2 className="h-5 w-5" />}
              actions={
                <StatusBadge
                  tone={activeInstitution.is_active === false ? 'muted' : 'success'}
                  label={activeInstitution.is_active === false ? 'Inactive' : 'Active'}
                />
              }
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <ProfileField icon={Building2} label="Name" value={activeInstitution.full_name || activeInstitution.name} />
                <ProfileField icon={ShieldCheck} label="Code" value={activeInstitution.code} />
                <ProfileField icon={Mail} label="Admissions email" value={activeInstitution.admissions_email || activeInstitution.email} />
                <ProfileField icon={Mail} label="Support email" value={activeInstitution.support_email} />
                <ProfileField icon={Phone} label="Phone" value={activeInstitution.phone} />
                <ProfileField icon={Globe2} label="Website" value={activeInstitution.website} />
              </div>
            </SectionCard>

            {tabs.length > 0 ? (
              <Tabs defaultValue={tabs[0]!.value} className="w-full">
                <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 [&>button]:min-h-touch [&>button]:px-3.5">
                  {tabs.map((tab) => (
                    <TabsTrigger key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>
                  ))}
                </TabsList>
                {tabs.map((tab) => (
                  <TabsContent key={tab.value} value={tab.value} className="space-y-6">
                    {tab.render()}
                  </TabsContent>
                ))}
              </Tabs>
            ) : (
              <EmptyState
                icon={<ShieldCheck />}
                heading="Setup or permission required"
                description="Your account can view this school's profile, but no management sections are enabled for your role yet. Contact your platform administrator for domains, programs, documents, staff, or audit access."
                action={{
                  label: 'Contact platform admin',
                  onClick: () => {
                    const subject = encodeURIComponent(`Request management access for ${activeInstitution.brand_name || activeInstitution.name}`)
                    window.location.href = `mailto:support@beanola.com?subject=${subject}`
                  },
                  variant: 'primary',
                }}
              />
            )}
          </div>
        )}
      </PageShell>
    </>
  )
}
