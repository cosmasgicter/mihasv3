/**
 * Unit coverage for the tenant onboarding "Test routing" simulator (task 23.2).
 *
 * The simulator UI calls the dedicated super-admin endpoint
 * `POST /api/v1/admin/routing/simulate/`, which reuses the real
 * `OfferingAssignmentService`. These tests pin the panel's contract with that
 * endpoint:
 *   - it posts the canonical program/intake (plus optional residency + the
 *     white-label institution filter) to the simulate endpoint;
 *   - an `assigned: true` result renders the routed school + offering +
 *     required documents;
 *   - an `assigned: false` result renders the recoverable failure code/guidance
 *     rather than dead-ending.
 *
 * **Validates: Requirements R11.3**
 */
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const simulateRouting = vi.fn()
const getCanonicalPrograms = vi.fn()
const getIntakes = vi.fn()

vi.mock('@/services/admin/tenants', () => ({
  tenantAdminService: {
    simulateRouting: (...args: unknown[]) => simulateRouting(...args),
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

import { RoutingSimulatorPanel } from '@/pages/admin/tenants/RoutingSimulatorPanel'

const PROGRAMS = { programs: [{ id: 'prog-1', name: 'Clinical Medicine' }] }
const INTAKES = { intakes: [{ id: 'intake-1', name: 'January 2026' }] }

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(['admin', 'tenants', 'canonical-programs'], PROGRAMS)
  client.setQueryData(['admin', 'tenants', 'intakes'], INTAKES)
  return render(
    <QueryClientProvider client={client}>
      <RoutingSimulatorPanel institutionId="inst-1" institutionName="Mukuba" />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  getCanonicalPrograms.mockResolvedValue(PROGRAMS)
  getIntakes.mockResolvedValue(INTAKES)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('RoutingSimulatorPanel', () => {
  it('posts the selected program + intake to the simulate endpoint and renders the routed school', async () => {
    getCanonicalPrograms.mockResolvedValue(PROGRAMS)
    getIntakes.mockResolvedValue(INTAKES)
    simulateRouting.mockResolvedValue({
      assigned: true,
      inputs: { program_id: 'prog-1', intake_id: 'intake-1' },
      program_name: 'Clinical Medicine',
      intake_name: 'January 2026',
      offering_code: 'MIHAS-CM',
      offering_name: 'Diploma in Clinical Medicine',
      institution: { id: 'inst-1', name: 'Mukuba', full_name: 'Mukuba Institute', code: 'MIHAS' },
      decision: { offering_priority: 10, program_intake_priority: 5, offering_status: 'active' },
      required_documents: [
        { document_type: 'identity_document', label: 'NRC', required: true },
        { document_type: 'passport_photo', label: 'Passport photo', required: false },
      ],
    })

    const { getByLabelText, getByRole, findByText, findByRole } = renderPanel()

    await findByRole('option', { name: 'Clinical Medicine' })

    fireEvent.change(getByLabelText('Canonical program'), { target: { value: 'prog-1' } })
    fireEvent.change(getByLabelText('Intake'), { target: { value: 'intake-1' } })
    fireEvent.click(getByRole('button', { name: /run simulation/i }))

    await waitFor(() => expect(simulateRouting).toHaveBeenCalledTimes(1))
    expect(simulateRouting).toHaveBeenCalledWith({
      program_id: 'prog-1',
      intake_id: 'intake-1',
      country: '',
      nationality: '',
      institution_id: null,
    })

    expect(await findByText(/Mukuba Institute/)).toBeTruthy()
    expect(await findByText(/Diploma in Clinical Medicine/)).toBeTruthy()
    expect(await findByText('NRC')).toBeTruthy()
  })

  it('passes the institution filter when restricted to the selected school', async () => {
    getCanonicalPrograms.mockResolvedValue(PROGRAMS)
    getIntakes.mockResolvedValue(INTAKES)
    simulateRouting.mockResolvedValue({ assigned: true, inputs: {}, institution: { id: 'inst-1', name: 'Mukuba' } })

    const { getByLabelText, getByRole, findByRole } = renderPanel()
    await findByRole('option', { name: 'Clinical Medicine' })

    fireEvent.change(getByLabelText('Canonical program'), { target: { value: 'prog-1' } })
    fireEvent.change(getByLabelText('Intake'), { target: { value: 'intake-1' } })
    fireEvent.click(getByLabelText(/Restrict to Mukuba/i))
    fireEvent.click(getByRole('button', { name: /run simulation/i }))

    await waitFor(() => expect(simulateRouting).toHaveBeenCalledTimes(1))
    expect(simulateRouting).toHaveBeenCalledWith(
      expect.objectContaining({ institution_id: 'inst-1' }),
    )
  })

  it('renders a recoverable failure for an unroutable program + intake', async () => {
    getCanonicalPrograms.mockResolvedValue(PROGRAMS)
    getIntakes.mockResolvedValue(INTAKES)
    simulateRouting.mockResolvedValue({
      assigned: false,
      inputs: { program_id: 'prog-1', intake_id: 'intake-1' },
      error: { code: 'NO_ELIGIBLE_OFFERING', message: 'No active school offering is available.' },
    })

    const { getByLabelText, getByRole, findByText, findByRole } = renderPanel()
    await findByRole('option', { name: 'Clinical Medicine' })

    fireEvent.change(getByLabelText('Canonical program'), { target: { value: 'prog-1' } })
    fireEvent.change(getByLabelText('Intake'), { target: { value: 'intake-1' } })
    fireEvent.click(getByRole('button', { name: /run simulation/i }))

    expect(await findByText('No active school offering is available.')).toBeTruthy()
    expect(await findByText('NO_ELIGIBLE_OFFERING')).toBeTruthy()
  })
})
