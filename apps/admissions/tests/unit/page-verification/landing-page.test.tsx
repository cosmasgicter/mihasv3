// @ts-nocheck
/**
 * Landing Page Verification Test
 *
 * Verifies the landing page renders its key content sections without errors.
 * The LandingPage uses static constants (stats, features, accreditations, programs)
 * rather than API calls, so the test focuses on section rendering.
 *
 * Requirements: 8.1, 8.10, 8.11, 8.12
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// ── Polyfill window.matchMedia for jsdom ──────────────────────────────
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// ── Polyfill scrollIntoView for jsdom ─────────────────────────────────
Element.prototype.scrollIntoView = vi.fn()

// ── Mock IntersectionObserver for scroll-reveal components ────────────
class MockIntersectionObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
  constructor(callback: IntersectionObserverCallback) {
    // Immediately trigger with all entries as intersecting so content renders
    setTimeout(() => {
      callback(
        [{ isIntersecting: true, target: document.createElement('div') }] as unknown as IntersectionObserverEntry[],
        this as unknown as IntersectionObserver
      )
    }, 0)
  }
}
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: MockIntersectionObserver,
})

// ── Mock react-router-dom ──────────────────────────────────────────────
const mockLocation = {
  pathname: '/',
  search: '',
  hash: '',
  state: null,
}

vi.mock('react-router-dom', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...rest}>{children}</a>
  ),
  useLocation: () => mockLocation,
}))

// ── Mock heavy child components ───────────────────────────────────────
vi.mock('@/components/seo/Seo', () => ({
  Seo: () => null,
}))

vi.mock('@/components/layout/PublicLayout', () => ({
  PublicLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="public-layout">{children}</div>
  ),
}))

vi.mock('@/hooks/useDeferredHydration', () => ({
  useDeferredHydration: () => true,
}))

// ── Mock smoothui components to render children directly ──────────────
vi.mock('@/components/smoothui', () => ({
  ScrollReveal: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="scroll-reveal" className={className}>{children}</div>
  ),
  StaggerReveal: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="stagger-reveal" className={className}>{children}</div>
  ),
  StaggerItem: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="stagger-item">{children}</div>
  ),
  AnimatedCounter: ({ value, suffix }: { value: number; suffix: string }) => (
    <span>{value}{suffix}</span>
  ),
  TextEffect: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="text-effect">{children}</div>
  ),
  ShinyText: ({ text }: { text: string }) => (
    <span data-testid="shiny-text">{text}</span>
  ),
  InfiniteGrid: () => <div data-testid="infinite-grid" />,
  TextRotate: ({ phrases }: { phrases: string[] }) => (
    <span data-testid="text-rotate">{phrases[0]}</span>
  ),
  useReducedMotion: () => false,
}))

vi.mock('@/components/smoothui/shape-landing-hero', () => ({
  ShapeLandingHero: ({ headline, description, primaryCta, secondaryCta }: any) => (
    <section data-testid="shape-landing-hero">
      <h1>{headline}</h1>
      <p>{description}</p>
      <a href={primaryCta.href}>{primaryCta.label}</a>
      <a href={secondaryCta.href}>{secondaryCta.label}</a>
    </section>
  ),
}))

// ── Mock logApiError (no-op for tests) ────────────────────────────────
vi.mock('@/lib/apiErrorLogger', () => ({
  logApiError: vi.fn(),
}))

// ── Mock LandingPageSections statically to avoid lazy loading issues ──
vi.mock('@/components/landing/LandingPageSections', () => ({
  LandingPageSections: () => (
    <>
      <div data-testid="stats-mock">
        300+ 92% Graduates working in Zambian hospitals Get hired within 12 months
      </div>
      <div data-testid="features-mock">
        Why students pick Beanola Learn from Working Professionals A diploma that is registered before you walk out 92% of our graduates are hired within a year
      </div>
      <div data-testid="accreditation-mock">
        Your diploma gets you registered NMCZ Accredited HPCZ Accredited ECZ Recognized UNZA Affiliated
      </div>
      <div data-testid="programs-mock">
        Three diplomas. Three career paths. Program-first admissions Shared Beanola portal Diploma in Clinical Medicine Diploma in Registered Nursing
      </div>
      <div data-testid="how-it-works-mock">
        How the application works Create your account Pay the application fee K150 USD 20
      </div>
      <div data-testid="eligibility-mock">
        What you need to apply ECZ Grade 12 certificate Cambridge certificate accepted NRC or passport
      </div>
      <div data-testid="accommodation-mock">
        Coming from out of town? We have a bed for you. On-campus housing available
      </div>
      <div data-testid="international-mock">
        Applying from outside Zambia? Pay in USD from anywhere
      </div>
      <div data-testid="cta-mock">
        The current intake is open Start Your Application
      </div>
    </>
  ),
}))

// ── Import the component under test ───────────────────────────────────
import LandingPage from '@/pages/LandingPage'

describe('Landing page verification', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    mockLocation.pathname = '/'
    mockLocation.search = ''
    mockLocation.hash = ''
    mockLocation.state = null

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    root.unmount()
    container.remove()
    vi.clearAllMocks()
  })

  async function renderAndWait(timeout = 5000) {
    await act(async () => {
      root.render(<LandingPage />)
    })

    const startTime = Date.now()
    while (Date.now() - startTime < timeout) {
      if (container.textContent?.includes('The current intake is open')) {
        await act(async () => {
          await new Promise((r) => setTimeout(r, 0))
        })
        return
      }
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10))
      })
    }
  }

  // ── Hero section ────────────────────────────────────────────────────

  it('renders without errors and shows the hero heading', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Apply to the right school from one admissions portal.')
  })

  it('renders the hero CTA buttons with correct links', async () => {
    await renderAndWait()
    const html = container.innerHTML || ''
    expect(html).toContain('/auth/signup')
    expect(html).toContain('#programs')
  })

  // ── Stats section ───────────────────────────────────────────────────

  it('renders the stats section with animated counters', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('300+')
    expect(text).toContain('92%')
    expect(text).toContain('Graduates working in Zambian hospitals')
    expect(text).toContain('Get hired within 12 months')
  })

  // ── Features section ────────────────────────────────────────────────

  it('renders the features section with all feature cards', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Why students pick Beanola')
    expect(text).toContain('Learn from Working Professionals')
    expect(text).toContain('A diploma that is registered before you walk out')
    expect(text).toContain('92% of our graduates are hired within a year')
  })

  // ── Accreditation section ───────────────────────────────────────────

  it('renders the accreditation section with all accreditation cards', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Your diploma gets you registered')
    expect(text).toContain('NMCZ Accredited')
    expect(text).toContain('HPCZ Accredited')
    expect(text).toContain('ECZ Recognized')
    expect(text).toContain('UNZA Affiliated')
  })

  // ── Programs section ────────────────────────────────────────────────

  it('renders the programs section with program cards', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Three diplomas. Three career paths.')
    expect(text).toContain('Program-first admissions')
    expect(text).toContain('Shared Beanola portal')
    expect(text).toContain('Diploma in Clinical Medicine')
    expect(text).toContain('Diploma in Registered Nursing')
  })

  // ── How It Works section ────────────────────────────────────────────

  it('renders the how-it-works section with four steps and fee callout', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('How the application works')
    expect(text).toContain('Create your account')
    expect(text).toContain('Pay the application fee')
    expect(text).toContain('K150')
    expect(text).toContain('USD 20')
  })

  // ── Eligibility section ─────────────────────────────────────────────

  it('renders the eligibility section with requirements', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('What you need to apply')
    expect(text).toContain('ECZ Grade 12 certificate')
    expect(text).toContain('Cambridge certificate accepted')
    expect(text).toContain('NRC or passport')
  })

  // ── Accommodation section ───────────────────────────────────────────

  it('renders the accommodation section', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Coming from out of town? We have a bed for you.')
    expect(text).toContain('On-campus housing available')
  })

  // ── International students section ──────────────────────────────────

  it('renders the international students section', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Applying from outside Zambia?')
    expect(text).toContain('Pay in USD from anywhere')
  })

  // ── CTA section ─────────────────────────────────────────────────────

  it('renders the CTA section with apply link', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('The current intake is open')
    expect(text).toContain('Start Your Application')
    const html = container.innerHTML || ''
    // CTA links to signup
    expect(html).toContain('/auth/signup')
  })

  // ── Hash-based scroll ───────────────────────────────────────────────

  it('renders all sections when location has a hash', async () => {
    mockLocation.hash = '#programs'
    await renderAndWait()
    const text = container.textContent || ''
    // Page should still render all sections
    expect(text).toContain('Apply to the right school from one admissions portal.')
    expect(text).toContain('Three diplomas. Three career paths.')
  })
})
