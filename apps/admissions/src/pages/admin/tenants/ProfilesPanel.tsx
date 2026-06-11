import { FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Banknote,
  Copy,
  Eye,
  FileStack,
  ListChecks,
  Plus,
  Power,
  ReceiptText,
  Trash2,
} from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SectionCard, StatusBadge } from '@/components/ui'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { toast } from '@/hooks/useToast'
import {
  tenantAdminService,
  TENANT_PROFILE_CAPS,
  TENANT_PROFILE_LAYOUTS,
  type TenantDocumentProfile,
  type TenantProfileBankAccount,
  type TenantProfileFeeRow,
} from '@/services/admin/tenants'
import { tenantErrorMessage } from './errors'
import { TENANT_SELECT_CLASS, TokenChips } from './primitives'

const PROFILE_DOCUMENT_TYPES = [
  { value: 'acceptance_letter', label: 'Acceptance letter' },
  { value: 'conditional_offer', label: 'Conditional offer' },
  { value: 'application_slip', label: 'Application slip' },
  { value: 'payment_receipt', label: 'Payment receipt' },
]

const LAYOUT_LABELS: Record<string, string> = {
  simple_letter: 'Simple letter',
  fee_chart_letter: 'Fee-chart letter',
}

/**
 * Allowlisted tokens the backend renderer substitutes. Mirrors
 * `ALLOWED_TEMPLATE_TOKENS` in `backend/apps/catalog/services.py`; any token
 * outside this set is rejected at save time and rendered inert in the preview.
 */
const PROFILE_TOKENS = [
  'student_name',
  'application_number',
  'program',
  'intake',
  'institution',
  'receipt_number',
  'amount',
  'currency',
  'date',
] as const

const PROFILE_SAMPLE: Record<string, string> = {
  student_name: 'Jane M. Banda',
  application_number: 'APP-20260115-ABCD1234',
  program: 'Diploma in Clinical Medicine',
  intake: 'January 2026',
  institution: 'Beanola Partner School',
  receipt_number: 'BNL-000123',
  amount: '1,500.00',
  currency: 'ZMW',
  date: '15 January 2026',
}

interface SectionRow {
  key: string
  value: string
}

interface ProfileDraft {
  document_type: string
  layout_key: string
  program_id: string
  canonical_program_id: string
  intake_id: string
  sections: SectionRow[]
  fee_chart: TenantProfileFeeRow[]
  bank_accounts: TenantProfileBankAccount[]
  requirements: string[]
  signatory_name: string
  signatory_title: string
}

const EMPTY_DRAFT: ProfileDraft = {
  document_type: 'acceptance_letter',
  layout_key: 'simple_letter',
  program_id: '',
  canonical_program_id: '',
  intake_id: '',
  sections: [{ key: 'body', value: '' }],
  fee_chart: [],
  bank_accounts: [],
  requirements: [],
  signatory_name: '',
  signatory_title: '',
}

/** Replace `{{token}}` with sample values; unknown tokens render inert. */
function renderProfilePreview(body: string): string {
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, token: string) => {
    const key = token.toLowerCase()
    return key in PROFILE_SAMPLE ? PROFILE_SAMPLE[key]! : `[unknown token: ${token}]`
  })
}

/** Build the structured profile payload from the draft, dropping empty rows. */
function draftToPayload(draft: ProfileDraft) {
  const sections: Record<string, string> = {}
  for (const row of draft.sections) {
    const key = row.key.trim()
    if (key) sections[key] = row.value
  }
  const signatory: Record<string, string> = {}
  if (draft.signatory_name.trim()) signatory.name = draft.signatory_name.trim()
  if (draft.signatory_title.trim()) signatory.title = draft.signatory_title.trim()
  return {
    document_type: draft.document_type,
    layout_key: draft.layout_key,
    program_id: draft.program_id.trim() || null,
    canonical_program_id: draft.canonical_program_id.trim() || null,
    intake_id: draft.intake_id.trim() || null,
    sections,
    fee_chart: draft.fee_chart,
    bank_accounts: draft.bank_accounts,
    requirements: draft.requirements,
    signatory,
    is_active: true,
  }
}

/** Profile resolution scope key — used to group versions of the same profile. */
function scopeKey(profile: TenantDocumentProfile): string {
  return [
    profile.document_type,
    profile.program_id || '',
    profile.canonical_program_id || '',
    profile.intake_id || '',
  ].join('|')
}

