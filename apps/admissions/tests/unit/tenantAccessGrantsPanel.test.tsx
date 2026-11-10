/**
 * Unit coverage for the tenant access-grants scoped selectors (task 4.3, TEN-05).
 *
 * Proves the former raw "User/Profile ID" and "Program offering ID" text fields
 * are now accessible, tenant-scoped SEARCH SELECTORS:
 *   - the user field is an email/name search datalist backed by
 *     `searchStaffCandidates`, resolved to the canonical user id at submit;
 *   - the program-offering scope uses an offering `<select>` from `listOfferings`.
 *
 * **Validates: Requirements R6.3**
 */
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

const listAccessGrants = vi.fn()
const createAccessGrant = vi.fn()
const updateAccessGrant = vi.fn()
const searchStaffCandidates = vi.fn()
const listOfferings = vi.fn()

vi.mock('@/services/admin/tenants', () => ({
  tenantAdminService: {
    listAccessGrants: (...a: unknown[]) => listAccessGrants(...a),
    createAccessGrant: (...a: unknown[]) => createAccessGrant(...a),
    updateAccessGrant: (...a: unknown[]) => updateAccessGrant(...a),
    searchStaffCandidates: (...a: unknown[]) => searchStaffCandidates(...a),
    listOfferings: (...a: unknown[]) => listOfferings(...a),
  },
}))

vi.mock('@/hooks/useToast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

vi.mock('@/contexts/CapabilityContext', () => ({
  useCapabilities: () => ({
    isSuperAdmin: true,
    can: () => true,
    canForInstitution: () => true,
  }),
  CapabilityProvider: ({ children }: { children: ReactNode }) => children,
}))

import { TenantAccessGrantsPanel } from '@/pages/admin/tenants/TenantAccessGrantsPanel'

const CANDIDATE = { id: 'user-9', email: 'reviewer@school.edu', full_name: 'Rev Iewer', role: 'reviewer' }
const OFFERINGS = [{ id: 'off-7', name: 'Nursing', code: 'NUR', institution_id: 'inst-1', is_active: true }]

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(['admin', 'tenants', 'grants', 'inst-1'], [])
  client.setQueryData(['admin', 'tenants', 'offerings', 'inst-1'], OFFERINGS)
  return render(
    <QueryClientProvider client={client}>
      <TenantAccessGrantsPanel institutionId="inst-1" />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  listAccessGrants.mockResolvedValue([])
  listOfferings.mockResolvedValue(OFFERINGS)
  searchStaffCandidates.mockResolvedValue([CANDIDATE])
  createAccessGrant.mockResolvedValue({ id: 'grant-1' })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('TenantAccessGrantsPanel scoped selectors (TEN-05)', () => {
  it('resolves the searched user email to a canonical user id (no raw UUID)', async () => {
    const { getByLabelText, getByRole } = renderPanel()

    // Type an email → debounced candidate search resolves to the user id.
    fireEvent.change(getByLabelText('Grant user search'), { target: { value: 'reviewer@school.edu' } })
    await waitFor(() => expect(searchStaffCandidates).toHaveBeenCalled())
    // Re-fire the change once candidates are loaded so the id resolves in state.
    fireEvent.change(getByLabelText('Grant user search'), { target: { value: 'reviewer@school.edu' } })

    fireEvent.click(getByRole('button', { name: /add grant/i }))

    await waitFor(() => expect(createAccessGrant).toHaveBeenCalledTimes(1))
    expect(createAccessGrant).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-9', scope_type: 'institution', institution_id: 'inst-1' }),
    )
  })

  it('uses a scoped offering select for a program-offering grant', async () => {
    const { getByLabelText, getByRole, findByRole } = renderPanel()

    fireEvent.change(getByLabelText('Grant user search'), { target: { value: 'reviewer@school.edu' } })
    await waitFor(() => expect(searchStaffCandidates).toHaveBeenCalled())
    fireEvent.change(getByLabelText('Grant user search'), { target: { value: 'reviewer@school.edu' } })

    fireEvent.change(getByLabelText('Grant scope type'), { target: { value: 'program_offering' } })
    // The offering selector is populated from listOfferings (scoped), not raw entry.
    await findByRole('option', { name: 'Nursing' })
    fireEvent.change(getByLabelText('Grant programme offering'), { target: { value: 'off-7' } })

    fireEvent.click(getByRole('button', { name: /add grant/i }))

    await waitFor(() => expect(createAccessGrant).toHaveBeenCalledTimes(1))
    expect(createAccessGrant).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-9', scope_type: 'program_offering', program_id: 'off-7' }),
    )
  })
})
