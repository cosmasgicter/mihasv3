/**
 * Tenant onboarding wizard — integration test.
 *
 * Drives the REAL `TenantOnboardingWizard`
 * (`pages/admin/tenants/TenantOnboardingWizard.tsx`) end to end against a mocked
 * `tenantAdminService` + `catalogService`, exercising the actual react-query
 * mutations so we assert the wizard's wiring — not a reimplementation.
 *
 * Updated for admissions-v2-canonical-rebuild:
 *   - task 4.2 replaced the fragile create-user + separate-membership invite
 *     (with an operator-set initial password) with ONE atomic
 *     `tenantAdminService.inviteStaff` command — invite by email only; the admin
 *     never sets or sees a password (TEN-01). This test asserts that contract.
 *   - task 4.3 turned the former Program / Intake placeholders into real
 *     canonical-mutation steps and added Fees + Routing-simulation steps
 *     (TEN-02/03). The end-to-end walk therefore steps through the extra steps
 *     to reach the invite step; the catalog reads those steps fire are mocked.
 *
 * The flow proves:
 *   - Completing the wizard persists the tenant + its configuration through the
 *     admin tenant APIs with NO manual database edit (R4.2).
 *   - The new tenant surfaces in the console list immediately: every
 *     persistence step invalidates the `['admin','tenants']` React Query prefix,
 *     and finishing navigates back to `/admin/tenants` (R4.6).
 *   - The invited tenant-admin is invited by email as an `admin` scoped to the
 *     NEW institution — never platform-wide — via the atomic handoff (R4.3).
 *
 * Validates: Requirements 4.2, 4.3, 4.6
 */
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

const NEW_ID = 'inst-new-001'

// ── react-router: keep MemoryRouter real, spy on navigation ───────────────
const navigateMock = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigateMock }
})

// ── tenantAdminService — every method the wizard touches ──────────────────
const createInstitution = vi.fn()
const updateInstitution = vi.fn()
const createDomain = vi.fn()
const activateDomain = vi.fn()
const createTemplate = vi.fn()
const createRequiredDocument = vi.fn()
const inviteStaff = vi.fn()
const uploadAsset = vi.fn()
const listDomains = vi.fn()
const listTemplates = vi.fn()
const listRequiredDocuments = vi.fn()
const listOfferings = vi.fn()
const listMemberships = vi.fn()
const listAssets = vi.fn()
const listDocumentProfiles = vi.fn()
const getReadiness = vi.fn()
const listProgramFees = vi.fn()

vi.mock('@/services/admin/tenants', () => ({
  tenantAdminService: {
    createInstitution: (...a: unknown[]) => createInstitution(...a),
    updateInstitution: (...a: unknown[]) => updateInstitution(...a),
    createDomain: (...a: unknown[]) => createDomain(...a),
    activateDomain: (...a: unknown[]) => activateDomain(...a),
    createTemplate: (...a: unknown[]) => createTemplate(...a),
    createRequiredDocument: (...a: unknown[]) => createRequiredDocument(...a),
    inviteStaff: (...a: unknown[]) => inviteStaff(...a),
    uploadAsset: (...a: unknown[]) => uploadAsset(...a),
    listDomains: (...a: unknown[]) => listDomains(...a),
    listTemplates: (...a: unknown[]) => listTemplates(...a),
    listRequiredDocuments: (...a: unknown[]) => listRequiredDocuments(...a),
    listOfferings: (...a: unknown[]) => listOfferings(...a),
    listMemberships: (...a: unknown[]) => listMemberships(...a),
    listAssets: (...a: unknown[]) => listAssets(...a),
    listDocumentProfiles: (...a: unknown[]) => listDocumentProfiles(...a),
    getReadiness: (...a: unknown[]) => getReadiness(...a),
    listProgramFees: (...a: unknown[]) => listProgramFees(...a),
  },
}))

