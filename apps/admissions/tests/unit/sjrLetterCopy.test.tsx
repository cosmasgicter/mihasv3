/**
 * R7 exploration: a letter the school has not set up is not "ready".
 *
 * Spec: student-journey-repair task 1.7, clause 1.37 (design R7-d; D9 option C).
 *
 * When the tenant has no document profile, the read path answers
 * `setup_required` / `DOCUMENT_PROFILE_NOT_CONFIGURED` (after task 5.4). The
 * student surface must then say the letter "isn't available yet", give the
 * support contact, and never say "ready". At HEAD the summary says "Your
 * acceptance letter is ready to download." for an approved application whatever
 * the server says, and there is no "isn't available yet" copy.
 *
 * Wrapped in `it.fails` (design "Marker scheme"); task 5.6 removes the wrapper.
 */
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const APP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const SETUP_REQUIRED = {
  document_id: null,
  document_type: 'acceptance_letter',
  status: 'setup_required',
  error_code: 'DOCUMENT_PROFILE_NOT_CONFIGURED',
  historical: false,
  job: { state: null, can_retry: false },
  can_retry: false,
}

vi.mock('@/services/client', () => ({
  apiClient: {
    request: vi.fn(async (endpoint: string) => {
      if (endpoint.includes('/official-documents/acceptance_letter/')) return SETUP_REQUIRED
      if (endpoint.endsWith('/official-documents/')) return []
      return null
    }),
  },
}))
vi.mock('@/lib/apiErrorLogger', () => ({ logApiError: vi.fn() }))
vi.mock('@/hooks/usePortalBrand', () => ({
  usePortalBrand: () => ({ brandName: 'Beanola Admissions', supportEmail: null }),
}))

const { DocumentButtons } = await import('@/components/student/DocumentButtons')

describe('a letter in setup_required (clause 1.37)', () => {
  it.fails('says it "isn\'t available yet", gives the support contact, and never says ready', async () => {
    render(
      <MemoryRouter>
        <DocumentButtons applicationId={APP_ID} status="approved" paymentStatus="verified" />
      </MemoryRouter>,
    )

    expect(await screen.findByText(/isn.t available yet/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: /contact|support/i })).toBeTruthy()
    await waitFor(() => {
      const text = document.body.textContent ?? ''
      expect(text).not.toMatch(/\bready\b/i)
    })
  })
})
