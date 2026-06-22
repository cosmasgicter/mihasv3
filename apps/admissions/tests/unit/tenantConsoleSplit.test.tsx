/**
 * Authority-specific tenant console split coverage (enterprise-tenant-authority,
 * task 13.3).
 *
 * Spec: .kiro/specs/enterprise-tenant-authority.
 *
 * These tests render the REAL `AdminTenants` switcher (`pages/admin/Tenants.tsx`)
 * and the REAL `TenantListPanel` / `PanelStateError` (panelStates.tsx) against a
 * mocked `@/contexts/CapabilityContext` (to drive each authority mode) and a
 * mocked `@/services/admin/tenants` (so list/detail reads resolve
 * deterministically). They assert the console *wiring*, not a reimplementation:
 *
 *   1. Super_Admin  — the console lists ALL tenants and shows the
 *      "New institution" control gated on `platform.tenant.create` (R12.2).
 *   2. Tenant_Admin — the school console shows ONLY the assigned institution(s)
 *      and NO "New institution" control (R12.3, R12.4).
 *   3. Backend 403  — a panel fed a rejected `tenantAdminService` query (and the
 *      `TenantListPanel`/`PanelStateError` directly) renders the precise
 *      authorization message and NO tenant data (R12.7).
 *
 * The heavier authority-specific sub-panels (domains, offerings, branding,
 * documents, staff, audit, …) are mocked to keep these tests scoped to the
 * switcher + tenant list; they have their own coverage. `TenantListPanel` and
 * `panelStates` stay REAL because they are under test here.
 *
 * **Validates: Requirements R12.2, R12.3, R12.4, R12.7**
 */