// ── catalogService — canonical program + intake selectors (task 4.3 steps) ─
const getCanonicalPrograms = vi.fn()
const getIntakes = vi.fn()
vi.mock('@/services/catalog', () => ({
  catalogService: {
    getCanonicalPrograms: (...a: unknown[]) => getCanonicalPrograms(...a),
    getIntakes: (...a: unknown[]) => getIntakes(...a),
  },
}))

// ── toast — observable + side-effect free ─────────────────────────────────
const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('@/hooks/useToast', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}))

// ── capabilities — render as a Super_Admin (the only authorized actor) ────
vi.mock('@/contexts/CapabilityContext', () => ({
  useCapabilities: () => ({
    isSuperAdmin: true,
    isTenantAdmin: false,
    capabilities: ['platform.tenant.create'],
    institutionCapabilities: {},
    selectedInstitutionId: null,
    setSelectedInstitutionId: () => {},
    can: () => true,
    canForInstitution: () => true,
    noAccess: false,
    isLoading: false,
  }),
  CapabilityProvider: ({ children }: { children: ReactNode }) => children,
}))

import { TenantOnboardingWizard } from '@/pages/admin/tenants/TenantOnboardingWizard'

const TENANTS_KEY = { queryKey: ['admin', 'tenants'] }

function renderWizard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/admin/tenants/new']}>
        <TenantOnboardingWizard />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { ...utils, queryClient, invalidateSpy }
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  // Reads enabled once the institution exists — keep them deterministic/empty.
  listDomains.mockResolvedValue([])
  listTemplates.mockResolvedValue([])
  listRequiredDocuments.mockResolvedValue([])
  listOfferings.mockResolvedValue([{ id: 'off-1', name: 'Clinical Medicine', code: 'CM', canonical_program_id: 'canon-1', is_active: true }])
  listMemberships.mockResolvedValue([])
  listProgramFees.mockResolvedValue([])
  getCanonicalPrograms.mockResolvedValue({ programs: [{ id: 'canon-1', name: 'Clinical Medicine', code: 'CANON-CM' }] })
  getIntakes.mockResolvedValue({ intakes: [{ id: 'intake-1', name: 'January 2027' }] })
  listAssets.mockResolvedValue([
    { id: 'asset-logo', asset_type: 'logo', storage_key: 'logo.png', mime_type: 'image/png', is_active: true },
    { id: 'asset-signature', asset_type: 'signature', storage_key: 'signature.png', mime_type: 'image/png', is_active: true },
  ])
  listDocumentProfiles.mockResolvedValue([
    { id: 'profile-1', document_type: 'acceptance_letter', layout_key: 'fee_chart_letter', version: 1, is_active: true },
  ])
  getReadiness.mockResolvedValue({
    institution_id: NEW_ID,
    launch_ready: true,
    items: [
      { key: 'logo', label: 'Logo asset', ready: true, count: 1, blocking: true, message: 'Active logo configured' },
      { key: 'signature', label: 'Signature asset', ready: true, count: 1, blocking: true, message: 'Active signature configured' },
      { key: 'document_profile', label: 'Document profile', ready: true, count: 1, blocking: true, message: 'Active official-document profile configured' },
      { key: 'program_offering', label: 'Program offerings', ready: true, count: 1, blocking: true, message: 'At least one active offering is assigned' },
      { key: 'tenant_admin', label: 'Tenant admin', ready: true, count: 1, blocking: true, message: 'Scoped tenant admin is available' },
    ],
  })
  // Writes resolve to realistic shapes the wizard consumes.
  createInstitution.mockResolvedValue({ id: NEW_ID, name: 'New School', code: 'NEW' })
  createDomain.mockResolvedValue({
    id: 'dom-1',
    institution_id: NEW_ID,
    hostname: 'apply.newschool.edu.zm',
    status: 'pending_dns',
  })
  // Atomic invite handoff (task 4.2): one command, no returned credential.
  inviteStaff.mockResolvedValue({
    id: 'invite-1',
    institution_id: NEW_ID,
    email: 'admin@newschool.edu.zm',
    invited_role: 'admin',
    status: 'pending',
  })
})

