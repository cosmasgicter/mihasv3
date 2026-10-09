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

  /**
   * **GATE-13.3-11** — task 13.6 remediation L6, blocking item **B8**.
   *
   * Task 13.3 scanned this bar with axe at 320 x 568 and got `link-name`
   * (serious, WCAG 2.4.4 / 4.1.2) on **all four** primary items: below 360 px
   * `iconOnly` drops the label span and nothing replaced it — no `aria-label`, and a
   * decorative icon — so every measured name was `aria-label: null, text: ""`.
   *
   * 320 px is the one width in R16.7's list under that threshold, and it is exactly
   * the width R16.1 says the student experience *"SHALL be designed at … first"*. So
   * the primary navigation stopped telling a screen-reader user where anything went,
   * at the design width.
   *
   * The three snapshots above already *contain* the fix, but a snapshot records
   * whatever is there — it cannot state a claim. This case states it: at the width
   * that failed, every item has a non-empty accessible name, and the icon and the
   * label span are hidden from the accessibility tree so that name is exactly one
   * string.
   */
  it('GATE-13.3-11: every bottom-nav item has an accessible name at 320px', () => {
    const { container, unmount } = renderNav(320)

    const items = Array.from(container.querySelectorAll('nav a, nav button'))
    expect(items.length, 'the bar should render its primary items plus More').toBe(5)

    for (const item of items) {
      const label = item.getAttribute('aria-label') ?? ''
      expect(
        label.trim().length,
        `every item needs an accessible name at 320px; got "${label}" on ${item.outerHTML.slice(0, 120)}`,
      ).toBeGreaterThan(0)
    }

    // The four links carry the item labels; the fifth control is the More button.
    const linkNames = Array.from(container.querySelectorAll('nav a')).map((a) =>
      a.getAttribute('aria-label'),
    )
    expect(linkNames).toEqual(['Dashboard', 'Apply', 'Payment', 'Interview'])

    // One name, not an icon's plus a truncated label's.
    for (const icon of Array.from(container.querySelectorAll('nav svg'))) {
      expect(icon.getAttribute('aria-hidden')).toBe('true')
    }

    unmount()
  })

  /**
   * The same claim at a width where the label *is* visible — because the fix is
   * unconditional, not a second code path that only runs under 360 px. A conditional
   * `aria-label` would pass the case above and could regress on its own.
   */
  it('GATE-13.3-11: the accessible name matches the visible label at 360px', () => {
    const { container, unmount } = renderNav(360)

    for (const link of Array.from(container.querySelectorAll('nav a'))) {
      const label = link.getAttribute('aria-label') ?? ''
      expect(label.trim().length).toBeGreaterThan(0)
      expect(link.textContent?.trim()).toBe(label)
    }

    // GATE-13.3-12: the label is at the type scale's floor, not below it.
    for (const span of Array.from(container.querySelectorAll('nav a span'))) {
      expect(span.getAttribute('class')).toContain('text-xs')
      expect(span.getAttribute('class')).not.toContain('text-[10px]')
    }

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
    /*
      Task 13.6 remediation L6 (GATE-13.3-12): the active wash is `bg-accent`, not
      `bg-primary/10`.

      `text-primary` on a 10 % wash of itself measures **4.49 : 1** — marginally under
      AA's 4.5 — and axe reported it as a serious `color-contrast` row on this bar's
      active label and on the *More* label. `accent` / `accent-foreground` is an
      existing token pair in `src/styles/design-tokens.css` for a tinted surface with
      an accessible foreground, and it measures **7.2 : 1**.

      The claim this case makes is unchanged: **the More control is visibly
      highlighted for a nested profile route.** Only the token changed, so the
      assertion names the token the platform now uses — and asserts the retired one is
      gone, so a revert cannot pass silently.
    */
    expect(moreButton?.getAttribute('class')).toContain('bg-accent')
    expect(moreButton?.getAttribute('class')).toContain('text-accent-foreground')
    expect(moreButton?.getAttribute('class')).not.toContain('bg-primary/10')
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
