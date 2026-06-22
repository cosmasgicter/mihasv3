/**
 * TenantOnboardingWizard (enterprise-tenant-authority, task 15.1).
 *
 * A Super_Admin-only stepper that onboards a brand-new tenant end to end with
 * **no manual database edit** (R14.2 / R16.1). It walks the platform operator
 * through:
 *
 *   1. Institution profile   → `createInstitution` / `updateInstitution`
 *   2. Branding              → `updateInstitution` (colours) + `uploadAsset`
 *   3. Domains               → `createDomain` (status `pending_dns` + DNS record)
 *   4. Application templates  → `createTemplate`
 *   5. Required documents    → `createRequiredDocument`
 *   6. Program assignments   → `listOfferings` (read) + console deep-link
 *   7. Intake availability   → guided (read) + console deep-link
 *   8. Tenant-admin invite   → `userService.create` + `createMembership`
 *   9. Review & activate     → `activateDomain` (verified → active) + finish
 *
 * Authority + isolation:
 *   - Rendered only for a Super_Admin (`useCapabilities().isSuperAdmin`). A
 *     non-super-admin sees a clear no-access state and **no tenant data**
 *     (R11.5). The backend re-enforces every mutation — this gate is a
 *     usability layer.
 *   - Each persistence step calls an existing admin tenant API and invalidates
 *     the `['admin','tenants']` React Query prefix, so the new tenant appears
 *     in the console list immediately (R14.3).
 *
 * Domain lifecycle (R14.4): a domain is created `pending_dns` with a DNS record
 * the tenant must publish. DNS verification is asynchronous (the backend verify
 * task moves `pending_dns → pending_review → verified`); the wizard does not
 * block completion on DNS propagation — the tenant + config still persist
 * (R14.2). Once the domain reaches `verified`, the review step's "verify +
 * activate" action calls `activateDomain` to drive it to `active`.
 *
 * Dirty-state protection: while onboarding is in progress (a tenant has been
 * created but the wizard is not yet finished, or a step has unsaved input) a
 * `beforeunload` guard and an exit confirmation protect against accidental
 * loss, mirroring the student-form convention.
 */
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CircleDashed,
  FileStack,
  Globe2,
  GraduationCap,
  Image as ImageIcon,
  Info,
  LayoutTemplate,
  ListChecks,
  Rocket,
  ScrollText,
  ShieldCheck,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'

import { Seo } from '@/components/seo/Seo'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { DashboardSkeleton, SectionCard, StatusBadge } from '@/components/ui'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageShell } from '@/components/ui/PageShell'
import { useCapabilities } from '@/contexts/CapabilityContext'
import { toast } from '@/hooks/useToast'
import { userService } from '@/services/admin/users'
import {
  tenantAdminService,
  type TenantDomain,
  type TenantInstitution,
} from '@/services/admin/tenants'

import { tenantErrorMessage } from './errors'
import { TENANT_SELECT_CLASS } from './primitives'

// --- Step model -------------------------------------------------------------

type StepKey =
  | 'profile'
  | 'branding'
  | 'domains'
  | 'templates'
  | 'documents'
  | 'programs'
  | 'intakes'
  | 'invite'
  | 'review'

interface StepDef {
  key: StepKey
  label: string
  icon: LucideIcon
}

const STEPS: StepDef[] = [
  { key: 'profile', label: 'Institution profile', icon: Building2 },
  { key: 'branding', label: 'Branding', icon: ImageIcon },
  { key: 'domains', label: 'Domains', icon: Globe2 },
  { key: 'templates', label: 'Application templates', icon: LayoutTemplate },
  { key: 'documents', label: 'Required documents', icon: ListChecks },
  { key: 'programs', label: 'Program assignments', icon: GraduationCap },
  { key: 'intakes', label: 'Intake availability', icon: ScrollText },
  { key: 'invite', label: 'Tenant-admin invitation', icon: UserPlus },
  { key: 'review', label: 'Review & activate', icon: Rocket },
]

// A tenant-admin membership confers the read bundle plus the granted-mutation
// bundle for the new tenant. These permission values map onto the backend
// `tenant.*` mutation capabilities in `AdminCapabilityService` (the serializer
// allowlist: view/review/manage/verify_documents/verify_payments/export).
const TENANT_ADMIN_PERMISSIONS = ['manage', 'review', 'verify_documents', 'verify_payments', 'export']

// --- Profile form -----------------------------------------------------------

