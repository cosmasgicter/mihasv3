import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { PasswordInput } from '@/components/ui/PasswordInput'
import SignInPage from '@/pages/auth/SignInPage'
import SignUpPage from '@/pages/auth/SignUpPage'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    signIn: vi.fn(),
    signUp: vi.fn(),
  }),
}))

vi.mock('@/components/seo/Seo', () => ({
  Seo: () => null,
}))

vi.mock('@/components/ui/AuthLoadingOverlay', () => ({
  AuthLoadingOverlay: () => null,
}))

vi.mock('@/lib/notificationService', () => ({
  NotificationService: {
    sendWelcomeNotification: vi.fn(),
  },
}))

/**
 * Auth page form markup tests.
 *
 * Updated 2026-05-17 alongside the auth redesign (see REDESIGN.md). The
 * old assertions checked for `fieldset`/`legend` grouping and a specific
 * Portal-access helper copy. The redesigned auth surface is single-card,
 * fieldset-free, and uses honest one-line helpers. These tests now assert
 * the new contract.
 */
describe('auth page form markup', () => {
  function renderAuthPage(element: React.ReactElement) {
    const queryClient = new QueryClient()
    return renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{element}</MemoryRouter>
      </QueryClientProvider>,
    )
  }

  it('renders password toggles with a neutral label instead of repeating the field label', () => {
    const markup = renderToStaticMarkup(<PasswordInput label="Password" required />)

    expect(markup).toContain('aria-label="Show password"')
    expect(markup).not.toContain('aria-label="Show characters"')
    expect(markup).not.toContain('tabindex="-1"')
  })

  it('disables native browser validation on the sign-in form so inline errors can render', () => {
    const markup = renderAuthPage(<SignInPage />)
    // Class list includes space-y-5 (post-redesign rhythm). The form must be
    // post + novalidate so the form-level error banner can render.
    expect(markup).toMatch(/<form class="[^"]*space-y-5[^"]*" method="post" novalidate="">/)
  })

  it('renders sign-in fields without legacy fieldset wrapping', () => {
    const markup = renderAuthPage(<SignInPage />)

    // The redesigned auth surface uses inline fields, not fieldsets.
    expect(markup).not.toContain('<fieldset')
    expect(markup).not.toContain('Applicant sign-in details')
    expect(markup).toContain('>Email<')
    expect(markup).toContain('>Password<')
  })

  it('disables native browser validation on the sign-up form so inline errors can render', () => {
    const markup = renderAuthPage(<SignUpPage />)
    expect(markup).toMatch(/<form class="[^"]*space-y-5[^"]*" method="post" novalidate="">/)
  })

  it('renders sign-up fields in the redesigned single-card layout', () => {
    const markup = renderAuthPage(<SignUpPage />)

    // No fieldsets / legends in the redesigned auth surface.
    expect(markup).not.toContain('<fieldset')
    expect(markup).not.toContain('Portal access')
    expect(markup).not.toContain('Profile basics')

    // Required name + contact + password fields are still present.
    expect(markup).toContain('>First name<')
    expect(markup).toContain('>Last name<')
    expect(markup).toContain('>Email<')
    expect(markup).toContain('>Phone number<')
    expect(markup).toContain('>Password<')
    expect(markup).toContain('>Confirm password<')

    // Removed-by-design fields stay absent.
    expect(markup).not.toContain('Residence and identity')
    expect(markup).not.toContain('Emergency contact')
  })

  it('uses honest helper copy instead of fake email availability states', () => {
    const markup = renderAuthPage(<SignUpPage />)

    // The redesigned helper text is more direct and honest.
    expect(markup).toContain("We&#x27;ll verify this address.")
    expect(markup).not.toContain('Checking...')
    expect(markup).not.toContain('>Available<')
    expect(markup).not.toContain('action=check-email')
  })
})
