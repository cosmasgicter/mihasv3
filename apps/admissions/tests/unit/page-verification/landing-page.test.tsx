// @ts-nocheck
/**
 * Landing Page Verification Test
 *
 * Verifies the landing page renders its key content sections without errors.
 * The LandingPage uses static constants (stats, features, accreditations, programs)
 * rather than API calls, so the test focuses on section rendering and auth redirect behavior.
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
const mockNavigate = vi.fn()
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
  useNavigate: () => mockNavigate,
  useLocation: () => mockLocation,
}))

// ── Mock AuthContext (unauthenticated by default) ─────────────────────
const mockUseAuth = vi.fn()

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
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
  ShapeLandingHero: ({ headline, description, primaryCta, secondaryCta, imageSrc, imageAlt }: any) => (
    <section data-testid="shape-landing-hero">
      <h1>{headline}</h1>
      <p>{description}</p>
      <a href={primaryCta.href}>{primaryCta.label}</a>
      <a href={secondaryCta.href}>{secondaryCta.label}</a>
      <img src={imageSrc} alt={imageAlt} />
    </section>
  ),
}))

// ── Mock logApiError (no-op for tests) ────────────────────────────────
vi.mock('@/lib/apiErrorLogger', () => ({
  logApiError: vi.fn(),
}))

// ── Import the component under test ───────────────────────────────────
import LandingPage from '@/pages/LandingPage'

describe('Landing page verification', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    mockNavigate.mockClear()
    mockLocation.pathname = '/'
    mockLocation.search = ''
    mockLocation.hash = ''
    mockLocation.state = null

    // Default: unauthenticated visitor
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      isAdmin: false,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    })

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    root.unmount()
    container.remove()
    vi.clearAllMocks()
  })

  async function renderAndWait(ms = 300) {
    root.render(<LandingPage />)
    await new Promise((r) => setTimeout(r, ms))
  }

  // ── Hero section ────────────────────────────────────────────────────

  it('renders without errors and shows the hero heading', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Your Future Starts Here')
  })

  it('renders the hero CTA buttons with correct links', async () => {
    await renderAndWait()
    const html = container.innerHTML || ''
    expect(html).toContain('/auth/signup')
    expect(html).toContain('#features')
  })

  // ── Stats section ───────────────────────────────────────────────────

  it('renders the stats section with animated counters', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('300+')
    expect(text).toContain('92%')
    expect(text).toContain('Graduates Employed')
    expect(text).toContain('Job Placement Rate')
  })

  // ── Features section ────────────────────────────────────────────────

  it('renders the features section with all feature cards', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Why Choose MIHAS-KATC')
    expect(text).toContain('Career-Ready Training')
    expect(text).toContain('Government Recognized Qualifications')
    expect(text).toContain('Guaranteed Job Placement Support')
  })

  // ── Accreditation section ───────────────────────────────────────────

  it('renders the accreditation section with all accreditation cards', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Qualifications Recognized by Employers')
    expect(text).toContain('NMCZ Accredited')
    expect(text).toContain('HPCZ Accredited')
    expect(text).toContain('ECZ Recognized')
    expect(text).toContain('UNZA Affiliated')
  })

  // ── Programs section ────────────────────────────────────────────────

  it('renders the programs section with program cards', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('High-Demand Healthcare Jobs Training Programs')
    expect(text).toContain('Kalulushi Training Centre')
    expect(text).toContain('Mukuba Institute of Health and Applied Sciences')
    expect(text).toContain('Diploma in Clinical Medicine')
    expect(text).toContain('Diploma in Registered Nursing')
  })

  // ── CTA section ─────────────────────────────────────────────────────

  it('renders the CTA section with apply link', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Ready to Secure Your Healthcare Job')
    expect(text).toContain('Apply Now')
    const html = container.innerHTML || ''
    // CTA links to signup
    expect(html).toContain('/auth/signup')
  })

  // ── Auth redirect behavior ──────────────────────────────────────────

  it('redirects authenticated student to /student/dashboard', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-001', email: 'student@example.com', role: 'student' },
      loading: false,
      isAdmin: false,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    })

    await renderAndWait()
    expect(mockNavigate).toHaveBeenCalledWith('/student/dashboard')
  })

  it('redirects authenticated admin to /admin/dashboard', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-002', email: 'admin@example.com', role: 'admin' },
      loading: false,
      isAdmin: true,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    })

    await renderAndWait()
    expect(mockNavigate).toHaveBeenCalledWith('/admin/dashboard')
  })

  it('does not redirect when auth is still loading', async () => {
    mockUseAuth.mockReturnValue({
      user: null,
      loading: true,
      isAdmin: false,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    })

    await renderAndWait()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  // ── Hash-based scroll ───────────────────────────────────────────────

  it('renders all sections when location has a hash', async () => {
    mockLocation.hash = '#programs'
    await renderAndWait()
    const text = container.textContent || ''
    // Page should still render all sections
    expect(text).toContain('Your Future Starts Here')
    expect(text).toContain('High-Demand Healthcare Jobs Training Programs')
  })
})
