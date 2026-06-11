/**
 * Unit coverage for the tenant document-profile panel (task 17.2, R8.8).
 *
 * `ProfilesPanel` is the rich, versioned document-profile editor rendered
 * inside `TemplatesPanel`. It lets a super admin edit structured sections,
 * fee-chart rows, bank accounts, requirements, and signatory text, preview
 * with neutral sample data, clone the latest version, and activate/deactivate
 * versions. The profiles drive backend-generated official documents — there is
 * no MIHAS/KATC frontend fallback.
 *
 * These tests pin the panel's contract with `tenantAdminService`:
 *   - fee rows: add + edit item/amount/cadence flow into the
 *     `createDocumentProfile` payload; "Add fee row" disables at the ≤50 cap;
 *   - bank rows: add + edit bank_name/account_number flow into the payload;
 *     "Add bank account" disables at the ≤10 cap;
 *   - requirements: requirement chips flow into the payload; the ≤50 cap is
 *     surfaced;
 *   - clone/version: "Clone latest" calls
 *     `cloneDocumentProfile(institutionId, latestId)`; activate/deactivate call
 *     `updateDocumentProfile(institutionId, id, { is_active })`;
 *   - preview: renders profile sections with neutral sample-data substitution,
 *     unknown tokens render inert (`[unknown token: ...]`), and the output
 *     contains no hardcoded MIHAS/KATC — it reflects only profile content plus
 *     the neutral `PROFILE_SAMPLE`.
 *
 * **Validates: Requirements R8.8**
 */
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'

const listDocumentProfiles = vi.fn()
const createDocumentProfile = vi.fn()
const updateDocumentProfile = vi.fn()
const cloneDocumentProfile = vi.fn()
const listOfferings = vi.fn()

// Override only `tenantAdminService`; keep the real TENANT_PROFILE_CAPS /
// TENANT_PROFILE_LAYOUTS / types so the panel's caps and layout list are exercised.
vi.mock('@/services/admin/tenants', async (importActual) => {
  const actual = await importActual<typeof import('@/services/admin/tenants')>()
  return {
    ...actual,
    tenantAdminService: {
      ...actual.tenantAdminService,
      listDocumentProfiles: (...args: unknown[]) => listDocumentProfiles(...args),
      createDocumentProfile: (...args: unknown[]) => createDocumentProfile(...args),
      updateDocumentProfile: (...args: unknown[]) => updateDocumentProfile(...args),
      cloneDocumentProfile: (...args: unknown[]) => cloneDocumentProfile(...args),
      listOfferings: (...args: unknown[]) => listOfferings(...args),
    },
  }
})

vi.mock('@/hooks/useToast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { ProfilesPanel } from '@/pages/admin/tenants/ProfilesPanel'
import { TENANT_PROFILE_CAPS, type TenantDocumentProfile } from '@/services/admin/tenants'

const INSTITUTION_ID = 'inst-1'

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ProfilesPanel institutionId={INSTITUTION_ID} />
    </QueryClientProvider>,
  )
}

