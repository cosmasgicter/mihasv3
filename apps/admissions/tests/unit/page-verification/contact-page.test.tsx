// @ts-nocheck
/**
 * Contact Page Verification Test
 *
 * Verifies the contact page renders its form and contact info sections without errors.
 * The ContactPage uses react-hook-form + Zod and prepares a prefilled
 * mailto draft for admissions contact.
 * Tests cover rendering, form input acceptance, and submission state transitions.
 *
 * Requirements: 8.2, 8.10, 8.11, 8.12
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
vi.mock('react-router-dom', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...rest}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/contact', search: '', hash: '', state: null }),
}))

// ── Mock AuthContext (unauthenticated by default) ─────────────────────
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    isAdmin: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  }),
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
}))

// ── Mock logApiError (no-op for tests) ────────────────────────────────
vi.mock('@/lib/apiErrorLogger', () => ({
  logApiError: vi.fn(),
}))

// ── Import the component under test ───────────────────────────────────
import ContactPage from '@/pages/ContactPage'

describe('Contact page verification', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.clearAllMocks()
  })

  async function renderAndWait(ms = 300) {
    await act(async () => {
      root.render(<ContactPage />)
    })
    await new Promise((r) => setTimeout(r, ms))
  }

  // ── Page heading and layout ─────────────────────────────────────────

  it('renders without errors and shows the page heading', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Talk to admissions')
  })

  it('renders the back-to-home link', async () => {
    await renderAndWait()
    const html = container.innerHTML || ''
    expect(html).toContain('href="/"')
    const text = container.textContent || ''
    expect(text).toContain('Back to Home')
  })

  it('renders the page description', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('WhatsApp is fastest')
  })

  // ── Contact info section ────────────────────────────────────────────

  it('renders contact phone numbers', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('KATC')
    expect(text).toContain('MIHAS')
    expect(text).toContain('+260 966 992 299')
    expect(text).toContain('+260 961 515 151')
  })

  it('renders contact email', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('info@mihas.edu.zm')
  })

  it('renders both campus addresses', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    // MIHAS address — the one the institution actually operates from
    expect(text).toContain('Plot 3375 Off President Avenue, Kalulushi')
    expect(text).toContain('Civic Centre')
    // KATC address — distinct location (Dag Hammarskjöld Road)
    expect(text).toContain('Dag Hammarskjöld')
    expect(text).toContain('10101')
  })

  // ── Contact form rendering ──────────────────────────────────────────

  it('renders the contact form with all fields', async () => {
    await renderAndWait()
    const nameInput = container.querySelector('input[name="name"]') as HTMLInputElement
    const emailInput = container.querySelector('input[name="email"]') as HTMLInputElement
    const messageInput = container.querySelector('#contact-message') as HTMLTextAreaElement

    expect(nameInput).toBeTruthy()
    expect(emailInput).toBeTruthy()
    expect(messageInput).toBeTruthy()
  })

  it('renders form labels', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Name')
    expect(text).toContain('Email')
    expect(text).toContain('Message')
  })

  it('renders the submit button', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Prepare Email Draft')
  })

  // ── Form accepts input ──────────────────────────────────────────────

  it('accepts input in the name field', async () => {
    await renderAndWait()
    const nameInput = container.querySelector('input[name="name"]') as HTMLInputElement
    expect(nameInput).toBeTruthy()

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      )!.set!
      nativeInputValueSetter.call(nameInput, 'John Doe')
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(nameInput.value).toBe('John Doe')
  })

  it('accepts input in the email field', async () => {
    await renderAndWait()
    const emailInput = container.querySelector('input[name="email"]') as HTMLInputElement
    expect(emailInput).toBeTruthy()

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      )!.set!
      nativeInputValueSetter.call(emailInput, 'john@example.com')
      emailInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(emailInput.value).toBe('john@example.com')
  })

  it('accepts input in the message field', async () => {
    await renderAndWait()
    const messageInput = container.querySelector('#contact-message') as HTMLTextAreaElement
    expect(messageInput).toBeTruthy()

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value'
      )!.set!
      nativeInputValueSetter.call(messageInput, 'I have a question about admissions.')
      messageInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(messageInput.value).toBe('I have a question about admissions.')
  })

  // ── Form submission ─────────────────────────────────────────────────

  it('shows a prepared email draft after form submission', async () => {
    await renderAndWait()

    const nameInput = container.querySelector('input[name="name"]') as HTMLInputElement
    const emailInput = container.querySelector('input[name="email"]') as HTMLInputElement
    const messageInput = container.querySelector('#contact-message') as HTMLTextAreaElement

    // Fill in form fields using native value setters for react-hook-form compatibility
    await act(async () => {
      const inputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      const textareaSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!

      inputSetter.call(nameInput, 'Jane Doe')
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))

      inputSetter.call(emailInput, 'jane@example.com')
      emailInput.dispatchEvent(new Event('input', { bubbles: true }))

      textareaSetter.call(messageInput, 'I would like to apply.')
      messageInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    // Submit the form
    const form = container.querySelector('form')!
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    await new Promise((r) => setTimeout(r, 300))

    const text = container.textContent || ''
    expect(text).toContain('Your message draft is ready')
    expect(text).toContain('Open Email App')
    expect(text).toContain('Update Email Draft')

    const emailLink = container.querySelector('a[href^="mailto:info@mihas.edu.zm?subject="]') as HTMLAnchorElement | null
    expect(emailLink).toBeTruthy()
    expect(emailLink?.href).toContain('mailto:info@mihas.edu.zm?subject=')
  })

  it('keeps an editable handoff state after preparing the draft', async () => {
    await renderAndWait()

    const nameInput = container.querySelector('input[name="name"]') as HTMLInputElement
    const emailInput = container.querySelector('input[name="email"]') as HTMLInputElement
    const messageInput = container.querySelector('#contact-message') as HTMLTextAreaElement

    await act(async () => {
      const inputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      const textareaSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!

      inputSetter.call(nameInput, 'Jane Doe')
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))

      inputSetter.call(emailInput, 'jane@example.com')
      emailInput.dispatchEvent(new Event('input', { bubbles: true }))

      textareaSetter.call(messageInput, 'I would like to apply.')
      messageInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const form = container.querySelector('form')!
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    await new Promise((r) => setTimeout(r, 300))

    const text = container.textContent || ''
    expect(text).toContain('Edit Message')
    expect(text).not.toContain('Unable to open your email app')
  })

  // ── "Send a Message" card title ─────────────────────────────────────

  it('renders the "Send a Message" card title', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Send a Message')
  })

  it('renders the "Talk to our team" card title', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Talk to our team')
  })
})
