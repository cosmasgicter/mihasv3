/**
 * Super-admin tenant console (enterprise-tenant-authority).
 *
 * Preserves the full platform-owner experience: every onboarded school is
 * listed, a "New institution" can be created, and all configuration tabs
 * (domains, offerings, routing, documents, templates, profiles, branding,
 * staff, access grants, settlement, audit) are available. Rendered by the
 * `Tenants.tsx` switcher when `isSuperAdmin` is true.
 *
 * Task 13.2: this console now *composes* the authority-specific panels
 * (`TenantListPanel`, `TenantBrandingPanel`, `TenantDomainPanel`,
 * `TenantDocumentsPanel`, `TenantProgramsPanel`, `TenantStaffPanel`,
 * `TenantAccessGrantsPanel`, `TenantAuditPanel`) rather than inlining their
 * markup, so the same capability-gated panels back both consoles. Each panel
 * gates its own mutation controls and fails closed on a backend 403. The
 * backend re-enforces every mutation; capability gating here is a usability
 * layer.
 */
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Building2,
  FileStack,
  Globe2,
  Image as ImageIcon,
  KeyRound,
  Mail,
  Palette,
  Power,
  Rocket,
  ScrollText,
  ShieldCheck,
  Users,
} from 'lucide-react'

import { Seo } from '@/components/seo/Seo'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { SectionCard, StatusBadge } from '@/components/ui'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageShell } from '@/components/ui/PageShell'
import { DashboardSkeleton } from '@/components/ui'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MetricTile, NeedsAttentionGrid } from '@/components/ui/MetricTile'
import { toast } from '@/hooks/useToast'
import {
  tenantAdminService,
  type TenantInstitution,
} from '@/services/admin/tenants'

import { ProfilesPanel } from './ProfilesPanel'
import { RoutingSimulatorPanel } from './RoutingSimulatorPanel'
import { SettlementPanel } from './SettlementPanel'
import { TemplatesPanel } from './TemplatesPanel'
import { TenantAccessGrantsPanel } from './TenantAccessGrantsPanel'
import { TenantAuditPanel } from './TenantAuditPanel'
import { TenantBrandingPanel } from './TenantBrandingPanel'
import { TenantDocumentsPanel } from './TenantDocumentsPanel'
import { TenantDomainPanel } from './TenantDomainPanel'
import { TenantListPanel } from './TenantListPanel'
import { TenantProgramsPanel } from './TenantProgramsPanel'
import { TenantStaffPanel } from './TenantStaffPanel'
import { tenantErrorMessage } from './errors'
import { ChecklistItem } from './primitives'
import { pathFor } from '@/routes/routeRegistry'

type TenantFormState = {
  name: string
  code: string
  slug: string
  full_name: string
  brand_name: string
  email: string
  admissions_email: string
  support_email: string
  phone: string
  website: string
  primary_color: string
  secondary_color: string
}

const emptyForm: TenantFormState = {
  name: '',
  code: '',
  slug: '',
  full_name: '',
  brand_name: '',
  email: '',
  admissions_email: '',
  support_email: '',
  phone: '',
  website: '',
  primary_color: '#0F766E',
  secondary_color: '#334155',
}

function toSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function tenantToForm(tenant: TenantInstitution): TenantFormState {
  return {
    name: tenant.name || '',
    code: tenant.code || '',
    slug: tenant.slug || toSlug(tenant.code || tenant.name || ''),
    full_name: tenant.full_name || '',
    brand_name: tenant.brand_name || tenant.name || '',
    email: tenant.email || '',
    admissions_email: tenant.admissions_email || '',
    support_email: tenant.support_email || '',
    phone: tenant.phone || '',
    website: tenant.website || '',
    primary_color: tenant.primary_color || '#0F766E',
    secondary_color: tenant.secondary_color || '#334155',
  }
}

