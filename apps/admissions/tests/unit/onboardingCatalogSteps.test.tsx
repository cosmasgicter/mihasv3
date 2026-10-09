/**
 * Unit coverage for the tenant onboarding canonical-catalog steps (task 4.3).
 *
 * These prove the wizard's former instructional placeholders are now REAL
 * canonical mutations driven by SCOPED SELECTORS (findings TEN-02, TEN-03,
 * TEN-05):
 *   - Programs → `createOffering` posts the selected `canonical_program_id`
 *     (chosen from a list, never a pasted UUID) as the write authority.
 *   - Intakes  → `createProgramIntake` posts the selected offering + intake IDs
 *     plus a seat `max_capacity`.
 *   - Fees     → `createProgramFee` posts the selected offering + fee type +
 *     residency + amount.
 *
 * **Validates: Requirements R4.2, R7.3, R6.3**
 */
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createOffering = vi.fn()
const createProgramIntake = vi.fn()
const createProgramFee = vi.fn()
const listProgramFees = vi.fn()
const listOfferings = vi.fn()
const getCanonicalPrograms = vi.fn()
const getIntakes = vi.fn()

vi.mock('@/services/admin/tenants', () => ({
  tenantAdminService: {
    createOffering: (...args: unknown[]) => createOffering(...args),
    createProgramIntake: (...args: unknown[]) => createProgramIntake(...args),
    createProgramFee: (...args: unknown[]) => createProgramFee(...args),
    listProgramFees: (...args: unknown[]) => listProgramFees(...args),
    listOfferings: (...args: unknown[]) => listOfferings(...args),
  },
}))

vi.mock('@/services/catalog', () => ({
  catalogService: {
    getCanonicalPrograms: (...args: unknown[]) => getCanonicalPrograms(...args),
    getIntakes: (...args: unknown[]) => getIntakes(...args),
  },
}))

vi.mock('@/hooks/useToast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import {
  WizardFeesStep,
  WizardIntakesStep,
  WizardProgramsStep,
} from '@/pages/admin/tenants/onboardingCatalogSteps'

const CANONICAL = { programs: [{ id: 'canon-1', name: 'Diploma in Registered Nursing', code: 'CANON-DRN' }] }
const INTAKES = { intakes: [{ id: 'intake-1', name: 'January 2027' }] }
const OFFERINGS = [
  { id: 'offer-1', name: 'MIHAS Nursing', code: 'MIHAS-DRN', institution_id: 'inst-1', canonical_program_id: null, offering_status: 'active', is_active: true },
]

function renderStep(node: React.ReactNode, seed?: (client: QueryClient) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  seed?.(client)
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

beforeEach(() => {
  getCanonicalPrograms.mockResolvedValue(CANONICAL)
  getIntakes.mockResolvedValue(INTAKES)
  listOfferings.mockResolvedValue(OFFERINGS)
  listProgramFees.mockResolvedValue([])
  createOffering.mockResolvedValue({ id: 'offer-2', name: 'X', code: 'X' })
  createProgramIntake.mockResolvedValue({ id: 'pi-1', program_id: 'offer-1', intake_id: 'intake-1', max_capacity: 120 })
  createProgramFee.mockResolvedValue({ id: 'fee-1', program_id: 'offer-1', fee_type: 'application', residency_category: 'local', amount: '150.00', currency: 'ZMW' })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('WizardProgramsStep (TEN-02, TEN-03, TEN-05)', () => {
  it('assigns the selected canonical program as an offering via createOffering', async () => {
    const { getByLabelText, getByRole, findByRole } = renderStep(
      <WizardProgramsStep institutionId="inst-1" />,
      (c) => {
        c.setQueryData(['admin', 'tenants', 'canonical-programs'], CANONICAL)
        c.setQueryData(['admin', 'tenants', 'offerings', 'inst-1'], [])
      },
    )

    await findByRole('option', { name: /Diploma in Registered Nursing/ })
    // Choosing from the scoped selector prefills name/code; the canonical id is
    // the write authority (never a pasted UUID).
    fireEvent.change(getByLabelText('Canonical program'), { target: { value: 'canon-1' } })
    fireEvent.click(getByRole('button', { name: /assign program/i }))

    await waitFor(() => expect(createOffering).toHaveBeenCalledTimes(1))
    expect(createOffering).toHaveBeenCalledWith(
      'inst-1',
      expect.objectContaining({ canonical_program_id: 'canon-1', offering_status: 'active' }),
    )
  })
})

describe('WizardIntakesStep (TEN-03, capacity)', () => {
  it('links the selected offering + intake with a seat capacity via createProgramIntake', async () => {
    const { getByLabelText, getByRole, findByRole } = renderStep(
      <WizardIntakesStep institutionId="inst-1" />,
      (c) => {
        c.setQueryData(['admin', 'tenants', 'offerings', 'inst-1'], OFFERINGS)
        c.setQueryData(['admin', 'tenants', 'intakes'], INTAKES)
      },
    )

    await findByRole('option', { name: 'January 2027' })
    fireEvent.change(getByLabelText('Offering'), { target: { value: 'offer-1' } })
    fireEvent.change(getByLabelText('Intake'), { target: { value: 'intake-1' } })
    fireEvent.change(getByLabelText('Seat capacity (optional)'), { target: { value: '120' } })
    fireEvent.click(getByRole('button', { name: /link intake/i }))

    await waitFor(() => expect(createProgramIntake).toHaveBeenCalledTimes(1))
    expect(createProgramIntake).toHaveBeenCalledWith({
      program_id: 'offer-1',
      intake_id: 'intake-1',
      max_capacity: 120,
    })
  })
})

describe('WizardFeesStep (fee, R7.3)', () => {
  it('configures a canonical fee for the selected offering via createProgramFee', async () => {
    const { getByLabelText, getByRole, findByRole } = renderStep(
      <WizardFeesStep institutionId="inst-1" />,
      (c) => {
        c.setQueryData(['admin', 'tenants', 'offerings', 'inst-1'], OFFERINGS)
      },
    )

    await findByRole('option', { name: 'MIHAS Nursing' })
    fireEvent.change(getByLabelText('Offering'), { target: { value: 'offer-1' } })
    fireEvent.change(getByLabelText('Fee amount'), { target: { value: '150.00' } })
    fireEvent.click(getByRole('button', { name: /add fee/i }))

    await waitFor(() => expect(createProgramFee).toHaveBeenCalledTimes(1))
    expect(createProgramFee).toHaveBeenCalledWith(
      'offer-1',
      expect.objectContaining({ fee_type: 'application', residency_category: 'local', amount: '150.00', currency: 'ZMW' }),
    )
  })
})
