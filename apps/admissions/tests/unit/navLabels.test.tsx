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
    expect(navLabelFor(routeById('student.dashboard'))).toBe('Home')
    expect(navLabelFor(routeById('student.status'))).toBe('Status')
    expect(navLabelFor(routeById('student.payment'))).toBe('Payment')
    // The page title keeps the full label.
    expect(routeById('student.status').nav?.label).toBe('Application status')
  })

  it('keeps the status page on the desktop sidebar', () => {
    expect(studentNavRoutes().some((route) => route.id === 'student.status' && route.nav?.desktop)).toBe(true)
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
