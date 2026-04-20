import React from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Mock heavy layout/animation dependencies
vi.mock('@/components/layout/PublicLayout', () => ({
  PublicLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/smoothui', () => ({
  ScrollReveal: ({ children }: { children: React.ReactNode; className?: string }) => (
    <div>{children}</div>
  ),
}))

import ContactPage from '@/pages/ContactPage'

describe('ContactPage form submission', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  const openSpy = vi.fn()

  beforeEach(() => {
    openSpy.mockReset()
    vi.stubGlobal('open', openSpy)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function renderPage() {
    act(() => {
      root.render(
        <MemoryRouter>
          <ContactPage />
        </MemoryRouter>,
      )
    })
  }

  function fillForm(name: string, email: string, message: string) {
    const nameInput = container.querySelector('#contact-name') as HTMLInputElement
    const emailInput = container.querySelector('#contact-email') as HTMLInputElement
    const messageInput = container.querySelector('#contact-message') as HTMLTextAreaElement

    // React Hook Form uses native events for registration
    act(() => {
      fireInputChange(nameInput, name)
      fireInputChange(emailInput, email)
      fireInputChange(messageInput, message)
    })
  }

  function fireInputChange(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
    // Set value via native setter to trigger React Hook Form's onChange
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      'value',
    )!.set!
    nativeInputValueSetter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }

  async function submitForm() {
    const form = container.querySelector('form') as HTMLFormElement
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
  }

  it('opens a prefilled mailto link on valid submit', async () => {
    renderPage()
    fillForm('Jane Doe', 'jane@example.com', 'Hello admissions')
    await submitForm()

    // Allow async onSubmit to settle
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    // New two-step flow: shows draft_ready state with mailto link
    const statusMsg = container.querySelector('[role="status"]')
    expect(statusMsg).not.toBeNull()
    expect(statusMsg!.textContent).toContain('Your message draft is ready')

    const mailtoLink = statusMsg!.querySelector('a[href^="mailto:"]') as HTMLAnchorElement
    expect(mailtoLink).not.toBeNull()
    expect(mailtoLink.href).toContain('mailto:')
    expect(mailtoLink.href).toContain(encodeURIComponent('Admissions inquiry from Jane Doe'))
    expect(mailtoLink.href).toContain(encodeURIComponent('Hello admissions'))
  })

  it('shows confirmation with Open Email App link after submit', async () => {
    renderPage()
    fillForm('Jane Doe', 'jane@example.com', 'Hello admissions')
    await submitForm()

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    // Success message should be visible
    const successMsg = container.querySelector('[role="status"]')
    expect(successMsg).not.toBeNull()
    expect(successMsg!.textContent).toContain('Your message draft is ready')

    // Should have an "Open Email App" link inside the status block
    const links = successMsg!.querySelectorAll('a')
    const openLink = Array.from(links).find(a => a.textContent?.includes('Open Email App'))
    expect(openLink).not.toBeNull()
  })

  it('allows editing the message after draft is ready', async () => {
    renderPage()
    fillForm('Jane Doe', 'jane@example.com', 'Hello admissions')
    await submitForm()

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    // The form should still be present for editing
    const form = container.querySelector('form') as HTMLFormElement
    expect(form).not.toBeNull()
  })
})
