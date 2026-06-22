/**
 * Tenant onboarding create / update / deactivate + asset-upload success/failure
 * state coverage for the Tenants admin UI (Phase 5, task 23.4).
 *
 * Spec: .kiro/specs/multi-tenant-beanola-admissions.
 * Requirement R14.8: "THE frontend test suite SHALL include … tenant
 * onboarding create/update/deactivate, asset upload success/failure …".
 *
 * These tests render the REAL `AdminTenants` page (`pages/admin/Tenants.tsx`,
 * task 23.1) against a mocked `tenantAdminService`, driving the actual
 * react-query mutations so we assert the page's wiring, not a reimplementation:
 *
 *   - CREATE   — a fresh school posts via `createInstitution`.
 *   - UPDATE   — editing a selected school PATCHes via `updateInstitution`.
 *   - DEACTIVATE — the Deactivate/Reactivate control PATCHes `is_active`.
 *   - ASSET UPLOAD — a file upload calls `uploadAsset`; success renders the
 *     success status banner, failure renders the error status banner
 *     (the asset upload success/failure state contract).
 *
 * The tenant sub-panels (offerings, routing, templates, settlement, audit) are
 * mocked to keep the test scoped to onboarding/asset state; they have their own
 * coverage (routingSimulatorPanel.test.tsx, tenantOnboarding.test.tsx).
 *
 * **Validates: Requirements R11.1, R11.2, R14.8**
 */
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

// ── Mock the tenant service so mutations resolve deterministically ────────
const createInstitution = vi.fn()
const updateInstitution = vi.fn()
const uploadAsset = vi.fn()
const createAsset = vi.fn()
const listInstitutions = vi.fn()
const listDomains = vi.fn()
const listAssets = vi.fn()
const listTemplates = vi.fn()
const listRequiredDocuments = vi.fn()
const listMemberships = vi.fn()
const listAccessGrants = vi.fn()

vi.mock('@/services/admin/tenants', () => ({
  tenantAdminService: {
    listInstitutions: (...a: unknown[]) => listInstitutions(...a),
    createInstitution: (...a: unknown[]) => createInstitution(...a),
    updateInstitution: (...a: unknown[]) => updateInstitution(...a),
    uploadAsset: (...a: unknown[]) => uploadAsset(...a),
    createAsset: (...a: unknown[]) => createAsset(...a),
    listDomains: (...a: unknown[]) => listDomains(...a),
    listAssets: (...a: unknown[]) => listAssets(...a),
    listTemplates: (...a: unknown[]) => listTemplates(...a),
    listRequiredDocuments: (...a: unknown[]) => listRequiredDocuments(...a),
    listMemberships: (...a: unknown[]) => listMemberships(...a),
    listAccessGrants: (...a: unknown[]) => listAccessGrants(...a),
  },
}))

// ── Mock toast so success/error notifications are observable + side-effect free
const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('@/hooks/useToast', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}))

