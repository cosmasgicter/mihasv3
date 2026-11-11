/**
 * The super-admin shell is marked, and metric definitions open on tap, click and
 * keyboard (platform-simplification task 30.5, R17.8, R17.9).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PageShell } from '@/components/ui/PageShell'
import { MobilePageHeader } from '@/components/ui/MobilePageHeader'

const capabilityState = { isSuperAdmin: false }

vi.mock('@/contexts/CapabilityContext', () => ({
  useCapabilities: () => capabilityState,
}))
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'a@example.com' }, isAdmin: true }),
}))
vi.mock('@/hooks/auth/useProfileQuery', () => ({ useProfileQuery: () => ({ profile: null }) }))
vi.mock('@/contexts/SidebarContext', () => ({ useSidebar: () => ({ collapsed: false }) }))
vi.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isMobile: false }) }))
vi.mock('@/hooks/useScrollDirection', () => ({ useScrollDirection: () => 'up' }))
vi.mock('@/components/ui/UserMenu', () => ({ UserMenu: () => null }))
vi.mock('@/components/student/NotificationBell', () => ({ NotificationBell: () => null }))

import { Header, PLATFORM_SCOPE_LABEL } from '@/components/navigation/Header'

afterEach(() => cleanup())

describe('the super-admin shell is marked (R17.8)', () => {
  it('shows the platform scope label on the dark adminColors bar for a super admin', () => {
    capabilityState.isSuperAdmin = true
    const { container } = render(<Header />)
    expect(screen.getByTestId('platform-scope-label').textContent).toBe('Platform admin · all schools')
    const header = container.querySelector('header') as HTMLElement
    expect(header.getAttribute('data-shell-scope')).toBe('platform')
    // adminColors.text, #111827
    expect(header.style.backgroundColor).toBe('rgb(17, 24, 39)')
  })

  it('keeps the light bar and no platform label for a tenant admin', () => {
    capabilityState.isSuperAdmin = false
    const { container } = render(<Header />)
    expect(screen.queryByTestId('platform-scope-label')).toBeNull()
    const header = container.querySelector('header') as HTMLElement
    expect(header.getAttribute('data-shell-scope')).toBeNull()
    expect(header.className).toContain('bg-background')
  })

  it('carries the same label on the mobile header', () => {
    const { container } = render(<MobilePageHeader title="Applications" scopeLabel={PLATFORM_SCOPE_LABEL} />)
    expect(screen.getByText('Platform admin · all schools')).toBeTruthy()
    expect((container.querySelector('header') as HTMLElement).style.backgroundColor).toBe('rgb(17, 24, 39)')
  })
})

describe('metric definitions are a disclosure (R17.9)', () => {
  const renderShell = () =>
    render(
      <PageShell
        title="Applications"
        metrics={[{ label: 'Decision queue', value: 4, helper: 'Waiting on a staff decision.' }]}
      >
        <p>body</p>
      </PageShell>,
    )

  it('hides the definition until the info button is clicked', () => {
    renderShell()
    const button = screen.getByRole('button', { name: 'About Decision queue' })
    const definition = document.getElementById(button.getAttribute('aria-controls') as string) as HTMLElement
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(definition.hidden).toBe(true)
    expect(definition.textContent).toBe('Waiting on a staff decision.')
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(definition.hidden).toBe(false)
    fireEvent.click(button)
    expect(definition.hidden).toBe(true)
  })

  it('opens from the keyboard: the control is a native button, so Enter and Space activate it', () => {
    renderShell()
    const button = screen.getByRole('button', { name: 'About Decision queue' })
    expect(button.tagName).toBe('BUTTON')
    expect(button.getAttribute('type')).toBe('button')
    button.focus()
    expect(document.activeElement).toBe(button)
    // jsdom does not turn Enter or Space into a click; every browser does for a
    // native <button type="button">, so the keyboard path is the click handler.
    // The browser check is in the G8 evidence (Playwright, Enter and Space).
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(button.className).toMatch(/min-h-touch/)
    expect(button.className).toMatch(/min-w-touch/)
  })

  it('renders no info button for a metric with no definition', () => {
    render(
      <PageShell title="T" metrics={[{ label: 'Total', value: 1 }]}>
        <p>body</p>
      </PageShell>,
    )
    expect(screen.queryByRole('button', { name: /About/ })).toBeNull()
  })
})