function scopeLabel(profile: TenantDocumentProfile): string {
  if (profile.program_id) return `Offering ${profile.program_id.slice(0, 8)}${profile.intake_id ? ' · intake' : ''}`
  if (profile.canonical_program_id) return `Canonical ${profile.canonical_program_id.slice(0, 8)}${profile.intake_id ? ' · intake' : ''}`
  return 'Institution default'
}

interface ProfilesPanelProps {
  institutionId: string
}

/**
 * Rich tenant document-profile management (R8.8). Lets a super admin choose a
 * document type + optional applies-to scope, pick a backend layout, edit
 * structured sections / fee-chart rows / bank accounts / requirements /
 * signatory, preview with sample data, clone the latest version, and
 * activate/deactivate versions. Profiles drive backend-generated official
 * documents (no MIHAS/KATC fallback). Structural caps mirror the backend
 * `validate_profile_payload`.
 */
export function ProfilesPanel({ institutionId }: ProfilesPanelProps) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<ProfileDraft>(EMPTY_DRAFT)
  const [previewId, setPreviewId] = useState<string>('')

  const profilesQuery = useQuery({
    queryKey: ['admin', 'tenants', 'document-profiles', institutionId],
    queryFn: () => tenantAdminService.listDocumentProfiles(institutionId),
    enabled: Boolean(institutionId),
  })

  const offeringsQuery = useQuery({
    queryKey: ['admin', 'tenants', 'offerings', institutionId],
    queryFn: () => tenantAdminService.listOfferings(institutionId),
    enabled: Boolean(institutionId),
  })

  const profiles = profilesQuery.data || []
  const offerings = offeringsQuery.data || []

  // Group every version by resolution scope; surface the latest version per scope.
  const scopes = useMemo(() => {
    const byScope = new Map<string, TenantDocumentProfile[]>()
    for (const profile of profiles) {
      const key = scopeKey(profile)
      const list = byScope.get(key) || []
      list.push(profile)
      byScope.set(key, list)
    }
    return [...byScope.values()].map(versions => {
      const sorted = [...versions].sort((a, b) => b.version - a.version)
      return { latest: sorted[0]!, versions: sorted }
    })
  }, [profiles])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'tenants', 'document-profiles', institutionId] })
  }

  const createMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof draftToPayload>) =>
      tenantAdminService.createDocumentProfile(institutionId, payload),
    onSuccess: () => {
      toast.success('Document profile saved')
      setDraft(EMPTY_DRAFT)
      invalidate()
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Document profile was not saved')),
  })

  const cloneMutation = useMutation({
    mutationFn: (profileId: string) => tenantAdminService.cloneDocumentProfile(institutionId, profileId),
    onSuccess: () => {
      toast.success('New version created from the latest')
      invalidate()
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Profile version was not created')),
  })

  const activeMutation = useMutation({
    mutationFn: ({ profileId, isActive }: { profileId: string; isActive: boolean }) =>
      tenantAdminService.updateDocumentProfile(institutionId, profileId, { is_active: isActive }),
    onSuccess: (_data, variables) => {
      toast.success(variables.isActive ? 'Version activated' : 'Version deactivated')
      invalidate()
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Version status was not changed')),
  })

  const previewProfile = useMemo(() => profiles.find(item => item.id === previewId) || null, [profiles, previewId])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const sectionKeys = draft.sections.map(row => row.key.trim()).filter(Boolean)
    if (sectionKeys.length === 0) {
      toast.error('Add at least one section')
      return
    }
    if (sectionKeys.length > TENANT_PROFILE_CAPS.maxSections) {
      toast.error(`A profile can have at most ${TENANT_PROFILE_CAPS.maxSections} sections`)
      return
    }
    createMutation.mutate(draftToPayload(draft))
  }

  // -- Structured editors ---------------------------------------------------

  const updateSection = (index: number, patch: Partial<SectionRow>) => {
    setDraft(prev => ({
      ...prev,
      sections: prev.sections.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }))
  }

  const addSection = () => {
    if (draft.sections.length >= TENANT_PROFILE_CAPS.maxSections) return
    setDraft(prev => ({ ...prev, sections: [...prev.sections, { key: '', value: '' }] }))
  }

  const removeSection = (index: number) => {
    setDraft(prev => ({ ...prev, sections: prev.sections.filter((_, i) => i !== index) }))
  }

  const addFeeRow = () => {
    if (draft.fee_chart.length >= TENANT_PROFILE_CAPS.maxFeeRows) return
    setDraft(prev => ({ ...prev, fee_chart: [...prev.fee_chart, { item: '', amount: 0, cadence: '' }] }))
  }

  const updateFeeRow = (index: number, patch: Partial<TenantProfileFeeRow>) => {
    setDraft(prev => ({
      ...prev,
      fee_chart: prev.fee_chart.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }))
  }

  const removeFeeRow = (index: number) => {
    setDraft(prev => ({ ...prev, fee_chart: prev.fee_chart.filter((_, i) => i !== index) }))
  }

  const addBankRow = () => {
    if (draft.bank_accounts.length >= TENANT_PROFILE_CAPS.maxBankAccounts) return
    setDraft(prev => ({ ...prev, bank_accounts: [...prev.bank_accounts, { bank_name: '', account_number: '' }] }))
  }

  const updateBankRow = (index: number, patch: Partial<TenantProfileBankAccount>) => {
    setDraft(prev => ({
      ...prev,
      bank_accounts: prev.bank_accounts.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }))
  }

  const removeBankRow = (index: number) => {
    setDraft(prev => ({ ...prev, bank_accounts: prev.bank_accounts.filter((_, i) => i !== index) }))
  }

  if (profilesQuery.isError) {
    return (
      <SectionCard
        title="Document profiles"
        description="Rich tenant document configuration for backend-generated official documents."
        icon={<FileStack className="h-5 w-5" />}
      >
        <ErrorDisplay message="Could not load this school's document profiles." onRetry={() => profilesQuery.refetch()} />
      </SectionCard>
    )
  }

  return (
    <SectionCard
      title="Document profiles"
      description="Rich, versioned document configuration (sections, fee charts, bank accounts, requirements, signatory) for backend-generated official documents. No MIHAS/KATC fallback — official documents read only this tenant data."
      icon={<FileStack className="h-5 w-5" />}
    >
      <form className="grid gap-4" onSubmit={handleSubmit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-foreground">Document type</span>
            <select
              value={draft.document_type}
              onChange={event => setDraft(prev => ({ ...prev, document_type: event.target.value }))}
              className={TENANT_SELECT_CLASS}
              aria-label="Profile document type"
            >
              {PROFILE_DOCUMENT_TYPES.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-foreground">Layout</span>
            <select
              value={draft.layout_key}
              onChange={event => setDraft(prev => ({ ...prev, layout_key: event.target.value }))}
              className={TENANT_SELECT_CLASS}
              aria-label="Profile layout"
            >
              {TENANT_PROFILE_LAYOUTS.map(layout => (
                <option key={layout} value={layout}>{LAYOUT_LABELS[layout] || layout}</option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="grid gap-3 rounded-lg border border-border/60 bg-muted/30 p-4 sm:grid-cols-3">
          <legend className="px-1 text-xs font-medium text-muted-foreground">Applies to (optional — most specific wins)</legend>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-foreground">Offering</span>
            <select
              value={draft.program_id}
              onChange={event => setDraft(prev => ({ ...prev, program_id: event.target.value }))}
              className={TENANT_SELECT_CLASS}
              aria-label="Applies to offering"
            >
              <option value="">Any offering</option>
              {offerings.map(offering => (
                <option key={offering.id} value={offering.id}>{offering.name} · {offering.code}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-foreground">Canonical program ID</span>
            <Input
              value={draft.canonical_program_id}
              onChange={event => setDraft(prev => ({ ...prev, canonical_program_id: event.target.value }))}
              placeholder="Optional UUID"
              aria-label="Applies to canonical program"
            />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-foreground">Intake ID</span>
            <Input
              value={draft.intake_id}
              onChange={event => setDraft(prev => ({ ...prev, intake_id: event.target.value }))}
              placeholder="Optional UUID"
              aria-label="Applies to intake"
            />
          </label>
        </fieldset>

        {/* Sections */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">Sections</p>
            <span className="text-xs text-muted-foreground">
              {draft.sections.length}/{TENANT_PROFILE_CAPS.maxSections} · ≤{TENANT_PROFILE_CAPS.maxSectionChars} chars each
            </span>
          </div>
          {draft.sections.map((row, index) => (
            <div key={index} className="space-y-2 rounded-lg border border-border bg-background p-3">
              <div className="flex items-center gap-2">
                <Input
                  value={row.key}
                  onChange={event => updateSection(index, { key: event.target.value })}
                  placeholder="Section key, e.g. body"
                  aria-label={`Section ${index + 1} key`}
                />
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => removeSection(index)}
                  aria-label={`Remove section ${index + 1}`}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
              <Textarea
                value={row.value}
                maxLength={TENANT_PROFILE_CAPS.maxSectionChars}
                onChange={event => updateSection(index, { value: event.target.value })}
                placeholder="Prose with safe tokens, e.g. Dear {{student_name}}, welcome to {{program}}."
                aria-label={`Section ${index + 1} content`}
                rows={4}
              />
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="xs" variant="outline" onClick={addSection} disabled={draft.sections.length >= TENANT_PROFILE_CAPS.maxSections}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add section
            </Button>
            <span className="text-xs text-muted-foreground">Tokens:</span>
            {PROFILE_TOKENS.map(token => (
              <span key={token} className="rounded-md border border-border/60 bg-muted px-2 py-1 text-xs font-medium text-foreground">
                {`{{${token}}}`}
              </span>
            ))}
          </div>
        </div>

        {/* Fee chart */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <ReceiptText className="h-4 w-4" aria-hidden="true" /> Fee chart
            </p>
            <span className="text-xs text-muted-foreground">{draft.fee_chart.length}/{TENANT_PROFILE_CAPS.maxFeeRows}</span>
          </div>
          {draft.fee_chart.map((row, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px_140px_auto]">
              <Input value={row.item} onChange={event => updateFeeRow(index, { item: event.target.value })} placeholder="Fee item" aria-label={`Fee row ${index + 1} item`} />
              <Input
                type="number"
                inputMode="decimal"
                value={String(row.amount ?? '')}
                onChange={event => updateFeeRow(index, { amount: Number(event.target.value) })}
                placeholder="Amount"
                aria-label={`Fee row ${index + 1} amount`}
              />
              <Input value={row.cadence ?? ''} onChange={event => updateFeeRow(index, { cadence: event.target.value })} placeholder="Cadence, optional" aria-label={`Fee row ${index + 1} cadence`} />
              <Button type="button" size="xs" variant="outline" onClick={() => removeFeeRow(index)} aria-label={`Remove fee row ${index + 1}`}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          ))}
          <Button type="button" size="xs" variant="outline" onClick={addFeeRow} disabled={draft.fee_chart.length >= TENANT_PROFILE_CAPS.maxFeeRows}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add fee row
          </Button>
        </div>

        {/* Bank accounts */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Banknote className="h-4 w-4" aria-hidden="true" /> Bank accounts
            </p>
            <span className="text-xs text-muted-foreground">{draft.bank_accounts.length}/{TENANT_PROFILE_CAPS.maxBankAccounts}</span>
          </div>
          {draft.bank_accounts.map((row, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <Input value={row.bank_name} onChange={event => updateBankRow(index, { bank_name: event.target.value })} placeholder="Bank name" aria-label={`Bank row ${index + 1} name`} />
              <Input value={row.account_number} onChange={event => updateBankRow(index, { account_number: event.target.value })} placeholder="Account number" aria-label={`Bank row ${index + 1} account number`} />
              <Button type="button" size="xs" variant="outline" onClick={() => removeBankRow(index)} aria-label={`Remove bank row ${index + 1}`}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          ))}
          <Button type="button" size="xs" variant="outline" onClick={addBankRow} disabled={draft.bank_accounts.length >= TENANT_PROFILE_CAPS.maxBankAccounts}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add bank account
          </Button>
        </div>

        {/* Requirements */}
        <TokenChips
          label={`Requirements (${draft.requirements.length}/${TENANT_PROFILE_CAPS.maxRequirements})`}
          values={draft.requirements}
          onChange={next => setDraft(prev => ({ ...prev, requirements: next.slice(0, TENANT_PROFILE_CAPS.maxRequirements) }))}
          placeholder="e.g. Bring original certificates"
        />

        {/* Signatory */}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-foreground">Signatory name</span>
            <Input value={draft.signatory_name} onChange={event => setDraft(prev => ({ ...prev, signatory_name: event.target.value }))} placeholder="Dr Solomon Musonda, MD" aria-label="Signatory name" />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-foreground">Signatory title</span>
            <Input value={draft.signatory_title} onChange={event => setDraft(prev => ({ ...prev, signatory_title: event.target.value }))} placeholder="Managing Director" aria-label="Signatory title" />
          </label>
        </div>

        <div className="flex justify-end">
          <Button type="submit" loading={createMutation.isPending}>
            <FileStack className="h-4 w-4" aria-hidden="true" /> Save profile
          </Button>
        </div>
      </form>

      {/* Existing profiles, grouped by scope */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Configured profiles</p>
        {!profilesQuery.isLoading && scopes.length === 0 ? (
          <EmptyState
            icon={<FileStack />}
            heading="No document profiles yet"
            description="Configure a profile above so this school can generate official documents from its own data."
          />
        ) : (
          scopes.map(({ latest, versions }) => (
            <div key={scopeKey(latest)} className="space-y-2 rounded-lg border border-border bg-background p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="break-words text-sm font-medium text-foreground">{latest.document_type}</p>
                    <StatusBadge tone="info" label={`v${latest.version}`} />
                    {latest.is_active === false && <StatusBadge tone="muted" label="Inactive" />}
                    <StatusBadge tone="muted" label={LAYOUT_LABELS[latest.layout_key] || latest.layout_key} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {scopeLabel(latest)} · {versions.length} version{versions.length === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="xs" variant="outline" onClick={() => cloneMutation.mutate(latest.id)} loading={cloneMutation.isPending}>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Clone latest
                  </Button>
                  <Button type="button" size="xs" variant="outline" onClick={() => setPreviewId(latest.id)}>
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Preview
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {versions.map(version => (
                  <div key={version.id} className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-xs">
                    <span className="font-medium text-foreground">v{version.version}</span>
                    {version.is_active === false ? (
                      <Button type="button" size="xs" variant="outline" onClick={() => activeMutation.mutate({ profileId: version.id, isActive: true })}>
                        <Power className="h-3 w-3" aria-hidden="true" /> Activate
                      </Button>
                    ) : (
                      <Button type="button" size="xs" variant="outline" onClick={() => activeMutation.mutate({ profileId: version.id, isActive: false })}>
                        <Power className="h-3 w-3" aria-hidden="true" /> Deactivate
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Preview */}
      {previewProfile && (
        <div className="space-y-3 rounded-lg border border-border/60 bg-muted/30 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Eye className="h-4 w-4" aria-hidden="true" /> Preview · {previewProfile.document_type} v{previewProfile.version}
            </p>
            <Button type="button" size="xs" variant="outline" onClick={() => setPreviewId('')}>Close</Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Preview only — official documents are generated by the backend with provenance. Tokens are filled with sample data.
          </p>
          <div className="space-y-3 rounded-md border border-border bg-background p-4 text-sm text-foreground">
            {Object.entries(previewProfile.sections || {}).map(([key, value]) => (
              <div key={key} className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{key}</p>
                <p className="whitespace-pre-wrap break-words">{renderProfilePreview(value) || '(empty)'}</p>
              </div>
            ))}
            {(previewProfile.fee_chart || []).length > 0 && (
              <div className="space-y-1">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <ReceiptText className="h-3.5 w-3.5" aria-hidden="true" /> Fees
                </p>
                <ul className="space-y-0.5">
                  {(previewProfile.fee_chart || []).map((row, index) => (
                    <li key={index} className="flex justify-between gap-3">
                      <span>{row.item}{row.cadence ? ` (${row.cadence})` : ''}</span>
                      <span className="font-mono">{row.amount}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(previewProfile.bank_accounts || []).length > 0 && (
              <div className="space-y-1">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Banknote className="h-3.5 w-3.5" aria-hidden="true" /> Bank accounts
                </p>
                <ul className="space-y-0.5">
                  {(previewProfile.bank_accounts || []).map((row, index) => (
                    <li key={index}>{row.bank_name} · <span className="font-mono">{row.account_number}</span></li>
                  ))}
                </ul>
              </div>
            )}
            {(previewProfile.requirements || []).length > 0 && (
              <div className="space-y-1">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <ListChecks className="h-3.5 w-3.5" aria-hidden="true" /> Requirements
                </p>
                <ul className="list-inside list-disc space-y-0.5">
                  {(previewProfile.requirements || []).map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  )
}
