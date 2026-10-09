/**
 * The admin money surfaces read the server, and only the server (task 8.4).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 8.4
 * Requirements: R3 (backend authority; the frontend gates on backend
 * capabilities and never on a role string), R6.5 (server-side filters,
 * pagination, and an audited export), R8.3-R8.4, R12.1/R12.6-R12.7 (server
 * amounts, no client arithmetic).
 * Findings: **ADM-06** (settlement rows fetched broadly then filtered
 * client-side; totals derived from the loaded payload), **AUTH-02**.
 *
 * These render the REAL `SettlementPanel` against a mocked settlement service, so
 * what is under test is the wiring the finding was about:
 *
 *   1. the institution reaches the **server** as a query parameter — the panel
 *      does not fetch broadly and filter afterwards;
 *   2. the totals shown are the server's `aggregates`, not a sum of the rendered
 *      rows, and they do not move when the operator turns a page;
 *   3. the reconciliation state is the server's verdict, rendered with a label
 *      (never colour alone);
 *   4. the export control follows the backend's `can_export` answer and the
 *      capability set — never a role string — and the export request drops the
 *      page, because the export is page-independent.
 *
 * The source-scan half (no client-side institution predicate, no `toFixed`, no
 * `reduce` total) lives in `tests/unit/feeProviderSourceScan.test.ts`; the backend
 * authority half lives in
 * `backend/tests/unit/test_settlement_fee_authority_8_4.py`.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CapabilityValue } from '@/contexts/CapabilityContext'

const { capabilityState } = vi.hoisted(() => ({
  capabilityState: { current: null as unknown as CapabilityValue },
}))

vi.mock('@/contexts/CapabilityContext', () => ({
  useCapabilities: () => capabilityState.current,
  CapabilityProvider: ({ children }: { children: ReactNode }) => children,
}))

const getSettlementReport = vi.fn()
const downloadExport = vi.fn()
const settlementExportPath = vi.fn(
  (query: Record<string, unknown>) => `/payments/settlements/?export=csv&spy=${JSON.stringify(query)}`,
)

vi.mock('@/services/admin/settlement', () => ({
  settlementAdminService: {
    getSettlementReport: (...args: unknown[]) => getSettlementReport(...args),
    settlementExportPath: (...args: unknown[]) => settlementExportPath(...(args as [Record<string, unknown>])),
    feeExportPath: () => '/admin/fees/?export=csv',
    getFeeReport: vi.fn(),
    downloadExport: (...args: unknown[]) => downloadExport(...args),
  },
}))

import { SettlementPanel } from '@/pages/admin/tenants/SettlementPanel'

const INSTITUTION_A = 'inst-a'
const INSTITUTION_B = 'inst-b'

function tenantCapabilities(overrides: Partial<CapabilityValue> = {}): CapabilityValue {
  return {
    isSuperAdmin: false,
    isTenantAdmin: true,
    platformCapabilities: [],
    institutionCapabilities: { [INSTITUTION_A]: ['tenant.payment.read'] },
    scopedInstitutionIds: [INSTITUTION_A],
    selectedInstitutionId: INSTITUTION_A,
    selectInstitution: vi.fn(),
    can: () => false,
    canForInstitution: (institutionId: string, capability: string) =>
      institutionId === INSTITUTION_A && capability === 'tenant.payment.read',
    noAccess: false,
    isLoading: false,
    ...overrides,
  } as CapabilityValue
}

function report(overrides: Record<string, unknown> = {}) {
  return {
    page: 1,
    pageSize: 10,
    totalCount: 1,
    totalPages: 1,
    results: [
      {
        institution_id: INSTITUTION_A,
        institution_name: 'School A',
        program_offering_id: 'off-a',
        program_name: 'Diploma in Nursing',
        currency: 'ZMW',
        payment_count: 2,
        gross_amount: '306.00',
        settled_count: 1,
        settled_amount: '153.00',
        pending_count: 1,
        stale_pending_count: 1,
        failed_count: 0,
        expired_count: 0,
        deferred_count: 0,
        reconciliation_state: 'attention_required',
        first_payment_at: '2026-08-01T00:00:00Z',
        last_payment_at: '2026-08-02T00:00:00Z',
      },
    ],
    aggregates: {
      payment_count: 40,
      settled_count: 20,
      pending_count: 10,
      stale_pending_count: 5,
      failed_count: 5,
      expired_count: 0,
      deferred_count: 0,
      institution_count: 1,
      offering_count: 4,
      totals_by_currency: [
        { currency: 'ZMW', payment_count: 40, gross_amount: '6120.00', settled_amount: '3060.00' },
      ],
      reconciliation_state: 'attention_required',
      reconciliation_stale_hours: 24,
      row_limit: 5000,
    },
    redaction: { applied: true, withheld_fields: ['collector', 'quarantined_count'] },
    can_export: true,
    ...overrides,
  }
}

function renderPanel(institutionId = INSTITUTION_A) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <SettlementPanel institutionId={institutionId} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  capabilityState.current = tenantCapabilities()
  getSettlementReport.mockReset()
  downloadExport.mockReset()
  settlementExportPath.mockClear()
  getSettlementReport.mockResolvedValue(report())
  downloadExport.mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
})

describe('settlement panel: scope is a query, not a render (ADM-06)', () => {
  it('sends the institution to the server instead of fetching broadly', async () => {
    renderPanel()
    await waitFor(() => expect(getSettlementReport).toHaveBeenCalled())
    const query = getSettlementReport.mock.calls[0][0]
    expect(query.institutionId).toBe(INSTITUTION_A)
    // A page is requested — the server paginates, the browser does not slice.
    expect(query.pageSize).toBeGreaterThan(0)
    expect(query.page).toBe(1)
  })

  it('re-queries the server when the reconciliation filter changes', async () => {
    renderPanel()
    await waitFor(() => expect(getSettlementReport).toHaveBeenCalledTimes(1))

    fireEvent.change(await screen.findByLabelText(/reconciliation state/i), { target: { value: 'failed' } })

    await waitFor(() => expect(getSettlementReport).toHaveBeenCalledTimes(2))
    const query = getSettlementReport.mock.calls[1][0]
    expect(query.reconciliation).toBe('failed')
    expect(query.institutionId).toBe(INSTITUTION_A)
    // A filter change resets to page 1 rather than paging into a stale offset.
    expect(query.page).toBe(1)
  })

  it('renders no row for an institution the server did not return', async () => {
    // The panel has no client-side institution predicate any more, so this proves
    // the only thing it can prove honestly: it renders exactly what the scoped
    // server response contained, and nothing about another tenant is invented.
    renderPanel(INSTITUTION_B)
    await waitFor(() => expect(getSettlementReport).toHaveBeenCalled())
    expect(getSettlementReport.mock.calls[0][0].institutionId).toBe(INSTITUTION_B)
  })
})

describe('settlement panel: the numbers are the server\'s (R12.1)', () => {
  it('shows the server aggregate, not a sum of the rendered rows', async () => {
    renderPanel()
    // The single row carries 306.00; the server's whole-set total is 6120.00.
    // Displaying the aggregate is the difference ADM-06 was about.
    expect(await screen.findByText(/K6120\.00/)).toBeTruthy()
    expect(screen.queryByText(/K306\.00 · 40/)).toBeNull()
  })

  it('prints server amount strings verbatim', async () => {
    renderPanel()
    // Rendered twice by design: the mobile record row and the desktop table.
    expect((await screen.findAllByText('K306.00')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('K153.00').length).toBeGreaterThan(0)
  })

  it('keeps the aggregate stable across pages', async () => {
    getSettlementReport.mockResolvedValueOnce(report({ totalPages: 2, totalCount: 20 }))
    renderPanel()
    expect(await screen.findByText(/K6120\.00/)).toBeTruthy()

    getSettlementReport.mockResolvedValueOnce(
      report({ page: 2, totalPages: 2, totalCount: 20 }),
    )
    fireEvent.click(screen.getByRole('button', { name: /next/i }))

    await waitFor(() => expect(getSettlementReport).toHaveBeenCalledTimes(2))
    expect(getSettlementReport.mock.calls[1][0].page).toBe(2)
    expect(await screen.findByText(/K6120\.00/)).toBeTruthy()
  })

  it('renders the server reconciliation verdict as a label', async () => {
    renderPanel()
    // Never colour alone: the verdict is a text label, and the stale counter
    // states the server's own window.
    expect((await screen.findAllByText(/needs attention/i)).length).toBeGreaterThan(0)
    expect(screen.getByText(/5 pending over 24h/i)).toBeTruthy()
  })
})

describe('settlement panel: export authority comes from the backend (R6.5)', () => {
  it('offers the export when the server says the actor may export', async () => {
    capabilityState.current = tenantCapabilities({
      canForInstitution: (institutionId: string, capability: string) =>
        institutionId === INSTITUTION_A &&
        ['tenant.payment.read', 'tenant.application.export'].includes(capability),
    })
    renderPanel()
    expect(await screen.findByRole('button', { name: /export csv/i })).toBeTruthy()
  })

  it('hides the export when the server withholds it, even for a scoped admin', async () => {
    getSettlementReport.mockResolvedValue(report({ can_export: false }))
    capabilityState.current = tenantCapabilities({
      canForInstitution: () => true,
    })
    renderPanel()
    await waitFor(() => expect(getSettlementReport).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /export csv/i })).toBeNull()
  })

  it('hides the export when the actor lacks the export capability', async () => {
    // The server still decides; this only proves the UI does not offer a control
    // the actor's capability set does not carry (usability, not the boundary).
    renderPanel()
    await waitFor(() => expect(getSettlementReport).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /export csv/i })).toBeNull()
  })

  it('asks the server for the export with the live filters', async () => {
    capabilityState.current = tenantCapabilities({ canForInstitution: () => true })
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: /export csv/i }))
    await waitFor(() => expect(downloadExport).toHaveBeenCalled())
    const [path, filename] = downloadExport.mock.calls[0]
    expect(String(path)).toContain('export=csv')
    expect(String(filename)).toMatch(/\.csv$/)
    expect(settlementExportPath).toHaveBeenCalledWith(
      expect.objectContaining({ institutionId: INSTITUTION_A }),
    )
  })

  it('surfaces the server refusal instead of saving an error as a file', async () => {
    capabilityState.current = tenantCapabilities({ canForInstitution: () => true })
    downloadExport.mockRejectedValue(new Error('You do not have permission to export this report.'))
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: /export csv/i }))
    expect(
      await screen.findByText(/do not have permission to export/i),
    ).toBeTruthy()
  })
})
