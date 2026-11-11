/**
 * Queue rows, badges and filters (platform-simplification task 30.4, R17.4-R17.6).
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ApplicationsTableView } from '@/components/admin/applications/ApplicationsTableView'
import { FiltersPanel } from '@/components/admin/applications/FiltersPanel'
import { documentStateText } from '@/lib/adminQueueText'
import type { ApplicationSummary } from '@/hooks/admin/useApplicationsData'

afterEach(() => cleanup())

const row = (overrides: Partial<ApplicationSummary> = {}): ApplicationSummary =>
  ({
    id: '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b',
    user_id: '',
    application_number: 'APP-20260101-AAAAAAAA',
    full_name: 'Chipo Banda',
    email: 'chipo@example.com',
    phone: '',
    program: 'Clinical Medicine',
    intake: 'July 2026',
    institution: 'Example College',
    status: 'submitted',
    payment_status: 'verified',
    isDraft: false,
    completionPercentage: null,
    lastUpdated: '',
    created_at: '2026-01-01T00:00:00Z',
    submitted_at: '2026-01-01T00:00:00Z',
    current_document_count: 3,
    verified_document_count: 2,
    ...overrides,
  }) as ApplicationSummary

describe('documentStateText', () => {
  it('says how many current documents are verified', () => {
    expect(documentStateText(3, 2)).toBe('2 of 3 verified')
    expect(documentStateText(0, 0)).toBe('None uploaded')
  })

  it('renders nothing when the server did not send the counts', () => {
    expect(documentStateText(null, null)).toBeNull()
    expect(documentStateText(undefined, 2)).toBeNull()
  })
})

function renderTable(onViewDetails = vi.fn(), onSelectionChange = vi.fn()) {
  render(
    <MemoryRouter>
      <ApplicationsTableView
        applications={[row(), row({ id: 'b2', application_number: 'APP-2', full_name: 'Mwila Phiri', status: 'under_review', payment_status: 'not_paid', current_document_count: 0, verified_document_count: 0 })]}
        onViewDetails={onViewDetails}
        onStatusUpdate={vi.fn()}
        reviewHref={(id) => `/admin/applications/${id}?status=submitted`}
        selectedIds={[]}
        onSelectionChange={onSelectionChange}
      />
    </MemoryRouter>,
  )
  return { onViewDetails, onSelectionChange }
}

describe('the queue table', () => {
  it('has the six columns the design names', () => {
    renderTable()
    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent?.trim()).filter(Boolean)
    expect(headers).toEqual(
      expect.arrayContaining(['Applicant', 'Application number', 'Programme', 'Status', 'Payment', 'Documents']),
    )
    expect(headers.join(' ')).not.toMatch(/Points|Submitted/)
  })

  it('links the applicant name to the review route, keeping the query string', () => {
    renderTable()
    const link = screen.getByRole('link', { name: 'Chipo Banda' })
    expect(link.getAttribute('href')).toBe(
      '/admin/applications/3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b?status=submitted',
    )
  })

  it('shows one badge per row and payment and documents as plain text', () => {
    renderTable()
    const first = screen.getByRole('link', { name: 'Chipo Banda' }).closest('tr') as HTMLElement
    const cells = within(first).getAllByRole('cell')
    // The status cell holds the one pill, with its label and icon.
    expect(within(first).getByText('Submitted')).toBeTruthy()
    expect(first.querySelectorAll('svg.lucide').length).toBeGreaterThan(0)
    expect(within(first).getByText('Verified').tagName).toBe('SPAN')
    expect(within(first).getByText('Verified').className).not.toMatch(/\bbg-/)
    expect(within(first).getByText('2 of 3 verified').className).not.toMatch(/\bbg-/)
    expect(cells.length).toBe(8) // checkbox + 6 columns + action
    const second = screen.getByRole('link', { name: 'Mwila Phiri' }).closest('tr') as HTMLElement
    expect(within(second).getByText('None uploaded')).toBeTruthy()
  })

  it('wraps every checkbox in a label that names it and is the 44 px hit area', () => {
    renderTable()
    const box = screen.getByRole('checkbox', { name: 'Select application APP-20260101-AAAAAAAA' })
    const label = box.closest('label') as HTMLElement
    expect(label.className).toMatch(/min-h-touch/)
    expect(label.className).toMatch(/min-w-touch/)
    const all = screen.getByRole('checkbox', { name: 'Select all rows on this page' })
    expect(all.closest('label')?.className).toMatch(/min-h-touch min-w-touch/)
  })

  it('gives every row cell the 44 px minimum height', () => {
    renderTable()
    const first = screen.getByRole('link', { name: 'Chipo Banda' }).closest('tr') as HTMLElement
    for (const cell of within(first).getAllByRole('cell')) expect(cell.className).toMatch(/\bh-11\b/)
  })

  it('opens the review when a focused row is activated with Enter', () => {
    const { onViewDetails } = renderTable()
    const first = screen.getByRole('link', { name: 'Chipo Banda' }).closest('tr') as HTMLElement
    expect(first.getAttribute('tabindex')).toBe('0')
    fireEvent.keyDown(first, { key: 'Enter' })
    expect(onViewDetails).toHaveBeenCalledWith('3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b')
  })

  it('shows the server page whole: no second search and no second pager', () => {
    renderTable()
    expect(screen.queryByPlaceholderText(/Search by name/)).toBeNull()
    expect(screen.queryByText(/Rows per page/i)).toBeNull()
  })
})

describe('the queue filters', () => {
  const base = {
    searchTerm: '',
    statusFilter: '',
    paymentFilter: '',
    programFilter: '',
    institutionFilter: '',
    draftFilter: 'all',
    onFilterChange: vi.fn(),
  }

  it('shows search, status, programme and payment, and hides the rest', () => {
    render(<FiltersPanel {...base} />)
    expect(screen.getByLabelText('Search applications')).toBeTruthy()
    expect(screen.getByLabelText('Status filter')).toBeTruthy()
    expect(screen.getByLabelText('Programme filter')).toBeTruthy()
    expect(screen.getByLabelText('Payment filter')).toBeTruthy()
    const more = screen.getByRole('button', { name: 'More filters (0)' })
    expect(more.getAttribute('aria-expanded')).toBe('false')
    const region = document.getElementById(more.getAttribute('aria-controls') as string) as HTMLElement
    expect(region.hidden).toBe(true)
    // 3 visible selects; everything else sits in the hidden region.
    const visibleSelects = Array.from(document.querySelectorAll('select')).filter((el) => !region.contains(el))
    expect(visibleSelects).toHaveLength(3)
    expect(within(region).getAllByRole('combobox', { hidden: true }).length).toBe(10)
  })

  it('counts the active hidden filters and opens on click', () => {
    render(<FiltersPanel {...base} institutionFilter="inst-1" lateSubmissionFilter="true" />)
    const more = screen.getByRole('button', { name: 'More filters (2)' })
    fireEvent.click(more)
    expect(more.getAttribute('aria-expanded')).toBe('true')
    const region = document.getElementById(more.getAttribute('aria-controls') as string) as HTMLElement
    expect(region.hidden).toBe(false)
  })
})

describe('the queue card', () => {
  it('wraps its checkbox in a 44 px label and shows payment as text', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/admin/applications/ApplicationCard.tsx'), 'utf8')
    expect(source).toContain('<label className="inline-flex min-h-touch min-w-touch')
    expect(source).not.toContain('getPaymentBadge')
    expect(source).toContain('documentStateText(app.current_document_count, app.verified_document_count)')
  })
})
