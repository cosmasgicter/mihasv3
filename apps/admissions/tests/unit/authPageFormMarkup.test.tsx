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

vi.mock('@/components/auth/AuthLayout', () => ({
  AuthLayout: ({ children, footer }: { children?: React.ReactNode; footer?: React.ReactNode }) => (
    <div>
      {children}
      {footer}
    </div>
  ),
}))

vi.mock('@/lib/notificationService', () => ({
  NotificationService: {
    sendWelcomeNotification: vi.fn(),
  },
}))

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

    expect(markup).toContain('<form class="space-y-6" novalidate="">')
  })

  it('groups sign-in credentials inside a labelled fieldset', () => {
    const markup = renderAuthPage(<SignInPage />)

    expect(markup).toContain('<legend class="text-sm font-semibold text-foreground">Applicant sign-in details</legend>')
    expect(markup).toContain('>Account email<')
    expect(markup).toContain('>Account password<')
  })

  it('disables native browser validation on the sign-up form so inline errors can render', () => {
    const markup = renderAuthPage(<SignUpPage />)

    expect(markup).toContain('<form class="space-y-6" novalidate="">')
  })

  it('groups sign-up fields into labelled sections', () => {
    const markup = renderAuthPage(<SignUpPage />)

    expect(markup).toContain('<legend class="text-base font-semibold text-foreground">Portal access</legend>')
    expect(markup).toContain('<legend class="text-base font-semibold text-foreground">Profile basics</legend>')
    expect(markup).toContain('<legend class="text-base font-semibold text-foreground">Residence and identity</legend>')
    expect(markup).toContain('<legend class="text-base font-semibold text-foreground">Emergency contact</legend>')
  })

  it('uses honest helper copy instead of fake email availability states', () => {
    const markup = renderAuthPage(<SignUpPage />)

    expect(markup).toContain('We verify this email when you submit the form.')
    expect(markup).not.toContain('Checking...')
    expect(markup).not.toContain('>Available<')
    expect(markup).not.toContain('action=check-email')
  })
})