function clickTimes(button: HTMLElement, times: number) {
  for (let i = 0; i < times; i += 1) {
    fireEvent.click(button)
  }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ProfilesPanel — fee rows', () => {
  it('adds and edits a fee row that flows into the createDocumentProfile payload', async () => {
    listDocumentProfiles.mockResolvedValue([])
    listOfferings.mockResolvedValue([])
    createDocumentProfile.mockResolvedValue({ id: 'p-new' })

    const { getByRole, getByLabelText } = renderPanel()

    fireEvent.click(getByRole('button', { name: 'Add fee row' }))
    fireEvent.change(getByLabelText('Fee row 1 item'), { target: { value: 'Tuition' } })
    fireEvent.change(getByLabelText('Fee row 1 amount'), { target: { value: '1500' } })
    fireEvent.change(getByLabelText('Fee row 1 cadence'), { target: { value: 'Per year' } })

    fireEvent.click(getByRole('button', { name: /save profile/i }))

    await waitFor(() => expect(createDocumentProfile).toHaveBeenCalledTimes(1))
    expect(createDocumentProfile).toHaveBeenCalledWith(
      INSTITUTION_ID,
      expect.objectContaining({
        fee_chart: [{ item: 'Tuition', amount: 1500, cadence: 'Per year' }],
      }),
    )
  })

  it('disables "Add fee row" once the ≤50 cap is reached', async () => {
    listDocumentProfiles.mockResolvedValue([])
    listOfferings.mockResolvedValue([])

    const { getByRole } = renderPanel()
    const addFeeRow = getByRole('button', { name: 'Add fee row' })

    expect((addFeeRow as HTMLButtonElement).disabled).toBe(false)
    clickTimes(addFeeRow, TENANT_PROFILE_CAPS.maxFeeRows)
    expect((addFeeRow as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('ProfilesPanel — bank rows', () => {
  it('adds and edits a bank row that flows into the createDocumentProfile payload', async () => {
    listDocumentProfiles.mockResolvedValue([])
    listOfferings.mockResolvedValue([])
    createDocumentProfile.mockResolvedValue({ id: 'p-new' })

    const { getByRole, getByLabelText } = renderPanel()

    fireEvent.click(getByRole('button', { name: 'Add bank account' }))
    fireEvent.change(getByLabelText('Bank row 1 name'), { target: { value: 'Zambia National Bank' } })
    fireEvent.change(getByLabelText('Bank row 1 account number'), { target: { value: '0123456789' } })

    fireEvent.click(getByRole('button', { name: /save profile/i }))

    await waitFor(() => expect(createDocumentProfile).toHaveBeenCalledTimes(1))
    expect(createDocumentProfile).toHaveBeenCalledWith(
      INSTITUTION_ID,
      expect.objectContaining({
        bank_accounts: [{ bank_name: 'Zambia National Bank', account_number: '0123456789' }],
      }),
    )
  })

  it('disables "Add bank account" once the ≤10 cap is reached', async () => {
    listDocumentProfiles.mockResolvedValue([])
    listOfferings.mockResolvedValue([])

    const { getByRole } = renderPanel()
    const addBank = getByRole('button', { name: 'Add bank account' })

    expect((addBank as HTMLButtonElement).disabled).toBe(false)
    clickTimes(addBank, TENANT_PROFILE_CAPS.maxBankAccounts)
    expect((addBank as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('ProfilesPanel — requirements', () => {
  it('adds requirement chips that flow into the createDocumentProfile payload and surfaces the ≤50 cap', async () => {
    listDocumentProfiles.mockResolvedValue([])
    listOfferings.mockResolvedValue([])
    createDocumentProfile.mockResolvedValue({ id: 'p-new' })

    const { getByRole, getByLabelText, getByText } = renderPanel()

    // The cap is surfaced in the section label.
    expect(getByText(`Requirements (0/${TENANT_PROFILE_CAPS.maxRequirements})`)).toBeTruthy()

    const addRequirement = (value: string) => {
      // Anchor to the input's exact label (the chip <ul> uses a "… values" suffix).
      fireEvent.change(getByLabelText(/^Requirements \(\d+\/\d+\)$/), { target: { value } })
      fireEvent.click(getByRole('button', { name: 'Add' }))
    }
    addRequirement('Bring original certificates')
    addRequirement('Two passport photos')

    fireEvent.click(getByRole('button', { name: /save profile/i }))

    await waitFor(() => expect(createDocumentProfile).toHaveBeenCalledTimes(1))
    expect(createDocumentProfile).toHaveBeenCalledWith(
      INSTITUTION_ID,
      expect.objectContaining({
        requirements: ['Bring original certificates', 'Two passport photos'],
      }),
    )
  })
})

describe('ProfilesPanel — clone / version lifecycle', () => {
  const activeProfile: TenantDocumentProfile = {
    id: 'profile-1',
    institution_id: INSTITUTION_ID,
    document_type: 'acceptance_letter',
    layout_key: 'simple_letter',
    version: 1,
    is_active: true,
    sections: { body: 'Hi {{student_name}}' },
  }

  it('clones the latest version via cloneDocumentProfile(institutionId, latestId)', async () => {
    listDocumentProfiles.mockResolvedValue([activeProfile])
    listOfferings.mockResolvedValue([])
    cloneDocumentProfile.mockResolvedValue({ id: 'profile-2' })

    const { findByRole } = renderPanel()
    const cloneButton = await findByRole('button', { name: /clone latest/i })
    fireEvent.click(cloneButton)

    await waitFor(() => expect(cloneDocumentProfile).toHaveBeenCalledTimes(1))
    expect(cloneDocumentProfile).toHaveBeenCalledWith(INSTITUTION_ID, 'profile-1')
  })

  it('deactivates an active version via updateDocumentProfile with { is_active: false }', async () => {
    listDocumentProfiles.mockResolvedValue([activeProfile])
    listOfferings.mockResolvedValue([])
    updateDocumentProfile.mockResolvedValue({ ...activeProfile, is_active: false })

    const { findByRole } = renderPanel()
    const deactivate = await findByRole('button', { name: 'Deactivate' })
    fireEvent.click(deactivate)

    await waitFor(() => expect(updateDocumentProfile).toHaveBeenCalledTimes(1))
    expect(updateDocumentProfile).toHaveBeenCalledWith(INSTITUTION_ID, 'profile-1', { is_active: false })
  })

  it('activates an inactive version via updateDocumentProfile with { is_active: true }', async () => {
    listDocumentProfiles.mockResolvedValue([{ ...activeProfile, is_active: false }])
    listOfferings.mockResolvedValue([])
    updateDocumentProfile.mockResolvedValue({ ...activeProfile, is_active: true })

    const { findByRole } = renderPanel()
    const activate = await findByRole('button', { name: 'Activate' })
    fireEvent.click(activate)

    await waitFor(() => expect(updateDocumentProfile).toHaveBeenCalledTimes(1))
    expect(updateDocumentProfile).toHaveBeenCalledWith(INSTITUTION_ID, 'profile-1', { is_active: true })
  })
})

describe('ProfilesPanel — preview has no MIHAS/KATC fallback', () => {
  const previewProfile: TenantDocumentProfile = {
    id: 'profile-1',
    institution_id: INSTITUTION_ID,
    document_type: 'acceptance_letter',
    layout_key: 'simple_letter',
    version: 1,
    is_active: true,
    sections: {
      body: 'Dear {{student_name}}, welcome to {{program}} at {{institution}}. Ref {{mystery_token}}.',
    },
  }

  it('substitutes neutral sample data, renders unknown tokens inert, and emits no hardcoded MIHAS/KATC', async () => {
    listDocumentProfiles.mockResolvedValue([previewProfile])
    listOfferings.mockResolvedValue([])

    const { findByRole, getByText } = renderPanel()

    fireEvent.click(await findByRole('button', { name: /preview/i }))

    // Section body rendered with neutral PROFILE_SAMPLE substitution.
    const rendered = getByText(/Dear Jane M\. Banda/)
    const text = rendered.textContent || ''

    // Known tokens substituted from the neutral sample (no institution-specific brand).
    expect(text).toContain('Jane M. Banda')
    expect(text).toContain('Diploma in Clinical Medicine')
    expect(text).toContain('Beanola Partner School')
    // Unknown token renders inert rather than leaking or throwing.
    expect(text).toContain('[unknown token: mystery_token]')
    // The preview reflects only profile content + neutral sample — no brand fallback.
    expect(text).not.toMatch(/MIHAS|KATC/)

    // The preview header reflects the profile's own document type, not a brand default.
    expect(getByText(/Preview · acceptance_letter v1/)).toBeTruthy()
  })
})