interface ProfileForm {
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

const EMPTY_PROFILE: ProfileForm = {
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

function profileToPayload(form: ProfileForm): Partial<TenantInstitution> {
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

// --- Stepper (accessible progress rail) ------------------------------------

function Stepper({
  steps,
  current,
  reached,
  onJump,
}: {
  steps: StepDef[]
  current: number
  /** Highest step index the operator has reached (jump-back only). */
  reached: number
  onJump: (index: number) => void
}) {
  return (
    <nav aria-label="Onboarding steps">
      <ol className="flex flex-col gap-1">
        {steps.map((step, index) => {
          const isCurrent = index === current
          const isDone = index < current
          const canJump = index <= reached
          const Icon = isDone ? Check : step.icon
          return (
            <li key={step.key}>
              <button
                type="button"
                onClick={() => canJump && onJump(index)}
                disabled={!canJump}
                aria-current={isCurrent ? 'step' : undefined}
                className={[
                  'flex min-h-touch w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isCurrent
                    ? 'border-primary/40 bg-primary/5 text-foreground'
                    : isDone
                      ? 'border-success/30 bg-success/5 text-foreground'
                      : 'border-border bg-background text-muted-foreground',
                  canJump ? 'cursor-pointer hover:bg-muted/40' : 'cursor-not-allowed opacity-70',
                ].join(' ')}
              >
                <span
                  className={[
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                    isCurrent
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : isDone
                        ? 'border-success/40 bg-success/10 text-success'
                        : 'border-border bg-muted text-muted-foreground',
                  ].join(' ')}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{step.label}</span>
                  <span className="block text-xs text-muted-foreground">Step {index + 1}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

// --- Small presentational helpers ------------------------------------------

function StepHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

function CountNote({ count, singular, plural }: { count: number; singular: string; plural?: string }) {
  const noun = count === 1 ? singular : plural ?? `${singular}s`
  return (
    <p className="text-sm text-muted-foreground">
      {count > 0 ? `${count} ${noun} configured.` : `No ${plural ?? `${singular}s`} configured yet — this step is optional.`}
    </p>
  )
}

function domainStatusTone(status?: string | null): 'neutral' | 'info' | 'warning' | 'success' | 'muted' {
  switch (status) {
    case 'active':
      return 'success'
    case 'verified':
      return 'info'
    case 'pending_review':
      return 'info'
    case 'failed':
      return 'warning'
    case 'disabled':
      return 'muted'
    default:
      return 'neutral'
  }
}

function domainStatusLabel(status?: string | null): string {
  switch (status) {
    case 'pending_dns':
      return 'Pending DNS'
    case 'pending_review':
      return 'Pending review'
    case 'verified':
      return 'Verified'
    case 'active':
      return 'Active'
    case 'failed':
      return 'Failed'
    case 'disabled':
      return 'Disabled'
    default:
      return status ? String(status) : 'Unknown'
  }
}

// --- Main wizard ------------------------------------------------------------

export function TenantOnboardingWizard() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { isSuperAdmin, isLoading } = useCapabilities()

  const [stepIndex, setStepIndex] = useState(0)
  const [reachedIndex, setReachedIndex] = useState(0)
  const [institutionId, setInstitutionId] = useState<string | null>(null)
  const [completed, setCompleted] = useState(false)

  const [profile, setProfile] = useState<ProfileForm>(EMPTY_PROFILE)
  // Snapshot of the last persisted profile, so we can tell when the form is dirty.
  const [savedProfile, setSavedProfile] = useState<string>(JSON.stringify(EMPTY_PROFILE))

  // Per-step draft inputs (unsaved until the operator clicks the step action).
  const [hostnameDraft, setHostnameDraft] = useState('')
  const [templateDraft, setTemplateDraft] = useState({ document_type: 'acceptance_letter', name: '' })
  const [documentDraft, setDocumentDraft] = useState({ document_type: 'nrc', label: '', is_required: true })
  const [inviteDraft, setInviteDraft] = useState({ full_name: '', email: '', phone: '', password: '' })
  const [inviteCompleted, setInviteCompleted] = useState(false)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [createdDomain, setCreatedDomain] = useState<TenantDomain | null>(null)

  const profileDirty = JSON.stringify(profile) !== savedProfile
  const draftDirty =
    hostnameDraft.trim().length > 0 ||
    templateDraft.name.trim().length > 0 ||
    documentDraft.label.trim().length > 0 ||
    inviteDraft.full_name.trim().length > 0 ||
    inviteDraft.email.trim().length > 0
  const inProgress = institutionId !== null && !completed
  const guardActive = !completed && (profileDirty || draftDirty || inProgress)

  const guardRef = useRef(guardActive)
  guardRef.current = guardActive

  // beforeunload guard while onboarding is in progress (mirrors student forms).
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!guardRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  const invalidateTenants = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] })
  }, [queryClient])

  // Reads, enabled only once the institution exists. Reuse the console keys so
  // both surfaces stay consistent and fresh.
  const domainsQuery = useQuery({
    queryKey: ['admin', 'tenants', 'domains', institutionId],
    queryFn: () => tenantAdminService.listDomains(institutionId!),
    enabled: Boolean(institutionId),
  })
  const templatesQuery = useQuery({
    queryKey: ['admin', 'tenants', 'templates', institutionId],
    queryFn: () => tenantAdminService.listTemplates(institutionId!),
    enabled: Boolean(institutionId),
  })
  const documentsQuery = useQuery({
    queryKey: ['admin', 'tenants', 'required-documents', institutionId],
    queryFn: () => tenantAdminService.listRequiredDocuments(institutionId!),
    enabled: Boolean(institutionId),
  })
  const offeringsQuery = useQuery({
    queryKey: ['admin', 'tenants', 'offerings', institutionId],
    queryFn: () => tenantAdminService.listOfferings(institutionId!),
    enabled: Boolean(institutionId),
  })
  const membershipsQuery = useQuery({
    queryKey: ['admin', 'tenants', 'memberships', institutionId],
    queryFn: () => tenantAdminService.listMemberships(institutionId!),
    enabled: Boolean(institutionId),
  })

  // Keep the locally-tracked created domain in sync with the freshest read so
  // its status reflects async DNS verification when the operator returns.
  const liveDomain = useMemo(() => {
    if (!createdDomain) return null
    const fromList = (domainsQuery.data || []).find((d) => d.id === createdDomain.id)
    return fromList ? { ...createdDomain, ...fromList } : createdDomain
  }, [createdDomain, domainsQuery.data])

  // --- Mutations ------------------------------------------------------------

  const createInstitutionMutation = useMutation({
    mutationFn: (payload: Partial<TenantInstitution>) => tenantAdminService.createInstitution(payload),
    onSuccess: (created) => {
      const id = created?.id ?? null
      setInstitutionId(id)
      setSavedProfile(JSON.stringify(profile))
      invalidateTenants()
      toast.success('Institution created')
      goNext()
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Institution was not created')),
  })

  const updateInstitutionMutation = useMutation({
    mutationFn: (payload: Partial<TenantInstitution>) => tenantAdminService.updateInstitution(institutionId!, payload),
    onSuccess: () => {
      setSavedProfile(JSON.stringify(profile))
      invalidateTenants()
      toast.success('Institution updated')
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Institution was not updated')),
  })

  const uploadLogoMutation = useMutation({
    mutationFn: (file: File) => tenantAdminService.uploadAsset(institutionId!, { asset_type: 'logo', file }),
    onSuccess: () => {
      setLogoFile(null)
      invalidateTenants()
      toast.success('Logo uploaded')
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Logo was not uploaded')),
  })

  const createDomainMutation = useMutation({
    mutationFn: (hostname: string) => tenantAdminService.createDomain(institutionId!, { hostname, is_active: true }),
    onSuccess: (domain) => {
      setCreatedDomain(domain ?? null)
      setHostnameDraft('')
      invalidateTenants()
      toast.success('Domain added — publish the DNS record to verify it')
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Domain was not added')),
  })

  const activateDomainMutation = useMutation({
    mutationFn: (domainId: string) => tenantAdminService.activateDomain(institutionId!, domainId),
    onSuccess: (domain) => {
      setCreatedDomain((prev) => (prev ? { ...prev, ...(domain || {}), status: domain?.status ?? 'active' } : domain ?? null))
      invalidateTenants()
      toast.success('Domain activated')
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Domain was not activated')),
  })

  const createTemplateMutation = useMutation({
    mutationFn: () =>
      tenantAdminService.createTemplate(institutionId!, {
        document_type: templateDraft.document_type,
        name: templateDraft.name.trim(),
      }),
    onSuccess: () => {
      setTemplateDraft((prev) => ({ ...prev, name: '' }))
      invalidateTenants()
      toast.success('Template added')
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Template was not added')),
  })

  const createDocumentMutation = useMutation({
    mutationFn: () =>
      tenantAdminService.createRequiredDocument(institutionId!, {
        document_type: documentDraft.document_type,
        label: documentDraft.label.trim(),
        is_required: documentDraft.is_required,
        is_active: true,
      }),
    onSuccess: () => {
      setDocumentDraft((prev) => ({ ...prev, label: '' }))
      invalidateTenants()
      toast.success('Required document added')
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Required document was not added')),
  })

  const inviteMutation = useMutation({
    mutationFn: async () => {
      // Create the tenant-admin user, then scope it to the new tenant with a
      // membership (R16.2). Both calls are super-admin gated on the backend.
      const result = await userService.create({
        email: inviteDraft.email.trim(),
        password: inviteDraft.password,
        full_name: inviteDraft.full_name.trim(),
        phone: inviteDraft.phone.trim() || undefined,
        role: 'admin',
      })
      const userId = result?.user?.id
      if (!userId) {
        throw new Error('User was created but no id was returned; cannot scope the membership.')
      }
      await tenantAdminService.createMembership({
        user_id: String(userId),
        institution_id: institutionId!,
        role: 'admin',
        permissions: TENANT_ADMIN_PERMISSIONS,
        is_active: true,
      })
    },
    onSuccess: () => {
      setInviteCompleted(true)
      setInviteDraft({ full_name: '', email: '', phone: '', password: '' })
      invalidateTenants()
      toast.success('Tenant admin invited and scoped to this tenant')
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Tenant admin was not created')),
  })

  // --- Navigation -----------------------------------------------------------

  const goNext = useCallback(() => {
    setStepIndex((prev) => {
      const next = Math.min(prev + 1, STEPS.length - 1)
      setReachedIndex((reached) => Math.max(reached, next))
      return next
    })
  }, [])

  const goBack = useCallback(() => setStepIndex((prev) => Math.max(prev - 1, 0)), [])

  const jumpTo = useCallback((index: number) => {
    setStepIndex(index)
    setReachedIndex((reached) => Math.max(reached, index))
  }, [])

  const exitToConsole = useCallback(() => {
    if (guardRef.current) {
      const ok = window.confirm('Onboarding is in progress. Leave the wizard? Saved steps are kept; unsaved input on this step is discarded.')
      if (!ok) return
    }
    navigate('/admin/tenants')
  }, [navigate])

  const finishToConsole = useCallback(() => {
    setCompleted(true)
    // Ensure the list is fresh before the console mounts.
    invalidateTenants()
    navigate('/admin/tenants')
  }, [invalidateTenants, navigate])

  const handleProfileSubmit = (event: FormEvent) => {
    event.preventDefault()
    const payload = profileToPayload(profile)
    if (!payload.name || !payload.code) {
      toast.error('Name and code are required')
      return
    }
    if (institutionId) {
      updateInstitutionMutation.mutate(payload)
      goNext()
    } else {
      createInstitutionMutation.mutate(payload)
    }
  }

  // --- Gating ---------------------------------------------------------------

  if (isLoading) {
    return <DashboardSkeleton />
  }

  if (!isSuperAdmin) {
    // Non-super-admin: clear no-access state, no tenant data (R11.5).
    return (
      <>
        <Seo title="Tenant onboarding | Beanola Admissions" description="Onboard a new tenant." path="/admin/tenants/new" noindex />
        <PageShell title="Tenant onboarding" tone="admin" maxWidth="2xl">
          <EmptyState
            icon={<ShieldCheck />}
            heading="No access"
            description="Only Beanola platform administrators can onboard new tenants. Contact your platform administrator if you believe this is an error."
          />
        </PageShell>
      </>
    )
  }

  const step = STEPS[stepIndex]!
  const tenantName = profile.brand_name.trim() || profile.name.trim() || 'New tenant'
  const domains = domainsQuery.data || []
  const templates = templatesQuery.data || []
  const requiredDocuments = documentsQuery.data || []
  const offerings = offeringsQuery.data || []
  const memberships = membershipsQuery.data || []
  const savingProfile = createInstitutionMutation.isPending || updateInstitutionMutation.isPending

  return (
    <>
      <Seo title="Tenant onboarding | Beanola Admissions" description="Onboard and activate a new Beanola tenant." path="/admin/tenants/new" noindex />
      <PageShell
        title="Tenant onboarding wizard"
        subtitle={institutionId ? `Configuring ${tenantName}` : 'Create and activate a new school on the Beanola admissions platform.'}
        tone="admin"
        maxWidth="full"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <StatusBadge
              tone={institutionId ? 'success' : 'neutral'}
              label={institutionId ? 'Tenant created' : 'Not yet created'}
            />
            {completed && <StatusBadge tone="success" label="Onboarding complete" />}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={exitToConsole}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to console
          </Button>
        </div>

        <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
          <SectionCard title="Steps" description="Configure each section, then review and activate." icon={<ListChecks className="h-5 w-5" />}>
            <Stepper steps={STEPS} current={stepIndex} reached={reachedIndex} onJump={jumpTo} />
            {!institutionId && stepIndex > 0 && (
              <p className="mt-3 flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Create the institution profile first to unlock the remaining steps.
              </p>
            )}
          </SectionCard>

          <div className="space-y-6">
            <SectionCard title={step.label} icon={<step.icon className="h-5 w-5" />}>
              {/* Steps after profile require a persisted institution. */}
              {step.key !== 'profile' && !institutionId ? (
                <EmptyState
                  icon={<Building2 />}
                  heading="Create the institution first"
                  description="The institution profile must be saved before this step can call its admin API."
                />
              ) : (
                <div className="space-y-5">
                  {step.key === 'profile' && (
                    <>
                      <StepHeading
                        title="Institution profile"
                        description="Branding name and admissions contacts used by the white-label portal and official documents. Saved with no manual database edit."
                      />
                      <form className="grid gap-4 md:grid-cols-2" onSubmit={handleProfileSubmit}>
                        <Input value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} placeholder="Short name" aria-label="Short name" />
                        <Input value={profile.code} onChange={(e) => setProfile((p) => ({ ...p, code: e.target.value }))} placeholder="Code" aria-label="Institution code" />
                        <Input value={profile.full_name} onChange={(e) => setProfile((p) => ({ ...p, full_name: e.target.value }))} placeholder="Legal/full name" aria-label="Full name" className="md:col-span-2" />
                        <Input value={profile.brand_name} onChange={(e) => setProfile((p) => ({ ...p, brand_name: e.target.value }))} placeholder="Display brand name" aria-label="Brand name" />
                        <Input value={profile.slug} onChange={(e) => setProfile((p) => ({ ...p, slug: e.target.value }))} placeholder="school-slug" aria-label="Slug" />
                        <Input value={profile.email} onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))} placeholder="Main email" aria-label="Main email" type="email" inputMode="email" autoComplete="off" />
                        <Input value={profile.admissions_email} onChange={(e) => setProfile((p) => ({ ...p, admissions_email: e.target.value }))} placeholder="Admissions email" aria-label="Admissions email" type="email" inputMode="email" autoComplete="off" />
                        <Input value={profile.support_email} onChange={(e) => setProfile((p) => ({ ...p, support_email: e.target.value }))} placeholder="Support email" aria-label="Support email" type="email" inputMode="email" autoComplete="off" />
                        <Input value={profile.phone} onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))} placeholder="Phone" aria-label="Phone" inputMode="tel" autoComplete="off" />
                        <Input value={profile.website} onChange={(e) => setProfile((p) => ({ ...p, website: e.target.value }))} placeholder="Website" aria-label="Website" inputMode="url" autoComplete="off" className="md:col-span-2" />
                        <div className="md:col-span-2 flex justify-end">
                          <Button type="submit" loading={savingProfile}>
                            {institutionId ? 'Save & continue' : 'Create institution & continue'}
                            <ArrowRight className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </form>
                    </>
                  )}

                  {step.key === 'branding' && (
                    <>
                      <StepHeading title="Branding" description="Portal colours and logo. Falls back to neutral Beanola branding until set — never another school's identity." />
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="space-y-1.5">
                          <span className="text-sm font-medium text-foreground">Primary colour</span>
                          <Input value={profile.primary_color} onChange={(e) => setProfile((p) => ({ ...p, primary_color: e.target.value }))} aria-label="Primary color" placeholder="#0F766E" />
                        </label>
                        <label className="space-y-1.5">
                          <span className="text-sm font-medium text-foreground">Secondary colour</span>
                          <Input value={profile.secondary_color} onChange={(e) => setProfile((p) => ({ ...p, secondary_color: e.target.value }))} aria-label="Secondary color" placeholder="#334155" />
                        </label>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <Button type="button" variant="outline" loading={updateInstitutionMutation.isPending} onClick={() => updateInstitutionMutation.mutate(profileToPayload(profile))}>
                          Save colours
                        </Button>
                      </div>
                      <div className="space-y-2 rounded-lg border border-border bg-background p-3">
                        <p className="text-sm font-medium text-foreground">Logo</p>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/svg+xml,image/webp"
                          aria-label="Logo file"
                          onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                          className="block w-full text-sm text-muted-foreground file:mr-3 file:min-h-touch file:rounded-md file:border file:border-input file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground"
                        />
                        <Button type="button" size="sm" loading={uploadLogoMutation.isPending} disabled={!logoFile} onClick={() => logoFile && uploadLogoMutation.mutate(logoFile)}>
                          <ImageIcon className="h-4 w-4" aria-hidden="true" /> Upload logo
                        </Button>
                      </div>
                    </>
                  )}

                  {step.key === 'domains' && (
                    <>
                      <StepHeading title="Domains" description="Add the white-label hostname. It starts as Pending DNS; publish the record below, then activate it on the review step once verified." />
                      <form
                        className="flex flex-col gap-3 sm:flex-row"
                        onSubmit={(e) => {
                          e.preventDefault()
                          if (!hostnameDraft.trim()) return
                          createDomainMutation.mutate(hostnameDraft.trim())
                        }}
                      >
                        <Input value={hostnameDraft} onChange={(e) => setHostnameDraft(e.target.value)} placeholder="apply.school.edu.zm" aria-label="Domain hostname" inputMode="url" />
                        <Button type="submit" loading={createDomainMutation.isPending}>
                          <Globe2 className="h-4 w-4" aria-hidden="true" /> Add domain
                        </Button>
                      </form>

                      {liveDomain?.dns_record && (
                        <div className="space-y-2 rounded-lg border border-info/25 bg-info/5 p-3">
                          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <Info className="h-4 w-4 text-info" aria-hidden="true" /> Publish this DNS record to verify ownership
                          </p>
                          <dl className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-[7rem_minmax(0,1fr)]">
                            <dt className="font-medium text-foreground">Type</dt>
                            <dd className="break-words">{liveDomain.dns_record.type}</dd>
                            <dt className="font-medium text-foreground">Name</dt>
                            <dd className="break-words">{liveDomain.dns_record.name}</dd>
                            <dt className="font-medium text-foreground">Value</dt>
                            <dd className="break-words font-mono">{liveDomain.dns_record.value}</dd>
                            {liveDomain.dns_record.verification && (
                              <>
                                <dt className="font-medium text-foreground">TXT verify</dt>
                                <dd className="break-words font-mono">
                                  {liveDomain.dns_record.verification.name} = {liveDomain.dns_record.verification.value}
                                </dd>
                              </>
                            )}
                          </dl>
                          <p className="text-xs text-muted-foreground">
                            Verification runs automatically once DNS propagates. You can finish onboarding now — the tenant and its configuration are already saved.
                          </p>
                        </div>
                      )}

                      <div className="grid gap-2 sm:grid-cols-2">
                        {domains.map((domain) => (
                          <div key={domain.id} className="rounded-lg border border-border bg-background p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="break-words text-sm font-medium text-foreground">{domain.hostname}</p>
                                <p className="text-xs text-muted-foreground">{domain.is_primary ? 'Primary' : 'Secondary'}</p>
                              </div>
                              <StatusBadge tone={domainStatusTone(domain.status)} label={domainStatusLabel(domain.status)} />
                            </div>
                          </div>
                        ))}
                        {domains.length === 0 && <p className="text-sm text-muted-foreground">No domains added yet.</p>}
                      </div>
                    </>
                  )}

                  {step.key === 'templates' && (
                    <>
                      <StepHeading title="Application templates" description="Official document templates (acceptance letter, application slip, receipt) for this school." />
                      <form
                        className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)_auto]"
                        onSubmit={(e) => {
                          e.preventDefault()
                          if (!templateDraft.name.trim()) {
                            toast.error('Template name is required')
                            return
                          }
                          createTemplateMutation.mutate()
                        }}
                      >
                        <select
                          value={templateDraft.document_type}
                          onChange={(e) => setTemplateDraft((p) => ({ ...p, document_type: e.target.value }))}
                          className={TENANT_SELECT_CLASS}
                          aria-label="Template document type"
                        >
                          <option value="acceptance_letter">Acceptance letter</option>
                          <option value="conditional_acceptance">Conditional acceptance</option>
                          <option value="application_slip">Application slip</option>
                          <option value="payment_receipt">Payment receipt</option>
                          <option value="rejection">Rejection</option>
                        </select>
                        <Input value={templateDraft.name} onChange={(e) => setTemplateDraft((p) => ({ ...p, name: e.target.value }))} placeholder="Template name" aria-label="Template name" />
                        <Button type="submit" loading={createTemplateMutation.isPending}>
                          <LayoutTemplate className="h-4 w-4" aria-hidden="true" /> Add
                        </Button>
                      </form>
                      <CountNote count={templates.length} singular="template" />
                      <div className="space-y-2">
                        {templates.map((tpl) => (
                          <div key={tpl.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3">
                            <div className="min-w-0">
                              <p className="break-words text-sm font-medium text-foreground">{tpl.name}</p>
                              <p className="text-xs text-muted-foreground">{tpl.document_type} · v{tpl.version}</p>
                            </div>
                            {tpl.is_active === false && <StatusBadge tone="muted" label="Inactive" />}
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {step.key === 'documents' && (
                    <>
                      <StepHeading title="Required documents" description="Documents applicants must upload for this school (NRC/passport are mandatory by policy)." />
                      <form
                        className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)_auto]"
                        onSubmit={(e) => {
                          e.preventDefault()
                          if (!documentDraft.label.trim()) {
                            toast.error('Document label is required')
                            return
                          }
                          createDocumentMutation.mutate()
                        }}
                      >
                        <select
                          value={documentDraft.document_type}
                          onChange={(e) => setDocumentDraft((p) => ({ ...p, document_type: e.target.value }))}
                          className={TENANT_SELECT_CLASS}
                          aria-label="Required document type"
                        >
                          <option value="nrc">NRC</option>
                          <option value="passport">Passport</option>
                          <option value="result_slip">Result slip</option>
                          <option value="certificate">Certificate</option>
                          <option value="reference_letter">Reference letter</option>
                          <option value="other">Other</option>
                        </select>
                        <Input value={documentDraft.label} onChange={(e) => setDocumentDraft((p) => ({ ...p, label: e.target.value }))} placeholder="Document label" aria-label="Document label" />
                        <Button type="submit" loading={createDocumentMutation.isPending}>
                          <ListChecks className="h-4 w-4" aria-hidden="true" /> Add
                        </Button>
                      </form>
                      <label className="flex items-center gap-2 text-sm text-foreground">
                        <input
                          type="checkbox"
                          checked={documentDraft.is_required}
                          onChange={(e) => setDocumentDraft((p) => ({ ...p, is_required: e.target.checked }))}
                          className="h-4 w-4 rounded border-input"
                        />
                        Mandatory for submission
                      </label>
                      <CountNote count={requiredDocuments.length} singular="required document" plural="required documents" />
                      <div className="space-y-2">
                        {requiredDocuments.map((doc) => (
                          <div key={doc.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3">
                            <div className="min-w-0">
                              <p className="break-words text-sm font-medium text-foreground">{doc.label}</p>
                              <p className="text-xs text-muted-foreground">{doc.document_type}</p>
                            </div>
                            <StatusBadge tone={doc.is_required ? 'info' : 'muted'} label={doc.is_required ? 'Required' : 'Optional'} />
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {step.key === 'programs' && (
                    <>
                      <StepHeading title="Program assignments" description="Canonical programs assigned to this tenant become its offerings. Assign and tune routing in the console's Offerings tab — changes are saved to this tenant immediately." />
                      <CountNote count={offerings.length} singular="program offering" plural="program offerings" />
                      <div className="space-y-2">
                        {offerings.map((offering) => (
                          <div key={offering.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3">
                            <div className="min-w-0">
                              <p className="break-words text-sm font-medium text-foreground">{offering.name}</p>
                              <p className="text-xs text-muted-foreground">{offering.code}{offering.offering_status ? ` · ${offering.offering_status}` : ''}</p>
                            </div>
                            {offering.is_active === false && <StatusBadge tone="muted" label="Inactive" />}
                          </div>
                        ))}
                      </div>
                      <p className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
                        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        Program assignment uses the canonical program catalogue. After finishing the wizard, open the school in the console and use the Offerings tab to assign programs and set routing priority.
                      </p>
                    </>
                  )}

                  {step.key === 'intakes' && (
                    <>
                      <StepHeading title="Intake availability" description="Which intakes this tenant participates in. Intake offerings are platform-managed and configured per offering in the console." />
                      <p className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
                        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        Intakes follow the platform Jan/Jul cadence and are attached to a tenant through its program offerings. Set intake participation per offering in the console's Offerings tab once programs are assigned.
                      </p>
                      <CountNote count={offerings.length} singular="offering ready for intakes" plural="offerings ready for intakes" />
                    </>
                  )}

                  {step.key === 'invite' && (
                    <>
                      <StepHeading title="Tenant-admin invitation" description="Create the tenant administrator and scope a membership to this tenant only. They will see no other school's data (R16.2/R16.3)." />
                      {inviteCompleted ? (
                        <div className="flex items-start gap-2 rounded-lg border border-success/25 bg-success/5 p-3 text-sm text-foreground">
                          <Check className="mt-0.5 h-4 w-4 text-success" aria-hidden="true" />
                          Tenant admin created and scoped to {tenantName}. They can sign in with the credentials you set.
                        </div>
                      ) : (
                        <form
                          className="grid gap-3 md:grid-cols-2"
                          onSubmit={(e) => {
                            e.preventDefault()
                            if (!inviteDraft.full_name.trim() || !inviteDraft.email.trim()) {
                              toast.error('Name and email are required')
                              return
                            }
                            if (inviteDraft.password.length < 8) {
                              toast.error('Set an initial password of at least 8 characters')
                              return
                            }
                            inviteMutation.mutate()
                          }}
                        >
                          <Input value={inviteDraft.full_name} onChange={(e) => setInviteDraft((p) => ({ ...p, full_name: e.target.value }))} placeholder="Full name" aria-label="Tenant admin full name" autoComplete="off" />
                          <Input value={inviteDraft.email} onChange={(e) => setInviteDraft((p) => ({ ...p, email: e.target.value }))} placeholder="Email" aria-label="Tenant admin email" type="email" inputMode="email" autoComplete="off" />
                          <Input value={inviteDraft.phone} onChange={(e) => setInviteDraft((p) => ({ ...p, phone: e.target.value }))} placeholder="Phone (optional)" aria-label="Tenant admin phone" inputMode="tel" autoComplete="off" />
                          <Input value={inviteDraft.password} onChange={(e) => setInviteDraft((p) => ({ ...p, password: e.target.value }))} placeholder="Initial password" aria-label="Tenant admin initial password" type="password" autoComplete="new-password" />
                          <div className="md:col-span-2 flex justify-end">
                            <Button type="submit" loading={inviteMutation.isPending}>
                              <UserPlus className="h-4 w-4" aria-hidden="true" /> Create tenant admin
                            </Button>
                          </div>
                        </form>
                      )}
                      {memberships.length > 0 && (
                        <CountNote count={memberships.length} singular="staff membership" plural="staff memberships" />
                      )}
                    </>
                  )}

                  {step.key === 'review' && (
                    <>
                      <StepHeading title="Review & activate" description="Confirm the configuration, activate a verified domain, then finish. Everything is already persisted — finishing just returns you to the console." />
                      <dl className="grid gap-3 sm:grid-cols-2">
                        <ReviewRow icon={Building2} label="Institution" value={tenantName} ok={Boolean(institutionId)} />
                        <ReviewRow icon={Globe2} label="Domains" value={`${domains.length} added`} ok={domains.length > 0} />
                        <ReviewRow icon={LayoutTemplate} label="Templates" value={`${templates.length} configured`} ok={templates.length > 0} />
                        <ReviewRow icon={ListChecks} label="Required documents" value={`${requiredDocuments.length} configured`} ok={requiredDocuments.length > 0} />
                        <ReviewRow icon={GraduationCap} label="Program offerings" value={`${offerings.length} assigned`} ok={offerings.length > 0} />
                        <ReviewRow icon={UserPlus} label="Tenant admin" value={inviteCompleted ? 'Created & scoped' : 'Not created'} ok={inviteCompleted} />
                      </dl>

                      <div className="space-y-2 rounded-lg border border-border bg-background p-3">
                        <p className="text-sm font-medium text-foreground">Domain activation</p>
                        {domains.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No domain to activate. You can add one on the Domains step.</p>
                        ) : (
                          <div className="space-y-2">
                            {domains.map((domain) => {
                              const isVerified = domain.status === 'verified'
                              const isActive = domain.status === 'active'
                              return (
                                <div key={domain.id} className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <StatusBadge tone={domainStatusTone(domain.status)} label={domainStatusLabel(domain.status)} />
                                    <span className="break-words text-sm text-foreground">{domain.hostname}</span>
                                  </div>
                                  {isActive ? (
                                    <span className="flex items-center gap-1 text-sm text-success">
                                      <Check className="h-4 w-4" aria-hidden="true" /> Active
                                    </span>
                                  ) : (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled={!isVerified}
                                      loading={activateDomainMutation.isPending}
                                      onClick={() => activateDomainMutation.mutate(domain.id)}
                                    >
                                      <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                                      {isVerified ? 'Verify + activate' : 'Awaiting DNS verification'}
                                    </Button>
                                  )}
                                </div>
                              )
                            })}
                            <p className="flex items-start gap-2 text-xs text-muted-foreground">
                              <CircleDashed className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              DNS verification is asynchronous. Activation unlocks once a domain reaches Verified — you can finish now and activate later from the console.
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="flex justify-end">
                        <Button type="button" onClick={finishToConsole}>
                          <Check className="h-4 w-4" aria-hidden="true" /> Finish onboarding
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </SectionCard>

            {/* Step navigation footer */}
            <div className="flex items-center justify-between gap-3">
              <Button type="button" variant="outline" onClick={goBack} disabled={stepIndex === 0}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
              </Button>
              {step.key !== 'review' && step.key !== 'profile' && (
                <Button type="button" onClick={goNext} disabled={!institutionId}>
                  Next <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </PageShell>
    </>
  )
}

function ReviewRow({ icon: Icon, label, value, ok }: { icon: LucideIcon; label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-foreground">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="break-words text-xs text-muted-foreground">{value}</p>
      </div>
      <StatusBadge tone={ok ? 'success' : 'neutral'} label={ok ? 'Ready' : 'Optional'} />
    </div>
  )
}

export default TenantOnboardingWizard
