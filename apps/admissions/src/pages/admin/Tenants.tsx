import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  FilePlus2,
  FileStack,
  Globe2,
  Image as ImageIcon,
  KeyRound,
  Mail,
  Palette,
  Power,
  ScrollText,
  ShieldCheck,
  UploadCloud,
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

import { AuditPanel } from './tenants/AuditPanel'
import { OfferingsPanel } from './tenants/OfferingsPanel'
import { ProfilesPanel } from './tenants/ProfilesPanel'
import { RoutingSimulatorPanel } from './tenants/RoutingSimulatorPanel'
import { SettlementPanel } from './tenants/SettlementPanel'
import { TemplatesPanel } from './tenants/TemplatesPanel'
import { tenantErrorMessage } from './tenants/errors'
import { ChecklistItem, ResourceList, TENANT_SELECT_CLASS } from './tenants/primitives'

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

type AssetFormState = {
  asset_type: string
  storage_key: string
  public_url: string
  mime_type: string
  checksum_sha256: string
  file: File | null
}

type RequiredDocumentFormState = {
  document_type: string
  label: string
  program_id: string
  canonical_program_id: string
}

type MembershipFormState = {
  user_id: string
  role: string
}

type GrantFormState = {
  user_id: string
  scope_type: string
  program_id: string
  application_id: string
  expires_at: string
}

const emptyAssetForm: AssetFormState = {
  asset_type: 'logo',
  storage_key: '',
  public_url: '',
  mime_type: 'image/png',
  checksum_sha256: '',
  file: null,
}

const emptyRequiredDocumentForm: RequiredDocumentFormState = {
  document_type: 'identity_document',
  label: '',
  program_id: '',
  canonical_program_id: '',
}

const emptyMembershipForm: MembershipFormState = {
  user_id: '',
  role: 'staff',
}

const emptyGrantForm: GrantFormState = {
  user_id: '',
  scope_type: 'institution',
  program_id: '',
  application_id: '',
  expires_at: '',
}

type AssetUploadState = { status: 'idle' | 'success' | 'error'; message: string }

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

function optionalString(value: string) {
  const trimmed = value.trim()
  return trimmed || undefined
}

