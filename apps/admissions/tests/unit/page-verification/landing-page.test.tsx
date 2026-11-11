/**
 * Landing Page Verification Test (task 33.1, D10 option A)
 *
 * Renders the real landing page: the hero and the three lower sections. Only the
 * layout shell, the SEO head and the catalogue/brand hooks are replaced. The old
 * version of this file asserted text that its own mock of the sections supplied;
 * this one reads what the page actually renders.
 */
import React, { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

Element.prototype.scrollIntoView = vi.fn()

vi.mock('@/components/seo/Seo', () => ({ Seo: () => null }))
vi.mock('@/components/layout/PublicLayout', () => ({
  PublicLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="public-layout">{children}</div>,
}))
vi.mock('@/hooks/useDeferredHydration', () => ({ useDeferredHydration: () => true }))
vi.mock('@/lib/speculativePrefetch', () => ({ onLandingMount: () => {} }))
vi.mock('@/lib/routePreload', () => ({
  preloadAuthRoutes: () => Promise.resolve(),
  scheduleLikelyAuthRoutePreload: () => () => {},
}))
vi.mock('@/hooks/useLandingProgrammes', () => ({
  useLandingProgrammes: () => ({
    rows: [
      { key: 'a:i1', programmeName: 'Diploma in Nursing', schoolNames: ['School A'], intakeId: 'i1', intakeName: 'January 2027', closesOn: null },
    ],
    isLoading: false,
    errorMessage: null,
    retry: () => {},
  }),
}))
vi.mock('@/hooks/usePortalBrand', () => ({
  usePortalBrand: () => ({ brandName: 'Beanola Admissions', supportEmail: null, offeringInstitutionId: undefined, isLoading: false }),
}))

import LandingPage from '@/pages/LandingPage'

describe('Landing page verification', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root.render(
        <MemoryRouter>
          <LandingPage />
        </MemoryRouter>,
      )
    })
    // The lower sections are a lazy chunk; wait for the first one.
    for (let i = 0; i < 100 && !container.querySelector('#programs'); i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })
    }
  })

  afterEach(() => {
    root.unmount()
    container.remove()
  })

  it('has one heading level 1 and exactly the four decided sections', () => {
    expect(container.querySelectorAll('h1')).toHaveLength(1)
    const sectionIds = Array.from(container.querySelectorAll('section')).map((s) => s.id)
    expect(sectionIds).toEqual(['hero', 'programs', 'what-you-need', 'how-it-works'])
  })

  it('keeps both hero actions, marked for the rendered gate, pointing at sign-up and the programme list', () => {
    const primary = container.querySelector('[data-landing-action="primary"]') as HTMLAnchorElement
    const secondary = container.querySelector('[data-landing-action="secondary"]') as HTMLAnchorElement
    expect(primary.getAttribute('href')).toBe('/auth/signup')
    expect(primary.textContent).toContain('Start your application')
    expect(secondary.getAttribute('href')).toBe('#programs')
    expect(secondary.textContent).toContain('See open programmes')
  })

  it('lists the open programme with its school and an Apply link', () => {
    const programs = container.querySelector('#programs')!
    expect(programs.textContent).toContain('Diploma in Nursing')
    expect(programs.textContent).toContain('School A')
    expect(programs.querySelector('a[href="/auth/signup"]')?.textContent).toContain('Apply')
  })

  it('says what a student needs and how the application works, as lists', () => {
    const needs = container.querySelector('#what-you-need')!
    for (const item of ['NRC or passport', 'Grade 12 results', 'Mobile money or card']) {
      expect(needs.textContent).toContain(item)
    }
    const steps = container.querySelectorAll('#how-it-works ol > li')
    expect(steps).toHaveLength(4)
  })

  it('carries no school-buyer, tenant or engineering copy and no invented number', () => {
    const text = (container.textContent ?? '').toLowerCase()
    for (const phrase of ['super admin', 'tenant', 'white-label', 'onboard colleges', 'institution profile', 'k150', 'usd 20']) {
      expect(text).not.toContain(phrase)
    }
    expect(text).not.toMatch(/\d{2,}\s*%/)
  })

  it('puts no card inside a card: the sections use no card surface (bg-card) at all', () => {
    expect(container.querySelectorAll('section [class~="bg-card"]')).toHaveLength(0)
  })
})
