// @ts-nocheck
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('react-router-dom', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...rest}>{children}</a>
  ),
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'user-001',
      email: 'student@example.com',
      role: 'student',
      full_name: 'Jane Doe',
    },
  }),
}))

vi.mock('@/hooks/useToast', () => ({
  useToastStore: () => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}))

vi.mock('@/hooks/auth/useProfileQuery', () => ({
  useProfileQuery: () => ({
    profile: {
      id: 'user-001',
      email: 'student@example.com',
      role: 'student',
      full_name: 'Jane Doe',
      phone: '+260971234567',
      date_of_birth: '2000-01-01',
      sex: 'Female',
      residence_town: 'Lusaka',
      country: 'Zambia',
      nationality: 'Zambian',
      next_of_kin_name: 'John Doe',
      next_of_kin_phone: '+260971111111',
    },
    updateProfile: vi.fn(),
    updatingProfile: false,
    updateError: null,
  }),
}))

vi.mock('@/hooks/useProfileAutoPopulation', () => ({
  useProfileAutoPopulation: () => ({
    metadata: null,
  }),
  getBestValue: (...values: Array<string | null | undefined>) => values.find((value) => value && String(value).trim().length > 0) ?? '',
}))

vi.mock('@/hooks/useResidenceLocationOptions', () => ({
  useResidenceLocationOptions: () => ({
    countryOptions: [{ value: 'Zambia', label: 'Zambia' }],
    cityOptions: [{ value: 'Lusaka', label: 'Lusaka' }],
    loadingCountries: false,
    loadingCities: false,
  }),
}))

vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, asChild, disabled, ...rest }: any) => {
    if (asChild) {
      return children
    }
    return <button disabled={disabled} {...rest}>{children}</button>
  },
}))

vi.mock('@/components/ui/input', () => ({
  Input: React.forwardRef(({ label, id, disabled, value, ...rest }: any, ref) => (
    <label>
      <span>{label}</span>
      <input ref={ref} id={id} aria-label={label} disabled={disabled} defaultValue={value} {...rest} />
    </label>
  )),
}))

vi.mock('@/components/ui/form-select', () => ({
  FormSelect: ({ label, name, disabled }: any) => (
    <label>
      <span>{label}</span>
      <select aria-label={label} name={name} disabled={disabled}>
        <option value="">Mock option</option>
      </select>
    </label>
  ),
}))

vi.mock('@/components/ui/ActiveSessions', () => ({
  ActiveSessions: () => <div>Mock active sessions</div>,
}))

vi.mock('@/components/ui/SectionCard', () => ({
  SectionCard: ({ title, description, children, actions }: any) => (
    <section>
      <h2>{title}</h2>
      <p>{description}</p>
      {actions}
      {children}
    </section>
  ),
}))

vi.mock('@/components/ui/PageShell', () => ({
  PageShell: ({ title, subtitle, actions, children }: any) => (
    <div>
      <h1>{title}</h1>
      <p>{subtitle}</p>
      {actions}
      {children}
    </div>
  ),
}))

import StudentSettings from '@/pages/student/Settings'

describe('Student settings page verification', () => {
  function renderPage() {
    return renderToStaticMarkup(<StudentSettings />)
  }

  it('renders an editable profile form with save button', () => {
    const html = renderPage()
    const text = html.replace(/<[^>]+>/g, ' ')
    expect(text).not.toContain('Profile editing is temporarily unavailable.')
    expect(text).toContain('Review your account details')
    expect(text).toContain('Save changes')
  })

  it('renders profile form controls for editing', () => {
    const html = renderPage()

    expect(html).toContain('aria-label="Full name"')
    expect(html).toContain('aria-label="Phone number"')
    expect(html).toContain('Save changes')
    // Account email is always disabled
    expect(html).toContain('aria-label="Account email"')
  })
})
