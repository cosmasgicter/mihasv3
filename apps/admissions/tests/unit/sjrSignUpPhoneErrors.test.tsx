/**
 * R8 exploration: a server phone error lands on the phone field, not in a banner.
 *
 * Spec: student-journey-repair task 1.8, clause 1.39 (design R8-b, frontend half).
 *
 * At HEAD `useSessionListener.signUp` keeps only `error.message`, which the API
 * client builds as "phone: <server message>", and the server message repeats the
 * submitted number. So the banner reads "phone: 0971234567 is not a valid Zambian
 * phone number (+260XXXXXXXXX)" and the phone input is never marked invalid.
 *
 * The page, the auth provider, the session hook, the auth service and the API
 * client all run for real; only `fetch` is replaced, answering the register call
 * with the 400 envelope the backend returns at HEAD.
 *
 * Task 3.27 fixed this; the marker was removed at checkpoint 3.28.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthProvider } from '@/contexts/AuthContext'
import SignUpPage from '@/pages/auth/SignUpPage'

const SUBMITTED_PHONE = '0971234567'

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(typeof input === 'string' || input instanceof URL ? input : input.url)
      if (url.includes('/auth/register/')) {
        // The backend's answer at HEAD (validators.py echoes the value).
        return json(400, {
          success: false,
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: {
            phone: [`${SUBMITTED_PHONE} is not a valid Zambian phone number (+260XXXXXXXXX)`],
          },
        })
      }
      if (url.includes('/auth/session/')) {
        return json(200, { success: true, data: { authenticated: false, user: null } })
      }
      return json(401, { success: false, error: 'Not authenticated', code: 'NOT_AUTHENTICATED' })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function submitWithLocalPhone() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/auth/signup']}>
        <AuthProvider>
          <SignUpPage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  const fill = (label: RegExp, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  fill(/^first name$/i, 'Test')
  fill(/^last name$/i, 'Student')
  fill(/^email$/i, 'test.student@example.com')
  fill(/^phone number$/i, SUBMITTED_PHONE)
  fill(/^password$/i, 'Passw0rd-local')
  fill(/^confirm password$/i, 'Passw0rd-local')
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /create account|sign up/i }))
  })
}

describe('sign-up phone errors (clause 1.39)', () => {
  it('marks the phone input invalid and keeps the key and value out of the banner', async () => {
    await submitWithLocalPhone()

    const phone = screen.getByLabelText(/^phone number$/i)
    await waitFor(() => expect(phone.getAttribute('aria-invalid')).toBe('true'))
    const describedBy = phone.getAttribute('aria-describedby') ?? ''
    expect(describedBy).not.toBe('')
    const description = describedBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ')
    expect(description.trim()).not.toBe('')

    // The banner is every alert that is not the field's own description. (The
    // field error repeats the server's message; that the server stops echoing
    // the value is the backend half, test_sjr_phone_bug_conditions.py.)
    const fieldIds = new Set(describedBy.split(/\s+/))
    const banners = screen.queryAllByRole('alert').filter((alert) => !fieldIds.has(alert.id))
    for (const alert of banners) {
      const text = alert.textContent ?? ''
      expect(text).not.toMatch(/\bphone:/i)
      expect(text).not.toContain(SUBMITTED_PHONE)
    }
  })
})