// ── Mock capabilities so the switcher (enterprise-tenant-authority task 13.1)
// renders the Super_Admin console. The real CapabilityContext reads the backend
// Capability_Endpoint; here we assert the console wiring as a platform owner.
vi.mock('@/contexts/CapabilityContext', () => ({
  useCapabilities: () => ({
    isSuperAdmin: true,
    isTenantAdmin: false,
    capabilities: ['platform.asset.manage'],
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

// ── Mock the heavier sub-panels (covered elsewhere) to keep this test scoped
vi.mock('@/pages/admin/tenants/OfferingsPanel', () => ({ OfferingsPanel: () => null }))
vi.mock('@/pages/admin/tenants/RoutingSimulatorPanel', () => ({ RoutingSimulatorPanel: () => null }))
vi.mock('@/pages/admin/tenants/TemplatesPanel', () => ({ TemplatesPanel: () => null }))
vi.mock('@/pages/admin/tenants/SettlementPanel', () => ({ SettlementPanel: () => null }))
vi.mock('@/pages/admin/tenants/AuditPanel', () => ({ AuditPanel: () => null }))

import AdminTenants from '@/pages/admin/Tenants'

const MIHAS = {
  id: 'inst-mihas',
  name: 'MIHAS',
  code: 'MIHAS',
  full_name: 'Mukuba Institute of Health and Applied Sciences',
  brand_name: 'MIHAS Admissions',
  is_active: true,
}

function emptyDetail() {
  listDomains.mockResolvedValue([])
  listAssets.mockResolvedValue([])
  listTemplates.mockResolvedValue([])
  listRequiredDocuments.mockResolvedValue([])
  listMemberships.mockResolvedValue([])
  listAccessGrants.mockResolvedValue([])
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AdminTenants />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  emptyDetail()
})

afterEach(() => {
  cleanup()
})

describe('tenant onboarding — create', () => {
  it('posts a new school via createInstitution when no school is selected', async () => {
    // No schools yet → the form is in "New school" / create mode.
    listInstitutions.mockResolvedValue({ institutions: [], totalCount: 0 })
    createInstitution.mockResolvedValue({ ...MIHAS, id: 'inst-new' })

    const { getByLabelText, getByRole, findByText } = renderPage()
    await findByText('New school')

    fireEvent.change(getByLabelText('Short name'), { target: { value: 'New School' } })
    fireEvent.change(getByLabelText('Institution code'), { target: { value: 'new' } })
    fireEvent.click(getByRole('button', { name: /create school/i }))

    await waitFor(() => expect(createInstitution).toHaveBeenCalledTimes(1))
    const payload = createInstitution.mock.calls[0]![0] as Record<string, unknown>
    expect(payload.name).toBe('New School')
    // Code is upper-cased and a slug is derived.
    expect(payload.code).toBe('NEW')
    expect(payload.slug).toBe('new')
    expect(updateInstitution).not.toHaveBeenCalled()
    expect(toastSuccess).toHaveBeenCalled()
  })

  it('blocks submit and warns when name or code is missing', async () => {
    listInstitutions.mockResolvedValue({ institutions: [], totalCount: 0 })

    const { getByRole, findByText } = renderPage()
    await findByText('New school')

    fireEvent.click(getByRole('button', { name: /create school/i }))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Name and code are required'))
    expect(createInstitution).not.toHaveBeenCalled()
  })
})

describe('tenant onboarding — update', () => {
  it('PATCHes the selected school via updateInstitution', async () => {
    listInstitutions.mockResolvedValue({ institutions: [MIHAS], totalCount: 1 })
    updateInstitution.mockResolvedValue({ ...MIHAS })

    const { getByLabelText, getByRole, findByText } = renderPage()
    // Auto-selected first school → form is in edit mode ("Save school").
    await findByText('School profile')

    fireEvent.change(getByLabelText('Brand name'), { target: { value: 'MIHAS Renamed' } })
    fireEvent.click(getByRole('button', { name: /save school/i }))

    await waitFor(() => expect(updateInstitution).toHaveBeenCalledTimes(1))
    const [id, data] = updateInstitution.mock.calls[0] as [string, Record<string, unknown>]
    expect(id).toBe('inst-mihas')
    expect(data.brand_name).toBe('MIHAS Renamed')
    expect(createInstitution).not.toHaveBeenCalled()
  })
})

describe('tenant onboarding — deactivate', () => {
  it('toggles is_active=false via updateInstitution for an active school', async () => {
    listInstitutions.mockResolvedValue({ institutions: [MIHAS], totalCount: 1 })
    updateInstitution.mockResolvedValue({ ...MIHAS, is_active: false })

    const { getByRole, findByText } = renderPage()
    await findByText('School profile')

    fireEvent.click(getByRole('button', { name: /deactivate/i }))

    await waitFor(() => expect(updateInstitution).toHaveBeenCalledTimes(1))
    const [id, data] = updateInstitution.mock.calls[0] as [string, Record<string, unknown>]
    expect(id).toBe('inst-mihas')
    expect(data).toEqual({ is_active: false })
    expect(toastSuccess).toHaveBeenCalledWith('School deactivated')
  })

  it('reactivates an inactive school via updateInstitution with is_active=true', async () => {
    const inactive = { ...MIHAS, is_active: false }
    listInstitutions.mockResolvedValue({ institutions: [inactive], totalCount: 1 })
    updateInstitution.mockResolvedValue({ ...inactive, is_active: true })

    const { getByRole, findByText } = renderPage()
    await findByText('School profile')

    fireEvent.click(getByRole('button', { name: /reactivate/i }))

    await waitFor(() => expect(updateInstitution).toHaveBeenCalledTimes(1))
    const [, data] = updateInstitution.mock.calls[0] as [string, Record<string, unknown>]
    expect(data).toEqual({ is_active: true })
    expect(toastSuccess).toHaveBeenCalledWith('School reactivated')
  })
})

describe('tenant onboarding — asset upload state', () => {
  async function gotoAssetsTab() {
    listInstitutions.mockResolvedValue({ institutions: [MIHAS], totalCount: 1 })
    const utils = renderPage()
    await utils.findByText('School profile')
    // Asset management lives under the "Branding" tab in the Super_Admin console
    // (TenantBrandingPanel) after the enterprise-tenant-authority console split.
    const brandingTab = utils.getByRole('tab', { name: /branding/i })
    // Radix tabs activate on pointer-down, not click alone, under jsdom.
    fireEvent.mouseDown(brandingTab)
    fireEvent.click(brandingTab)
    await utils.findByText(/Upload versioned logos/i)
    return utils
  }

  it('uploads a file via uploadAsset and renders the success status banner', async () => {
    uploadAsset.mockResolvedValue({ id: 'asset-1', asset_type: 'logo', mime_type: 'image/png', version: 1 })

    const { getByLabelText, getByRole, findByText } = await gotoAssetsTab()

    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'logo.png', { type: 'image/png' })
    fireEvent.change(getByLabelText('Asset file'), { target: { files: [file] } })
    fireEvent.click(getByRole('button', { name: /upload asset/i }))

    await waitFor(() => expect(uploadAsset).toHaveBeenCalledTimes(1))
    const [institutionId, payload] = uploadAsset.mock.calls[0] as [string, { asset_type: string; file: File }]
    expect(institutionId).toBe('inst-mihas')
    expect(payload.asset_type).toBe('logo')
    expect(payload.file).toBe(file)

    // Success status banner is rendered (role=status), not just a toast.
    const banner = await findByText('Asset registered and validated.')
    expect(banner).toBeTruthy()
    expect(toastSuccess).toHaveBeenCalledWith('Asset registered')
  })

  it('renders the error status banner when uploadAsset rejects (validation failure)', async () => {
    // Backend rejects a mismatched/oversized asset with a stable-code error.
    uploadAsset.mockRejectedValue(
      Object.assign(new Error('Asset failed magic-byte validation.'), { status: 400, code: 'ASSET_INVALID' }),
    )

    const { getByLabelText, getByRole, findByText } = await gotoAssetsTab()

    const file = new File([new Uint8Array([0x00, 0x01])], 'fake.png', { type: 'image/png' })
    fireEvent.change(getByLabelText('Asset file'), { target: { files: [file] } })
    fireEvent.click(getByRole('button', { name: /upload asset/i }))

    await waitFor(() => expect(uploadAsset).toHaveBeenCalledTimes(1))

    // The error status banner surfaces the backend message (not a generic one).
    const banner = await findByText('Asset failed magic-byte validation.')
    expect(banner).toBeTruthy()
    expect(toastError).toHaveBeenCalledWith('Asset failed magic-byte validation.')
  })

  it('warns and does not call the service when neither file nor manual fields are provided', async () => {
    const { getByRole, findByText } = await gotoAssetsTab()

    // No file selected and no storage key/checksum → the "Register asset" path.
    fireEvent.click(getByRole('button', { name: /register asset/i }))

    await findByText('School profile')
    expect(uploadAsset).not.toHaveBeenCalled()
    expect(createAsset).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith('Upload a file or provide storage key and checksum')
  })
})