import { render, cleanup, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

import type { CapabilityValue } from '@/contexts/CapabilityContext'

// ── Mutable capability holder so each test can drive the authority mode the
// switcher reads. `vi.hoisted` makes it available inside the hoisted vi.mock
// factory below.
const { capabilityState } = vi.hoisted(() => ({
  capabilityState: { current: null as unknown as CapabilityValue },
}))

vi.mock('@/contexts/CapabilityContext', () => ({
  useCapabilities: () => capabilityState.current,
  CapabilityProvider: ({ children }: { children: ReactNode }) => children,
}))

// ── Mock the tenant service so list + detail reads resolve deterministically.
const listInstitutions = vi.fn()
const listDomains = vi.fn()
const listAssets = vi.fn()
const listTemplates = vi.fn()
const listRequiredDocuments = vi.fn()
const listMemberships = vi.fn()
const listAccessGrants = vi.fn()
const listDocumentProfiles = vi.fn()
const createInstitution = vi.fn()
const updateInstitution = vi.fn()

vi.mock('@/services/admin/tenants', () => ({
  tenantAdminService: {
    listInstitutions: (...a: unknown[]) => listInstitutions(...a),
    listDomains: (...a: unknown[]) => listDomains(...a),
    listAssets: (...a: unknown[]) => listAssets(...a),
    listTemplates: (...a: unknown[]) => listTemplates(...a),
    listRequiredDocuments: (...a: unknown[]) => listRequiredDocuments(...a),
    listMemberships: (...a: unknown[]) => listMemberships(...a),
    listAccessGrants: (...a: unknown[]) => listAccessGrants(...a),
    listDocumentProfiles: (...a: unknown[]) => listDocumentProfiles(...a),
    createInstitution: (...a: unknown[]) => createInstitution(...a),
    updateInstitution: (...a: unknown[]) => updateInstitution(...a),
  },
}))

// ── Toast is a side-effecting singleton — stub it.
vi.mock('@/hooks/useToast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

// ── Mock the heavier authority-specific sub-panels (covered elsewhere) so the
// auto-selected tenant doesn't drag in their own queries. TenantListPanel and
// panelStates are intentionally left REAL — they are under test.
vi.mock('@/pages/admin/tenants/ProfilesPanel', () => ({ ProfilesPanel: () => null }))
vi.mock('@/pages/admin/tenants/RoutingSimulatorPanel', () => ({ RoutingSimulatorPanel: () => null }))
vi.mock('@/pages/admin/tenants/SettlementPanel', () => ({ SettlementPanel: () => null }))
vi.mock('@/pages/admin/tenants/TemplatesPanel', () => ({ TemplatesPanel: () => null }))
vi.mock('@/pages/admin/tenants/OfferingsPanel', () => ({ OfferingsPanel: () => null }))
vi.mock('@/pages/admin/tenants/AuditPanel', () => ({ AuditPanel: () => null }))
vi.mock('@/pages/admin/tenants/TenantAccessGrantsPanel', () => ({ TenantAccessGrantsPanel: () => null }))
vi.mock('@/pages/admin/tenants/TenantAuditPanel', () => ({ TenantAuditPanel: () => null }))
vi.mock('@/pages/admin/tenants/TenantBrandingPanel', () => ({ TenantBrandingPanel: () => null }))
vi.mock('@/pages/admin/tenants/TenantDocumentsPanel', () => ({ TenantDocumentsPanel: () => null }))
vi.mock('@/pages/admin/tenants/TenantDomainPanel', () => ({ TenantDomainPanel: () => null }))
vi.mock('@/pages/admin/tenants/TenantProgramsPanel', () => ({ TenantProgramsPanel: () => null }))
vi.mock('@/pages/admin/tenants/TenantStaffPanel', () => ({ TenantStaffPanel: () => null }))

import AdminTenants from '@/pages/admin/Tenants'
import { TenantListPanel } from '@/pages/admin/tenants/TenantListPanel'

// ── Fixtures ──────────────────────────────────────────────────────────────
const MIHAS = {
  id: 'inst-mihas',
  name: 'MIHAS',
  code: 'MIHAS',
  full_name: 'Mukuba Institute of Health and Applied Sciences',
  brand_name: 'MIHAS Admissions',
  is_active: true,
}

const KATC = {
  id: 'inst-katc',
  name: 'KATC',
  code: 'KATC',
  full_name: 'Kasama Agricultural Training College',
  brand_name: 'KATC Admissions',
  is_active: true,
}

const PLATFORM_CAPS = [
  'platform.tenant.read_all',
  'platform.tenant.create',
  'platform.tenant.update',
  'platform.tenant.deactivate',
]

function superAdminCaps(): CapabilityValue {
  return {
    isSuperAdmin: true,
    isTenantAdmin: false,
    capabilities: PLATFORM_CAPS,
    institutionCapabilities: {},
    selectedInstitutionId: null,
    setSelectedInstitutionId: vi.fn(),
    can: (capability: string) => PLATFORM_CAPS.includes(capability),
    canForInstitution: () => true,
    noAccess: false,
    isLoading: false,
  }
}

// A tenant-admin scoped to MIHAS only, with the tenant.* read bundle.
const MIHAS_TENANT_CAPS = [
  'tenant.profile.read',
  'tenant.domain.read',
  'tenant.program.read',
  'tenant.document.read',
  'tenant.staff.read',
  'tenant.audit.read',
]

function tenantAdminCaps(): CapabilityValue {
  const institutionCapabilities: Record<string, string[]> = { [MIHAS.id]: MIHAS_TENANT_CAPS }
  return {
    isSuperAdmin: false,
    isTenantAdmin: true,
    capabilities: [],
    institutionCapabilities,
    selectedInstitutionId: MIHAS.id,
    setSelectedInstitutionId: vi.fn(),
    // tenant-admin can() resolves against the (single) scoped institution.
    can: (capability: string) => MIHAS_TENANT_CAPS.includes(capability),
    canForInstitution: (institutionId: string, capability: string) =>
      institutionCapabilities[institutionId]?.includes(capability) ?? false,
    noAccess: false,
    isLoading: false,
  }
}

function emptyDetail() {
  listDomains.mockResolvedValue([])
  listAssets.mockResolvedValue([])
  listTemplates.mockResolvedValue([])
  listRequiredDocuments.mockResolvedValue([])
  listMemberships.mockResolvedValue([])
  listAccessGrants.mockResolvedValue([])
  listDocumentProfiles.mockResolvedValue([])
}

function renderTree(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
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

// ── 1. Super_Admin: all tenants + "New institution" control (R12.2) ─────────
describe('console split — Super_Admin', () => {
  beforeEach(() => {
    capabilityState.current = superAdminCaps()
  })

  it('R12.2: lists ALL tenants and shows the "New institution" create control', async () => {
    listInstitutions.mockResolvedValue({ institutions: [MIHAS, KATC], totalCount: 2 })

    const { findByText, getByText, getByRole } = renderTree(<AdminTenants />)

    // Both onboarded schools appear in the platform-wide tenant list.
    expect(await findByText('MIHAS Admissions')).toBeTruthy()
    expect(getByText('KATC Admissions')).toBeTruthy()

    // The create control is rendered for a platform owner holding
    // `platform.tenant.create` (exact match avoids the "New institution
    // (wizard)" launcher button).
    expect(getByRole('button', { name: /^New institution$/ })).toBeTruthy()
  })

  it('R12.2: hides the "New institution" control when platform.tenant.create is absent', async () => {
    // A super-admin view without the create capability must not surface the
    // create control (capability gating, not role gating).
    capabilityState.current = { ...superAdminCaps(), can: () => false }
    listInstitutions.mockResolvedValue({ institutions: [MIHAS, KATC], totalCount: 2 })

    const { findByText, queryByRole } = renderTree(<AdminTenants />)
    await findByText('MIHAS Admissions')

    expect(queryByRole('button', { name: /^New institution$/ })).toBeNull()
  })
})

// ── 2. Tenant_Admin: only its school, no create control (R12.3, R12.4) ──────
describe('console split — Tenant_Admin', () => {
  beforeEach(() => {
    capabilityState.current = tenantAdminCaps()
  })

  it('R12.3/R12.4: shows only the assigned school and NO "New institution" control', async () => {
    // The backend scopes this list to the actor's memberships — only MIHAS.
    listInstitutions.mockResolvedValue({ institutions: [MIHAS], totalCount: 1 })

    const { findByText, queryByText, queryByRole } = renderTree(<AdminTenants />)

    // The school console renders the assigned institution's profile (R12.3).
    expect(await findByText('My school')).toBeTruthy()
    expect(await findByText(MIHAS.full_name)).toBeTruthy()

    // No other tenant's identity leaks through (isolation).
    expect(queryByText('KATC Admissions')).toBeNull()
    expect(queryByText(KATC.full_name)).toBeNull()

    // R12.4: a non-super-admin never sees a "New institution" control — neither
    // the list-panel control nor the wizard launcher.
    expect(queryByRole('button', { name: /new institution/i })).toBeNull()
  })
})

// ── 3. Backend 403: precise authorization message, no tenant data (R12.7) ───
describe('console split — backend 403 handling', () => {
  it('R12.7: a rejected tenantAdminService list (403) renders the authorization message and no tenant rows', async () => {
    capabilityState.current = superAdminCaps()
    listInstitutions.mockRejectedValue(
      Object.assign(new Error('Forbidden'), { status: 403, code: 'NOT_AUTHORIZED' }),
    )

    const { findByText, queryByText } = renderTree(<AdminTenants />)

    // The list panel surfaces the precise authorization message…
    expect(await findByText('You are not authorized')).toBeTruthy()
    // …and discloses no tenant identifier/name/count/attribute (R12.7).
    expect(queryByText('MIHAS Admissions')).toBeNull()
    expect(queryByText('KATC Admissions')).toBeNull()
  })

  it('R12.7: PanelStateError on a 403 hides supplied tenant data and shows the authorization message', async () => {
    capabilityState.current = superAdminCaps()

    // Even when tenant rows are passed in, a backend 403 renders the
    // PanelStateError (panelStates.tsx) and NO tenant data.
    const { getByText, queryByText } = renderTree(
      <TenantListPanel
        institutions={[MIHAS, KATC]}
        selectedId={null}
        onSelect={vi.fn()}
        onNew={vi.fn()}
        isError
        error={Object.assign(new Error('Forbidden'), { status: 403 })}
        onRetry={vi.fn()}
      />,
    )

    await waitFor(() => expect(getByText('You are not authorized')).toBeTruthy())
    expect(queryByText('MIHAS Admissions')).toBeNull()
    expect(queryByText('KATC Admissions')).toBeNull()
  })
})
