/**
 * One navigation with full labels (platform-simplification task 31.1, R21.1, R15.4).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { BottomNavigation } from '@/components/ui/BottomNavigation'
import { navLabelFor, routeById, studentNavRoutes } from '@/routes/routeRegistry'
import { Home, FileText } from 'lucide-react'

afterEach(() => cleanup())

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')

describe('navLabel', () => {
  it('is the short label, falling back to the page label', () => {
    expect(navLabelFor(routeById('student.dashboard'))).toBe('My application')
    expect(navLabelFor(routeById('student.status'))).toBe('Status')
    expect(navLabelFor(routeById('student.payment'))).toBe('Payment')
    // The page title keeps the full label.
    expect(routeById('student.status').nav?.label).toBe('Application status')
  })

  it('offers exactly three student destinations on desktop and mobile (task 34.1, D16 option A, R21.3)', () => {
    const routes = studentNavRoutes()
    expect(routes.map((route) => navLabelFor(route))).toEqual(['My application', 'Messages', 'Account'])
    expect(routes.every((route) => route.nav?.desktop && route.nav?.mobile)).toBe(true)
  })

  it('keeps every route a destination replaced live, and highlights its destination', () => {
    const mine = routeById('student.dashboard').nav?.activeMatchPaths ?? []
    for (const id of ['student.applicationWizard', 'student.status', 'student.payment', 'student.interview'] as const) {
      const route = routeById(id)
      expect(route.path.length).toBeGreaterThan(1)
      expect(mine.some((prefix) => route.path === prefix || route.path.startsWith(`${prefix}/`))).toBe(true)
    }
    const account = routeById('student.settings').nav?.activeMatchPaths ?? []
    expect(account).toContain(routeById('student.notifications').path)
    const messages = routeById('student.communications').nav?.activeMatchPaths ?? []
    expect(messages).toContain(routeById('student.history').path)
  })

  it('reaches the documents within two activations of the dashboard', () => {
    // 1: My application (dashboard). 2: the application row's link to the workspace, which owns the documents.
    expect(read('src/components/student/ApplicationListItem.tsx')).toContain('studentApplicationWorkspacePath(application.id)')
    expect(routeById('student.status').path).toBe('/student/status')
  })

  it('feeds both the sidebar and the bottom bar; no hand-written overrides remain', () => {
    expect(read('src/components/navigation/DesktopSidebar.tsx')).toContain('label: navLabelFor(route)')
    const layout = read('src/components/navigation/AppLayout.tsx')
    expect(layout).toContain('label: navLabelFor(route)')
    expect(layout).not.toMatch(/navItemFromRoute\([^)]*,\s*'/)
  })

  it('never truncates a bottom-bar label', () => {
    expect(read('src/components/ui/BottomNavigation.tsx')).not.toMatch(/\btruncate\b/)
  })
})

describe('the bottom bar name contains the visible text', () => {
  it('uses the same string for the visible span and the accessible name, with the count suffix', () => {
    render(
      <MemoryRouter>
        <BottomNavigation
          isAuthenticated
          items={[
            { href: '/student/dashboard', label: 'Home', icon: Home },
            { href: '/student/application-wizard', label: 'Apply', icon: FileText, badge: 3 },
          ]}
        />
      </MemoryRouter>,
    )
    const home = screen.getByRole('link', { name: 'Home' })
    expect(home.textContent).toContain('Home')
    const apply = screen.getByRole('link', { name: 'Apply (3 updates)' })
    expect(apply.textContent).toContain('Apply')
  })
})

describe('the mobile header names the page from the route registry (task 31.3, R21.6)', () => {
  it('reads the registry label before the fallback map', () => {
    const layout = read('src/components/navigation/AppLayout.tsx')
    expect(layout).toContain('const registryLabel = routeByPath(pathname)?.nav?.label')
    expect(layout.indexOf('registryLabel')).toBeLessThan(layout.indexOf('const exactMatch = pageTitles[pathname]'))
  })
})

describe('nested cards are flattened in the shared primitives (task 31.3, R21.5)', () => {
  it('SectionCard headers are not a second card', () => {
    const src = read('src/components/ui/SectionCard.tsx')
    expect(src).toContain("default: 'bg-transparent'")
    expect(src).toContain("headerVariant !== 'tinted' && 'border-b border-border/45'")
  })

  it('Alert has an inset form with no border for use inside a card', () => {
    const src = read('src/components/ui/Alert.tsx')
    expect(src).toContain('inset = false')
    expect(read('src/pages/student/applicationWizard/steps/SubmitStep.tsx')).toContain('<Alert inset ')
  })
})
