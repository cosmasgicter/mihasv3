/**
 * Tenant onboarding wizard — integration test
 * (enterprise-tenant-authority, task 15.2).
 *
 * Drives the REAL `TenantOnboardingWizard`
 * (`pages/admin/tenants/TenantOnboardingWizard.tsx`, task 15.1) end to end
 * against a mocked `tenantAdminService` + `userService`, exercising the actual
 * react-query mutations so we assert the wizard's wiring — not a
 * reimplementation. The flow proves the acceptance behaviour for task 15.2:
 *
 *   - Completing the wizard persists the tenant + its configuration through the
 *     admin tenant APIs with NO manual database edit (R14.2 / R16.1).
 *   - The new tenant surfaces in the console list immediately: every
 *     persistence step invalidates the `['admin','tenants']` React Query prefix,
 *     and finishing navigates back to `/admin/tenants` (R14.3).
 *   - The invited tenant-admin is created as an `admin` user and scoped to the
 *     NEW institution via a membership — never platform-wide (R16.2).
 *
 * Mocking pattern mirrors `tests/unit/tenantOnboardingState.test.tsx`
 * (CapabilityContext as Super_Admin + tenantAdminService + toast), extended
 * with `userService.create` and a `react-router` `useNavigate` spy.
 *
 * Validates: Requirements 14.2, 14.3, 16.1, 16.2
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
const createMembership = vi.fn()
const uploadAsset = vi.fn()
const listDomains = vi.fn()
const listTemplates = vi.fn()
const listRequiredDocuments = vi.fn()
const listOfferings = vi.fn()
const listMemberships = vi.fn()
const listAssets = vi.fn()
const listDocumentProfiles = vi.fn()
const getReadiness = vi.fn()

vi.mock('@/services/admin/tenants', () => ({
  tenantAdminService: {
    createInstitution: (...a: unknown[]) => createInstitution(...a),
    updateInstitution: (...a: unknown[]) => updateInstitution(...a),
    createDomain: (...a: unknown[]) => createDomain(...a),
    activateDomain: (...a: unknown[]) => activateDomain(...a),
    createTemplate: (...a: unknown[]) => createTemplate(...a),
    createRequiredDocument: (...a: unknown[]) => createRequiredDocument(...a),
    createMembership: (...a: unknown[]) => createMembership(...a),
    uploadAsset: (...a: unknown[]) => uploadAsset(...a),
    listDomains: (...a: unknown[]) => listDomains(...a),
    listTemplates: (...a: unknown[]) => listTemplates(...a),
    listRequiredDocuments: (...a: unknown[]) => listRequiredDocuments(...a),
    listOfferings: (...a: unknown[]) => listOfferings(...a),
    listMemberships: (...a: unknown[]) => listMemberships(...a),
    listAssets: (...a: unknown[]) => listAssets(...a),
    listDocumentProfiles: (...a: unknown[]) => listDocumentProfiles(...a),
    getReadiness: (...a: unknown[]) => getReadiness(...a),
  },
}))

// ── userService — only `create` is used by the invite step ────────────────
const userCreate = vi.fn()
vi.mock('@/services/admin/users', () => ({
  userService: { create: (...a: unknown[]) => userCreate(...a) },
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
  listOfferings.mockResolvedValue([{ id: 'off-1', name: 'Clinical Medicine', code: 'CM', is_active: true }])
  listMemberships.mockResolvedValue([])
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
  userCreate.mockResolvedValue({ user: { id: 'user-admin-1' } })
  createMembership.mockResolvedValue({
    id: 'mem-1',
    user_id: 'user-admin-1',
    institution_id: NEW_ID,
    role: 'admin',
  })
})

afterEach(() => {
  cleanup()
})

describe('TenantOnboardingWizard — end-to-end onboarding (task 15.2)', () => {
  it('persists the tenant + domain, scopes the invited tenant-admin, and refreshes + navigates to the console', async () => {
    const { getByLabelText, getByRole, findByLabelText, findByRole, invalidateSpy } = renderWizard()

    // ── Step 1: institution profile → createInstitution (R14.2 / R16.1) ──
    fireEvent.change(getByLabelText('Short name'), { target: { value: 'New School' } })
    fireEvent.change(getByLabelText('Institution code'), { target: { value: 'new' } })
    fireEvent.click(getByRole('button', { name: /create institution & continue/i }))

    await waitFor(() => expect(createInstitution).toHaveBeenCalledTimes(1))
    const createPayload = createInstitution.mock.calls[0]![0] as Record<string, unknown>
    expect(createPayload.name).toBe('New School')
    expect(createPayload.code).toBe('NEW') // code is upper-cased
    expect(createPayload.is_active).toBe(true)

    // The new tenant is surfaced to the list immediately (R14.3): the create
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

    // ── Advance Domains → … → Tenant-admin invite (5 Next clicks) ───────
    // domains(2) → templates(3) → documents(4) → programs(5) → intakes(6) → invite(7)
    for (let i = 0; i < 5; i += 1) {
      fireEvent.click(getByRole('button', { name: 'Next' }))
    }

    // ── Step: invite → userService.create({role:'admin'}) + scoped membership (R16.2) ──
    fireEvent.change(await findByLabelText('Tenant admin full name'), { target: { value: 'Ada Lovelace' } })
    fireEvent.change(getByLabelText('Tenant admin email'), { target: { value: 'admin@newschool.edu.zm' } })
    fireEvent.change(getByLabelText('Tenant admin initial password'), { target: { value: 'supersecret1' } })
    fireEvent.click(getByRole('button', { name: /create tenant admin/i }))

    // The user is created as a generic `admin`…
    await waitFor(() => expect(userCreate).toHaveBeenCalledTimes(1))
    const invitePayload = userCreate.mock.calls[0]![0] as Record<string, unknown>
    expect(invitePayload).toMatchObject({ role: 'admin', email: 'admin@newschool.edu.zm' })

    // …then scoped to the NEW tenant via a membership — never platform-wide (R16.2).
    await waitFor(() => expect(createMembership).toHaveBeenCalledTimes(1))
    const membershipPayload = createMembership.mock.calls[0]![0] as Record<string, unknown>
    expect(membershipPayload).toMatchObject({
      user_id: 'user-admin-1',
      institution_id: NEW_ID,
      role: 'admin',
      is_active: true,
    })

    // ── Advance invite → review, then finish ────────────────────────────
    fireEvent.click(getByRole('button', { name: 'Next' })) // invite → review
    fireEvent.click(await findByRole('button', { name: /finish onboarding/i }))

    // Finishing returns to the console with a fresh list (R14.3).
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/admin/tenants'))
    expect(invalidateSpy).toHaveBeenCalledWith(TENANTS_KEY)

    // No manual DB edit path was needed — everything went through the admin APIs.
    expect(toastError).not.toHaveBeenCalled()
  })
})