afterEach(() => {
  cleanup()
})

describe('TenantOnboardingWizard — end-to-end onboarding', () => {
  it('persists the tenant + domain, invites a scoped tenant-admin by email, and refreshes + navigates to the console', async () => {
    const { getByLabelText, getByRole, findByLabelText, findByRole, invalidateSpy } = renderWizard()

    // ── Step 1: institution profile → createInstitution (R4.2) ──────────
    fireEvent.change(getByLabelText('Short name'), { target: { value: 'New School' } })
    fireEvent.change(getByLabelText('Institution code'), { target: { value: 'new' } })
    fireEvent.click(getByRole('button', { name: /create institution & continue/i }))

    await waitFor(() => expect(createInstitution).toHaveBeenCalledTimes(1))
    const createPayload = createInstitution.mock.calls[0]![0] as Record<string, unknown>
    expect(createPayload.name).toBe('New School')
    expect(createPayload.code).toBe('NEW') // code is upper-cased

    // The new tenant is surfaced to the list immediately (R4.6): the create
    // success handler invalidates the console's ['admin','tenants'] prefix.
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith(TENANTS_KEY))

    // Creating advances to the branding step. Advance to Domains.
    fireEvent.click(getByRole('button', { name: 'Next' })) // branding → domains

    // ── Step: domains → createDomain scoped to the new institution ──────
    const hostInput = await findByLabelText('Domain hostname')
    fireEvent.change(hostInput, { target: { value: 'apply.newschool.edu.zm' } })
    fireEvent.click(getByRole('button', { name: 'Add domain' }))

    await waitFor(() => expect(createDomain).toHaveBeenCalledTimes(1))
    const [domainInstId, domainPayload] = createDomain.mock.calls[0] as [string, Record<string, unknown>]
    expect(domainInstId).toBe(NEW_ID)
    expect(domainPayload).toMatchObject({ hostname: 'apply.newschool.edu.zm' })

    // ── Advance Domains → … → Tenant-admin invite ──────────────────────
    // domains(2) → templates(3) → documents(4) → programs(5) → intakes(6)
    // → fees(7) → routing(8) → invite(9): 7 Next clicks (task 4.3 added the
    // fees + routing steps between intakes and invite).
    for (let i = 0; i < 7; i += 1) {
      fireEvent.click(getByRole('button', { name: 'Next' }))
    }

    // ── Step: invite → atomic inviteStaff({role:'admin'}) by email (R4.3) ──
    fireEvent.change(await findByLabelText('Tenant admin full name'), { target: { value: 'Ada Lovelace' } })
    fireEvent.change(getByLabelText('Tenant admin email'), { target: { value: 'admin@newschool.edu.zm' } })
    fireEvent.click(getByRole('button', { name: /send invitation/i }))

    // One atomic command: identity + invitation + membership scoped to the NEW
    // tenant, invited as `admin` — never platform-wide, and no password is set
    // or returned to the operator (R4.3, TEN-01).
    await waitFor(() => expect(inviteStaff).toHaveBeenCalledTimes(1))
    const invitePayload = inviteStaff.mock.calls[0]![0] as Record<string, unknown>
    expect(invitePayload).toMatchObject({
      institution_id: NEW_ID,
      email: 'admin@newschool.edu.zm',
      role: 'admin',
    })
    // The atomic handoff never carries a password field (TEN-01).
    expect('password' in invitePayload).toBe(false)

    // ── Advance invite → review, then finish ────────────────────────────
    fireEvent.click(getByRole('button', { name: 'Next' })) // invite → review
    fireEvent.click(await findByRole('button', { name: /finish onboarding/i }))

    // Finishing returns to the console with a fresh list (R4.6).
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/admin/tenants'))
    expect(invalidateSpy).toHaveBeenCalledWith(TENANTS_KEY)

    // No manual DB edit path was needed — everything went through the admin APIs.
    expect(toastError).not.toHaveBeenCalled()
  })
})