function formToPayload(form: TenantFormState): Partial<TenantInstitution> {
  return {
    name: form.name.trim(),
    code: form.code.trim().toUpperCase(),
    slug: toSlug(form.slug || form.code || form.name),
    full_name: form.full_name.trim() || form.name.trim(),
    brand_name: form.brand_name.trim() || form.name.trim(),
    email: form.email.trim() || undefined,
    admissions_email: form.admissions_email.trim() || form.email.trim() || undefined,
    support_email: form.support_email.trim() || form.email.trim() || undefined,
    phone: form.phone.trim() || undefined,
    website: form.website.trim() || undefined,
    primary_color: form.primary_color.trim() || undefined,
    secondary_color: form.secondary_color.trim() || undefined,
    is_active: true,
  }
}

export function SuperAdminTenantConsole() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState<TenantFormState>(emptyForm)

  const institutionsQuery = useQuery({
    queryKey: ['admin', 'tenants', 'institutions'],
    queryFn: () => tenantAdminService.listInstitutions(),
  })

  const institutions = useMemo(
    () => [...(institutionsQuery.data?.institutions || [])].sort((a, b) => a.name.localeCompare(b.name)),
    [institutionsQuery.data?.institutions]
  )
  const selectedTenant = institutions.find(item => item.id === selectedId) || null

  useEffect(() => {
    if (!selectedId && institutions.length > 0) {
      setSelectedId(institutions[0]!.id)
    }
  }, [institutions, selectedId])

  useEffect(() => {
    if (selectedTenant) {
      setForm(tenantToForm(selectedTenant))
    }
  }, [selectedTenant])

  // Detail query backs the at-a-glance metrics + configuration checklist and
  // feeds the templates panel. The authority-specific panels fetch their own
  // sections (and own their own 403 handling); their mutations invalidate the
  // `['admin','tenants']` prefix so these counts stay fresh.
  const detailQuery = useQuery({
    queryKey: ['admin', 'tenants', 'detail', selectedId],
    enabled: Boolean(selectedId),
    queryFn: async () => {
      const id = selectedId!
      const [domains, assets, templates, requiredDocuments, memberships, grants, documentProfiles] = await Promise.all([
        tenantAdminService.listDomains(id),
        tenantAdminService.listAssets(id),
        tenantAdminService.listTemplates(id),
        tenantAdminService.listRequiredDocuments(id),
        tenantAdminService.listMemberships(id),
        tenantAdminService.listAccessGrants({ institutionId: id }),
        tenantAdminService.listDocumentProfiles(id),
      ])
      return { domains, assets, templates, requiredDocuments, memberships, grants, documentProfiles }
    },
  })

  const invalidateDetail = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'tenants', 'detail', selectedId] })
  }

  const createMutation = useMutation({
    mutationFn: tenantAdminService.createInstitution,
    onSuccess: () => {
      toast.success('Institution created')
      queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] })
      setForm(emptyForm)
      setSelectedId(null)
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Institution was not saved')),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TenantInstitution> }) =>
      tenantAdminService.updateInstitution(id, data),
    onSuccess: () => {
      toast.success('Institution updated')
      queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] })
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Institution was not updated')),
  })

  const deactivateInstitutionMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      tenantAdminService.updateInstitution(id, { is_active: isActive }),
    onSuccess: (_data, variables) => {
      toast.success(variables.isActive ? 'School reactivated' : 'School deactivated')
      queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] })
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'School status was not changed')),
  })

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const payload = formToPayload(form)
    if (!payload.name || !payload.code) {
      toast.error('Name and code are required')
      return
    }
    if (selectedTenant) {
      updateMutation.mutate({ id: selectedTenant.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const handleNew = () => {
    setSelectedId(null)
    setForm(emptyForm)
  }

  if (institutionsQuery.isLoading) {
    return <DashboardSkeleton />
  }

  const detail = detailQuery.data

  return (
    <>
      <Seo title="Tenant Onboarding | Beanola Admissions" description="Manage Beanola client schools, brands, domains, and access." path={pathFor('admin.tenants')} noindex />
      <PageShell
        title="Tenant onboarding"
        subtitle="Create and configure schools that operate on the Beanola admissions platform."
        tone="admin"
        maxWidth="full"
      >
        <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
          <Button type="button" onClick={() => navigate(pathFor('admin.tenantOnboarding'))}>
            <Rocket className="h-4 w-4" aria-hidden="true" /> New institution (wizard)
          </Button>
        </div>
        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <TenantListPanel
            institutions={institutions}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onNew={handleNew}
            isError={institutionsQuery.isError}
            error={institutionsQuery.error}
            isLoading={institutionsQuery.isLoading}
            onRetry={() => institutionsQuery.refetch()}
          />

          <div className="space-y-6">
            <SectionCard
              title={selectedTenant ? 'School profile' : 'New school'}
              description="Branding and admissions contact details used by white-label portals and official documents."
              icon={<Building2 className="h-5 w-5" />}
              actions={selectedTenant ? (
                <div className="flex items-center gap-2">
                  <StatusBadge
                    tone={selectedTenant.is_active === false ? 'muted' : 'success'}
                    label={selectedTenant.is_active === false ? 'Inactive' : 'Active'}
                  />
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    loading={
                      deactivateInstitutionMutation.isPending &&
                      deactivateInstitutionMutation.variables?.id === selectedTenant.id
                    }
                    onClick={() => deactivateInstitutionMutation.mutate({ id: selectedTenant.id, isActive: selectedTenant.is_active === false })}
                  >
                    <Power className="h-3.5 w-3.5" aria-hidden="true" />
                    {selectedTenant.is_active === false ? 'Reactivate' : 'Deactivate'}
                  </Button>
                </div>
              ) : undefined}
            >
              <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
                <Input value={form.name} onChange={event => setForm(prev => ({ ...prev, name: event.target.value }))} placeholder="Short name" aria-label="Short name" />
                <Input value={form.code} onChange={event => setForm(prev => ({ ...prev, code: event.target.value }))} placeholder="Code" aria-label="Institution code" />
                <Input value={form.full_name} onChange={event => setForm(prev => ({ ...prev, full_name: event.target.value }))} placeholder="Legal/full name" aria-label="Full name" className="md:col-span-2" />
                <Input value={form.brand_name} onChange={event => setForm(prev => ({ ...prev, brand_name: event.target.value }))} placeholder="Display brand name" aria-label="Brand name" />
                <Input value={form.slug} onChange={event => setForm(prev => ({ ...prev, slug: event.target.value }))} placeholder="school-slug" aria-label="Slug" />
                <Input value={form.email} onChange={event => setForm(prev => ({ ...prev, email: event.target.value }))} placeholder="Main email" aria-label="Main email" />
                <Input value={form.admissions_email} onChange={event => setForm(prev => ({ ...prev, admissions_email: event.target.value }))} placeholder="Admissions email" aria-label="Admissions email" />
                <Input value={form.support_email} onChange={event => setForm(prev => ({ ...prev, support_email: event.target.value }))} placeholder="Support email" aria-label="Support email" />
                <Input value={form.phone} onChange={event => setForm(prev => ({ ...prev, phone: event.target.value }))} placeholder="Phone" aria-label="Phone" />
                <Input value={form.website} onChange={event => setForm(prev => ({ ...prev, website: event.target.value }))} placeholder="Website" aria-label="Website" />
                <div className="flex gap-3">
                  <Input value={form.primary_color} onChange={event => setForm(prev => ({ ...prev, primary_color: event.target.value }))} aria-label="Primary color" />
                  <Input value={form.secondary_color} onChange={event => setForm(prev => ({ ...prev, secondary_color: event.target.value }))} aria-label="Secondary color" />
                </div>
                <div className="md:col-span-2 flex justify-end">
                  <Button type="submit" loading={createMutation.isPending || updateMutation.isPending}>
                    {selectedTenant ? 'Save school' : 'Create school'}
                  </Button>
                </div>
              </form>
            </SectionCard>

            {selectedTenant ? (
              <>
                <NeedsAttentionGrid>
                  <MetricTile icon={Globe2} label="Domains" value={detail?.domains.length ?? 0} />
                  <MetricTile icon={ImageIcon} label="Assets" value={detail?.assets.length ?? 0} />
                  <MetricTile icon={ScrollText} label="Templates" value={detail?.templates.length ?? 0} />
                  <MetricTile icon={ShieldCheck} label="Documents" value={detail?.requiredDocuments.length ?? 0} />
                  <MetricTile icon={Users} label="Staff" value={detail?.memberships.length ?? 0} />
                  <MetricTile icon={KeyRound} label="Grants" value={detail?.grants.length ?? 0} />
                </NeedsAttentionGrid>

                <Tabs defaultValue="domains" className="w-full">
                  <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 [&>button]:min-h-touch [&>button]:px-3.5">
                    <TabsTrigger value="domains">Domains</TabsTrigger>
                    <TabsTrigger value="offerings">Offerings &amp; rules</TabsTrigger>
                    <TabsTrigger value="routing">Test routing</TabsTrigger>
                    <TabsTrigger value="documents">Required docs</TabsTrigger>
                    <TabsTrigger value="templates">Templates</TabsTrigger>
                    <TabsTrigger value="profiles">Document profiles</TabsTrigger>
                    <TabsTrigger value="branding">Branding</TabsTrigger>
                    <TabsTrigger value="staff">Staff access</TabsTrigger>
                    <TabsTrigger value="settlement">Settlement</TabsTrigger>
                    <TabsTrigger value="audit">Audit</TabsTrigger>
                  </TabsList>

                  <TabsContent value="domains" className="space-y-6">
                    <TenantDomainPanel institutionId={selectedTenant.id} />
                  </TabsContent>

                  <TabsContent value="offerings" className="space-y-6">
                    <TenantProgramsPanel institutionId={selectedTenant.id} />
                  </TabsContent>

                  <TabsContent value="routing" className="space-y-6">
                    <RoutingSimulatorPanel
                      institutionId={selectedTenant.id}
                      institutionName={selectedTenant.brand_name || selectedTenant.name}
                    />
                  </TabsContent>

                  <TabsContent value="documents" className="space-y-6">
                    <TenantDocumentsPanel institutionId={selectedTenant.id} />
                  </TabsContent>

                  <TabsContent value="templates" className="space-y-6">
                    <TemplatesPanel
                      institutionId={selectedTenant.id}
                      templates={detail?.templates || []}
                      onChanged={invalidateDetail}
                    />
                  </TabsContent>

                  <TabsContent value="profiles" className="space-y-6">
                    <ProfilesPanel institutionId={selectedTenant.id} />
                  </TabsContent>

                  <TabsContent value="branding" className="space-y-6">
                    <TenantBrandingPanel institutionId={selectedTenant.id} />
                  </TabsContent>

                  <TabsContent value="staff" className="space-y-6">
                    <TenantStaffPanel institutionId={selectedTenant.id} />
                    <TenantAccessGrantsPanel institutionId={selectedTenant.id} />
                  </TabsContent>

                  <TabsContent value="settlement" className="space-y-6">
                    <SettlementPanel institutionId={selectedTenant.id} />
                  </TabsContent>

                  <TabsContent value="audit" className="space-y-6">
                    <TenantAuditPanel institutionId={selectedTenant.id} />
                  </TabsContent>
                </Tabs>

                <SectionCard
                  title="Configuration checklist"
                  description="Operational resources available for this school."
                  icon={<Palette className="h-5 w-5" />}
                >
                  <div className="grid gap-3 md:grid-cols-3">
                    <ChecklistItem icon={ImageIcon} label="Logos and signatures" count={detail?.assets.length ?? 0} />
                    <ChecklistItem icon={ScrollText} label="Official templates" count={detail?.templates.length ?? 0} />
                    <ChecklistItem icon={FileStack} label="Document profiles" count={detail?.documentProfiles.length ?? 0} />
                    <ChecklistItem icon={ShieldCheck} label="Required documents" count={detail?.requiredDocuments.length ?? 0} />
                    <ChecklistItem icon={Users} label="Staff memberships" count={detail?.memberships.length ?? 0} />
                    <ChecklistItem icon={KeyRound} label="Extra access grants" count={detail?.grants.length ?? 0} />
                    <ChecklistItem icon={Mail} label="Admissions contact" count={form.admissions_email ? 1 : 0} />
                  </div>
                </SectionCard>
              </>
            ) : (
              <EmptyState
                icon={<Building2 />}
                heading="Select or create a school"
                description="Choose a school from the list to configure its domains, offerings, documents, staff access, and settlement, or create a new one."
              />
            )}
          </div>
        </div>
      </PageShell>
    </>
  )
}
