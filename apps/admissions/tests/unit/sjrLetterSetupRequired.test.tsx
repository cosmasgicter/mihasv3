/**
 * R7-d (task 5.4): a letter the school has not set up offers no Prepare and no
 * retry, names no configuration, and is only asked about for profile-required
 * letters that have not been issued. Complements sjrLetterCopy.test.tsx.
 */
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const APP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const calls: string[] = []
let letterStatus: Record<string, unknown> = {}
let listRows: unknown[] = []

vi.mock('@/services/client', () => ({
  apiClient: {
    request: vi.fn(async (endpoint: string) => {
      calls.push(endpoint)
      if (endpoint.endsWith('/official-documents/')) return listRows
      if (endpoint.includes('/official-documents/acceptance_letter/')) return letterStatus
      return null
    }),
  },
}))
vi.mock('@/lib/apiErrorLogger', () => ({ logApiError: vi.fn() }))
vi.mock('@/hooks/usePortalBrand', () => ({
  usePortalBrand: () => ({ brandName: 'Example College', isWhiteLabel: true, supportEmail: 'admissions@example.test' }),
}))

const { DocumentButtons } = await import('@/components/student/DocumentButtons')

const SETUP = {
  document_id: null,
  document_type: 'acceptance_letter',
  status: 'setup_required',
  error_code: 'DOCUMENT_PROFILE_NOT_CONFIGURED',
  historical: false,
  job: { state: null, can_retry: false },
  can_retry: false,
}

function renderLetter() {
  render(
    <MemoryRouter>
      <DocumentButtons applicationId={APP_ID} status="approved" paymentStatus="verified" />
    </MemoryRouter>,
  )
}

describe('a letter the school has not set up', () => {
  beforeEach(() => {
    calls.length = 0
    listRows = []
    letterStatus = SETUP
  })

  it('offers no Prepare or Try again control for the letter and names no configuration', async () => {
    renderLetter()
    await screen.findByText(/Example College is still setting it up/i)
    expect(screen.queryByRole('button', { name: /prepare acceptance letter/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /try again|retry/i })).toBeNull()
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/document profile|template|signature|logo/i)
    expect(text).not.toMatch(/has been notified/i)
    // the school's own address is the support route
    expect(screen.getByRole('link', { name: /email admissions/i }).getAttribute('href')).toMatch(
      /^mailto:admissions@example\.test/,
    )
  })

  it('counts exactly the commands the sheet holds, and offers no email for the missing letter', async () => {
    renderLetter()
    await screen.findByText(/Example College is still setting it up/i)
    const label = screen.getByTestId('document-options-trigger').textContent ?? ''
    const claimed = Number(/\((\d+)\)/.exec(label)?.[1])
    const sheet = screen.getByTestId('document-options-panel')
    expect(sheet.querySelectorAll('button')).toHaveLength(claimed)
    expect(screen.queryByRole('button', { name: /email acceptance letter/i, hidden: true })).toBeNull()
  })

  it('does not ask about a letter the platform already issued', async () => {
    listRows = [{ ...SETUP, status: 'ready', document_id: 'doc-1', error_code: undefined }]
    renderLetter()
    await waitFor(() => expect(calls.some((c) => c.endsWith('/official-documents/'))).toBe(true))
    await waitFor(() => expect(screen.getByRole('link', { name: /open acceptance letter/i })).toBeTruthy())
    expect(calls.filter((c) => c.includes('/official-documents/acceptance_letter/'))).toHaveLength(0)
  })

  it('shows the Prepare control when the school has set the letter up', async () => {
    letterStatus = { ...SETUP, status: 'not_requested', error_code: undefined }
    renderLetter()
    expect(await screen.findByRole('button', { name: /prepare acceptance letter/i })).toBeTruthy()
  })
})
