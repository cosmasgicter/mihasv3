import React from 'react'
import { describe, it, expect, beforeEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import {
  BottomNavigation,
  type BottomNavItem,
} from '@/components/ui/BottomNavigation'
import {
  LayoutDashboard,
  FileText,
  CreditCard,
  Calendar,
  Bell,
  Settings,
  LogOut,
} from 'lucide-react'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mobileItems: BottomNavItem[] = [
  { href: '/student/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/student/application-wizard', label: 'Apply', icon: FileText },
  { href: '/student/payment', label: 'Payment', icon: CreditCard },
  { href: '/student/interview', label: 'Interview', icon: Calendar },
  { href: '/student/notifications', label: 'Notifications', icon: Bell },
  { href: '/student/settings', label: 'Profile & Settings', icon: Settings, activeMatchPaths: ['/student/settings', '/student/profile'] },
  { href: '/auth/signin', label: 'Logout', icon: LogOut, onClick: () => undefined, activeMatchPaths: [] },
]

function renderNav(width: number, route: string = '/student/dashboard') {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width })
  act(() => {
    window.dispatchEvent(new Event('resize'))
  })

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(
      <MemoryRouter initialEntries={[route]}>
        <BottomNavigation items={mobileItems} isAuthenticated overflowMode />
      </MemoryRouter>
    )
  })

  return {
    container,
    unmount() {
      act(() => {
        root.unmount()
      })
      container.remove()
    },
  }
}

describe('BottomNavigation mobile overflow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('matches snapshot at 320px and uses icon-only primary tabs', () => {
    const { container, unmount } = renderNav(320)
    expect(container.innerHTML).toMatchSnapshot()
    expect(container.textContent).not.toContain('Dashboard')
    const moreButton = container.querySelector('button[aria-label="More navigation items"]')
    expect(moreButton).not.toBeNull()
    unmount()
  })

  it('matches snapshot at 360px with text labels visible', () => {
    const { container, unmount } = renderNav(360)
    expect(container.innerHTML).toMatchSnapshot()
    expect(container.textContent).toContain('Dashboard')
    expect(container.textContent).toContain('Apply')
    unmount()
  })

  it('matches snapshot at 390px and highlights More for nested profile routes', () => {
    const { container, unmount } = renderNav(390, '/student/profile/edit')
    expect(container.innerHTML).toMatchSnapshot()
    const moreButton = container.querySelector('button[aria-label="More navigation items"]')
    expect(moreButton?.getAttribute('class')).toContain('bg-primary')
    unmount()
  })

  it('opens More menu with overflow items', () => {
    const { container, unmount } = renderNav(390)
    const moreButton = container.querySelector('button[aria-label="More navigation items"]') as HTMLButtonElement | null
    expect(moreButton).not.toBeNull()

    act(() => {
      moreButton?.click()
    })

    const menu = container.querySelector('#bottom-navigation-overflow')
    expect(menu).not.toBeNull()
    expect(menu?.textContent).toContain('Notifications')
    expect(menu?.textContent).toContain('Profile & Settings')
    expect(menu?.textContent).toContain('Logout')
    unmount()
  })
})