export default function AdminTenants() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState<TenantFormState>(emptyForm)
  const [assetForm, setAssetForm] = useState<AssetFormState>(emptyAssetForm)
  const [assetUpload, setAssetUpload] = useState<AssetUploadState>({ status: 'idle', message: '' })
  const [requiredDocumentForm, setRequiredDocumentForm] = useState<RequiredDocumentFormState>(emptyRequiredDocumentForm)
  const [membershipForm, setMembershipForm] = useState<MembershipFormState>(emptyMembershipForm)
  const [grantForm, setGrantForm] = useState<GrantFormState>(emptyGrantForm)
  const [domainInput, setDomainInput] = useState('')

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

  const domainMutation = useMutation({
    mutationFn: ({ institutionId, hostname }: { institutionId: string; hostname: string }) =>
      tenantAdminService.createDomain(institutionId, { hostname, is_active: true }),
    onSuccess: () => {
      toast.success('Domain added')
      setDomainInput('')
      invalidateDetail()
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Domain was not added')),
  })

  const assetMutation = useMutation({
    mutationFn: ({ institutionId }: { institutionId: string }) => {
      if (assetForm.file) {
        return tenantAdminService.uploadAsset(institutionId, {
          asset_type: assetForm.asset_type,
          file: assetForm.file,
        })
      }
      return tenantAdminService.createAsset(institutionId, {
        asset_type: assetForm.asset_type,
        storage_key: assetForm.storage_key.trim(),
        public_url: optionalString(assetForm.public_url),
        mime_type: assetForm.mime_type,
        checksum_sha256: assetForm.checksum_sha256.trim(),
        is_active: true,
      })
    },
    onSuccess: () => {
      setAssetUpload({ status: 'success', message: 'Asset registered and validated.' })
      toast.success('Asset registered')
      setAssetForm(emptyAssetForm)
      invalidateDetail()
    },
    onError: (error) => {
      const message = tenantErrorMessage(error, 'Asset failed validation and was not stored.')
      setAssetUpload({ status: 'error', message })
      toast.error(message)
    },
  })

  const requiredDocumentMutation = useMutation({
    mutationFn: ({ institutionId }: { institutionId: string }) =>
      tenantAdminService.createRequiredDocument(institutionId, {
        document_type: requiredDocumentForm.document_type,
        label: requiredDocumentForm.label.trim(),
        program_id: optionalString(requiredDocumentForm.program_id),
        canonical_program_id: optionalString(requiredDocumentForm.canonical_program_id),
        is_required: true,
        is_active: true,
      }),
    onSuccess: () => {
      toast.success('Required document added')
      setRequiredDocumentForm(emptyRequiredDocumentForm)
      invalidateDetail()
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Required document was not added')),
  })

  const membershipMutation = useMutation({
    mutationFn: ({ institutionId }: { institutionId: string }) =>
      tenantAdminService.createMembership({
        institution_id: institutionId,
        user_id: membershipForm.user_id.trim(),
        role: membershipForm.role,
        is_active: true,
      }),
    onSuccess: () => {
      toast.success('Staff membership added')
      setMembershipForm(emptyMembershipForm)
      invalidateDetail()
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Staff membership was not added')),
  })

  const grantMutation = useMutation({
    mutationFn: ({ institutionId }: { institutionId: string }) =>
      tenantAdminService.createAccessGrant({
        user_id: grantForm.user_id.trim(),
        scope_type: grantForm.scope_type,
        institution_id: grantForm.scope_type === 'institution' ? institutionId : undefined,
        program_id: grantForm.scope_type === 'program_offering' ? optionalString(grantForm.program_id) : undefined,
        application_id: grantForm.scope_type === 'application' ? optionalString(grantForm.application_id) : undefined,
        expires_at: optionalString(grantForm.expires_at),
        is_active: true,
      }),
    onSuccess: () => {
      toast.success('Access grant added')
      setGrantForm(emptyGrantForm)
      invalidateDetail()
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Access grant was not added')),
  })

  const deactivateResourceMutation = useMutation({
    mutationFn: async ({ type, id }: { type: 'domain' | 'asset' | 'requiredDocument' | 'membership' | 'grant'; id: string }) => {
      if (!selectedTenant) throw new Error('No tenant selected')
      switch (type) {
        case 'domain':
          return tenantAdminService.updateDomain(selectedTenant.id, id, { is_active: false })
        case 'asset':
          return tenantAdminService.updateAsset(selectedTenant.id, id, { is_active: false })
        case 'requiredDocument':
          return tenantAdminService.updateRequiredDocument(selectedTenant.id, id, { is_active: false })
        case 'membership':
          return tenantAdminService.updateMembership(id, { is_active: false })
        case 'grant':
          return tenantAdminService.updateAccessGrant(id, { is_active: false })
      }
    },
    onSuccess: () => {
      toast.success('Resource deactivated')
      invalidateDetail()
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Resource was not deactivated')),
  })

  const deactivateResource = (type: 'domain' | 'asset' | 'requiredDocument' | 'membership' | 'grant', id: string) => {
    deactivateResourceMutation.mutate({ type, id })
  }

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
    setAssetUpload({ status: 'idle', message: '' })
  }

  if (institutionsQuery.isLoading) {
    return <DashboardSkeleton />
  }

  const detail = detailQuery.data

  // R13.4: SVG assets cannot be rasterised into backend-generated official PDFs
  // (the renderer records an `unsupported` status and skips them — never executes
  // untrusted SVG). Warn the operator and prompt for a raster version when the
  // selected MIME type or chosen file is SVG.
  const assetFileIsSvg =
    assetForm.file != null &&
    (assetForm.file.type === 'image/svg+xml' ||
      assetForm.file.name.toLowerCase().endsWith('.svg'))
  const assetIsSvg = assetForm.mime_type === 'image/svg+xml' || assetFileIsSvg

  return (
    <>
      <Seo title="Tenant Onboarding | Beanola Admissions" description="Manage Beanola client schools, brands, domains, and access." path="/admin/tenants" noindex />
      <PageShell
        title="Tenant onboarding"
        subtitle="Create and configure schools that operate on the Beanola admissions platform."
        tone="admin"
        maxWidth="full"
      >
        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-foreground">Schools</h2>
              <Button type="button" size="sm" onClick={handleNew}>New</Button>
            </div>
            <div className="space-y-2">
              {institutions.map((tenant) => (
                <button
                  key={tenant.id}
                  type="button"
                  onClick={() => setSelectedId(tenant.id)}
                  aria-pressed={selectedId === tenant.id}
                  className={`min-h-touch w-full rounded-lg border p-3 text-left transition-colors ${
                    selectedId === tenant.id ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{tenant.brand_name || tenant.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{tenant.full_name || tenant.name}</p>
                    </div>
                    <StatusBadge
                      tone={tenant.is_active === false ? 'muted' : 'success'}
                      label={tenant.is_active === false ? `${tenant.code} · off` : tenant.code}
                    />
                  </div>
                </button>
              ))}
              {institutions.length === 0 && (
                <SectionCard padding="sm">
                  <p className="text-sm text-muted-foreground">No schools have been onboarded yet.</p>
                </SectionCard>
              )}
            </div>
          </div>

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
                    loading={deactivateInstitutionMutation.isPending}
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
                  <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
                    <TabsTrigger value="domains">Domains</TabsTrigger>
                    <TabsTrigger value="offerings">Offerings &amp; rules</TabsTrigger>
                    <TabsTrigger value="routing">Test routing</TabsTrigger>
                    <TabsTrigger value="documents">Required docs</TabsTrigger>
                    <TabsTrigger value="templates">Templates</TabsTrigger>
                    <TabsTrigger value="profiles">Document profiles</TabsTrigger>
                    <TabsTrigger value="assets">Assets</TabsTrigger>
                    <TabsTrigger value="staff">Staff access</TabsTrigger>
                    <TabsTrigger value="settlement">Settlement</TabsTrigger>
                    <TabsTrigger value="audit">Audit</TabsTrigger>
                  </TabsList>

                  <TabsContent value="domains" className="space-y-6">
                    <SectionCard
                      title="Domains"
                      description="White-label hostnames that resolve to this school."
                      icon={<Globe2 className="h-5 w-5" />}
                    >
                      <form
                        className="flex flex-col gap-3 sm:flex-row"
                        onSubmit={(event) => {
                          event.preventDefault()
                          if (!domainInput.trim()) return
                          domainMutation.mutate({ institutionId: selectedTenant.id, hostname: domainInput.trim() })
                        }}
                      >
                        <Input value={domainInput} onChange={event => setDomainInput(event.target.value)} placeholder="apply.school.edu.zm" aria-label="Domain hostname" />
                        <Button type="submit" loading={domainMutation.isPending}>Add domain</Button>
                      </form>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {(detail?.domains || []).map(domain => (
                          <div key={domain.id} className="rounded-lg border border-border bg-background p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="break-words text-sm font-medium text-foreground">{domain.hostname}</p>
                                <p className="text-xs text-muted-foreground">{domain.is_primary ? 'Primary' : 'Secondary'} · {domain.is_active === false ? 'Inactive' : 'Active'}</p>
                              </div>
                              {domain.is_active !== false && (
                                <Button type="button" size="xs" variant="outline" onClick={() => deactivateResource('domain', domain.id)}>Deactivate</Button>
                              )}
                            </div>
                          </div>
                        ))}
                        {(detail?.domains || []).length === 0 && (
                          <p className="text-sm text-muted-foreground">No white-label domains configured.</p>
                        )}
                      </div>
                    </SectionCard>
                  </TabsContent>

                  <TabsContent value="offerings" className="space-y-6">
                    <OfferingsPanel institutionId={selectedTenant.id} />
                  </TabsContent>

                  <TabsContent value="routing" className="space-y-6">
                    <RoutingSimulatorPanel
                      institutionId={selectedTenant.id}
                      institutionName={selectedTenant.brand_name || selectedTenant.name}
                    />
                  </TabsContent>

                  <TabsContent value="documents" className="space-y-6">
                    <SectionCard
                      title="Required documents"
                      description="Documents requested after an offering is assigned."
                      icon={<ShieldCheck className="h-5 w-5" />}
                    >
                      <form
                        className="grid gap-3 sm:grid-cols-2"
                        onSubmit={(event) => {
                          event.preventDefault()
                          if (!requiredDocumentForm.label.trim()) {
                            toast.error('Document label is required')
                            return
                          }
                          requiredDocumentMutation.mutate({ institutionId: selectedTenant.id })
                        }}
                      >
                        <select
                          value={requiredDocumentForm.document_type}
                          onChange={event => setRequiredDocumentForm(prev => ({ ...prev, document_type: event.target.value }))}
                          className={TENANT_SELECT_CLASS}
                          aria-label="Required document type"
                        >
                          <option value="identity_document">Identity document</option>
                          <option value="academic_transcript">Academic transcript</option>
                          <option value="passport_photo">Passport photo</option>
                          <option value="proof_of_payment">Proof of payment</option>
                          <option value="other">Other</option>
                        </select>
                        <Input value={requiredDocumentForm.label} onChange={event => setRequiredDocumentForm(prev => ({ ...prev, label: event.target.value }))} placeholder="Displayed label" aria-label="Required document label" />
                        <Input value={requiredDocumentForm.program_id} onChange={event => setRequiredDocumentForm(prev => ({ ...prev, program_id: event.target.value }))} placeholder="Offering ID, optional" aria-label="Program offering ID" />
                        <Input value={requiredDocumentForm.canonical_program_id} onChange={event => setRequiredDocumentForm(prev => ({ ...prev, canonical_program_id: event.target.value }))} placeholder="Canonical program ID, optional" aria-label="Canonical program ID" />
                        <div className="sm:col-span-2 flex justify-end">
                          <Button type="submit" loading={requiredDocumentMutation.isPending}><FilePlus2 className="h-4 w-4" aria-hidden="true" /> Add document</Button>
                        </div>
                      </form>
                      <ResourceList
                        empty="No required documents configured."
                        onDeactivate={(id) => deactivateResource('requiredDocument', id)}
                        items={(detail?.requiredDocuments || []).map(item => ({
                          id: item.id,
                          title: item.label,
                          meta: `${item.document_type} · ${item.is_required === false ? 'Optional' : 'Required'}`,
                          active: item.is_active !== false,
                        }))}
                      />
                    </SectionCard>
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

                  <TabsContent value="assets" className="space-y-6">
                    <SectionCard
                      title="Assets"
                      description="Upload versioned logos, signatures, and seals. New versions never alter assets on already-generated documents."
                      icon={<ImageIcon className="h-5 w-5" />}
                    >
                      {assetUpload.status !== 'idle' && (
                        <div
                          role="status"
                          className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
                            assetUpload.status === 'success'
                              ? 'border-success/25 bg-success/10 text-success'
                              : 'border-destructive/25 bg-destructive/10 text-destructive'
                          }`}
                        >
                          {assetUpload.status === 'success'
                            ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                            : <UploadCloud className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
                          <span>{assetUpload.message}</span>
                        </div>
                      )}
                      <form
                        className="grid gap-3 sm:grid-cols-2"
                        onSubmit={(event) => {
                          event.preventDefault()
                          if (!assetForm.file && (!assetForm.storage_key.trim() || !assetForm.checksum_sha256.trim())) {
                            toast.error('Upload a file or provide storage key and checksum')
                            return
                          }
                          setAssetUpload({ status: 'idle', message: '' })
                          assetMutation.mutate({ institutionId: selectedTenant.id })
                        }}
                      >
                        <select
                          value={assetForm.asset_type}
                          onChange={event => setAssetForm(prev => ({ ...prev, asset_type: event.target.value }))}
                          className={TENANT_SELECT_CLASS}
                          aria-label="Asset type"
                        >
                          <option value="logo">Logo</option>
                          <option value="signature">Signature</option>
                          <option value="seal">Seal</option>
                        </select>
                        <select
                          value={assetForm.mime_type}
                          onChange={event => setAssetForm(prev => ({ ...prev, mime_type: event.target.value }))}
                          className={TENANT_SELECT_CLASS}
                          aria-label="Asset MIME type"
                        >
                          <option value="image/png">PNG</option>
                          <option value="image/jpeg">JPEG</option>
                          <option value="image/webp">WebP</option>
                          <option value="image/svg+xml">SVG</option>
                        </select>
                        <Input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/svg+xml"
                          onChange={event => setAssetForm(prev => ({ ...prev, file: event.target.files?.[0] ?? null }))}
                          aria-label="Asset file"
                          className="sm:col-span-2"
                        />
                        {assetIsSvg && (
                          <div
                            role="alert"
                            className="sm:col-span-2 flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm"
                          >
                            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
                            <div className="min-w-0 space-y-1">
                              <p className="font-semibold text-foreground">
                                Warning — SVG will not render in official PDFs
                              </p>
                              <p className="text-muted-foreground">
                                Backend-generated PDF documents (acceptance letters, receipts, application
                                slips) cannot rasterise SVG logos or signatures. The renderer records an
                                <span className="font-medium text-foreground"> unsupported</span> status and
                                skips the asset, so it will be missing from official documents. Upload a raster
                                version (PNG, JPEG, or WebP) for logos and signatures used in PDFs.
                              </p>
                            </div>
                          </div>
                        )}
                        <Input value={assetForm.storage_key} onChange={event => setAssetForm(prev => ({ ...prev, storage_key: event.target.value }))} placeholder="R2/storage key (manual registration)" aria-label="Asset storage key" />
                        <Input value={assetForm.public_url} onChange={event => setAssetForm(prev => ({ ...prev, public_url: event.target.value }))} placeholder="Public URL, optional" aria-label="Asset public URL" />
                        <Input value={assetForm.checksum_sha256} onChange={event => setAssetForm(prev => ({ ...prev, checksum_sha256: event.target.value }))} placeholder="SHA-256 checksum (manual registration)" aria-label="Asset checksum" className="sm:col-span-2" />
                        <div className="sm:col-span-2 flex justify-end">
                          <Button type="submit" loading={assetMutation.isPending}><UploadCloud className="h-4 w-4" aria-hidden="true" /> {assetForm.file ? 'Upload asset' : 'Register asset'}</Button>
                        </div>
                      </form>
                      <ResourceList
                        empty="No assets registered."
                        onDeactivate={(id) => deactivateResource('asset', id)}
                        items={(detail?.assets || []).map(item => ({
                          id: item.id,
                          title: `${item.asset_type} v${item.version ?? 1}`,
                          meta: `${item.mime_type} · ${item.storage_key}`,
                          active: item.is_active !== false,
                        }))}
                      />
                    </SectionCard>
                  </TabsContent>

                  <TabsContent value="staff" className="space-y-6">
                    <SectionCard
                      title="Staff access"
                      description="Memberships grant routine access; grants add scoped exceptions."
                      icon={<Users className="h-5 w-5" />}
                    >
                      <form
                        className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto]"
                        onSubmit={(event) => {
                          event.preventDefault()
                          if (!membershipForm.user_id.trim()) {
                            toast.error('User ID is required')
                            return
                          }
                          membershipMutation.mutate({ institutionId: selectedTenant.id })
                        }}
                      >
                        <Input value={membershipForm.user_id} onChange={event => setMembershipForm(prev => ({ ...prev, user_id: event.target.value }))} placeholder="User/Profile ID" aria-label="Membership user ID" />
                        <select
                          value={membershipForm.role}
                          onChange={event => setMembershipForm(prev => ({ ...prev, role: event.target.value }))}
                          className={TENANT_SELECT_CLASS}
                          aria-label="Membership role"
                        >
                          <option value="staff">Staff</option>
                          <option value="admissions">Admissions</option>
                          <option value="finance">Finance</option>
                          <option value="viewer">Viewer</option>
                        </select>
                        <Button type="submit" loading={membershipMutation.isPending}><Users className="h-4 w-4" aria-hidden="true" /> Add</Button>
                      </form>
                      <ResourceList
                        empty="No staff memberships configured."
                        onDeactivate={(id) => deactivateResource('membership', id)}
                        items={(detail?.memberships || []).map(item => ({
                          id: item.id,
                          title: item.user_id,
                          meta: `${item.role}${item.is_active === false ? ' · inactive' : ''}`,
                          active: item.is_active !== false,
                        }))}
                      />

                      <form
                        className="grid gap-3"
                        onSubmit={(event) => {
                          event.preventDefault()
                          if (!grantForm.user_id.trim()) {
                            toast.error('User ID is required')
                            return
                          }
                          if (grantForm.scope_type === 'program_offering' && !grantForm.program_id.trim()) {
                            toast.error('Program offering ID is required')
                            return
                          }
                          if (grantForm.scope_type === 'application' && !grantForm.application_id.trim()) {
                            toast.error('Application ID is required')
                            return
                          }
                          grantMutation.mutate({ institutionId: selectedTenant.id })
                        }}
                      >
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Input value={grantForm.user_id} onChange={event => setGrantForm(prev => ({ ...prev, user_id: event.target.value }))} placeholder="User/Profile ID" aria-label="Grant user ID" />
                          <select
                            value={grantForm.scope_type}
                            onChange={event => setGrantForm(prev => ({ ...prev, scope_type: event.target.value }))}
                            className={TENANT_SELECT_CLASS}
                            aria-label="Grant scope type"
                          >
                            <option value="institution">Institution</option>
                            <option value="program_offering">Program offering</option>
                            <option value="application">Application</option>
                          </select>
                          {grantForm.scope_type === 'program_offering' && (
                            <Input value={grantForm.program_id} onChange={event => setGrantForm(prev => ({ ...prev, program_id: event.target.value }))} placeholder="Program offering ID" aria-label="Grant program offering ID" />
                          )}
                          {grantForm.scope_type === 'application' && (
                            <Input value={grantForm.application_id} onChange={event => setGrantForm(prev => ({ ...prev, application_id: event.target.value }))} placeholder="Application ID" aria-label="Grant application ID" />
                          )}
                          <Input value={grantForm.expires_at} onChange={event => setGrantForm(prev => ({ ...prev, expires_at: event.target.value }))} placeholder="Expires at, optional" aria-label="Grant expiry" />
                        </div>
                        <div className="flex justify-end">
                          <Button type="submit" loading={grantMutation.isPending}><KeyRound className="h-4 w-4" aria-hidden="true" /> Add grant</Button>
                        </div>
                      </form>
                      <ResourceList
                        empty="No scoped grants configured."
                        onDeactivate={(id) => deactivateResource('grant', id)}
                        items={(detail?.grants || []).map(item => ({
                          id: item.id,
                          title: item.user_id,
                          meta: `${item.scope_type}${item.expires_at ? ` · expires ${item.expires_at}` : ''}`,
                          active: item.is_active !== false,
                        }))}
                      />
                    </SectionCard>
                  </TabsContent>

                  <TabsContent value="settlement" className="space-y-6">
                    <SettlementPanel institutionId={selectedTenant.id} />
                  </TabsContent>

                  <TabsContent value="audit" className="space-y-6">
                    <AuditPanel institutionId={selectedTenant.id} />
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
