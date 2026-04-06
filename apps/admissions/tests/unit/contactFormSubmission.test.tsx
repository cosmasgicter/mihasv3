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

    expect(openSpy).toHaveBeenCalledOnce()
    const [url, target] = openSpy.mock.calls[0]
    expect(target).toBe('_self')
    expect(url).toContain('mailto:info@mihas.edu.zm')
    expect(url).toContain(encodeURIComponent('Admissions inquiry from Jane Doe'))
    expect(url).toContain(encodeURIComponent('Name: Jane Doe'))
    expect(url).toContain(encodeURIComponent('Email: jane@example.com'))
    expect(url).toContain(encodeURIComponent('Hello admissions'))
  })

  it('shows confirmation and resets form after mailto handoff', async () => {
    renderPage()
    fillForm('Jane Doe', 'jane@example.com', 'Hello admissions')
    await submitForm()

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    // Success message should be visible
    const successMsg = container.querySelector('[role="status"]')
    expect(successMsg).not.toBeNull()
    expect(successMsg!.textContent).toContain('Your email app should open')

    // Form fields should be reset
    const nameInput = container.querySelector('#contact-name') as HTMLInputElement
    const emailInput = container.querySelector('#contact-email') as HTMLInputElement
    const messageInput = container.querySelector('#contact-message') as HTMLTextAreaElement
    expect(nameInput.value).toBe('')
    expect(emailInput.value).toBe('')
    expect(messageInput.value).toBe('')
  })

  it('shows error message and preserves data when the mail app handoff fails', async () => {
    openSpy.mockImplementationOnce(() => {
      throw new Error('Window open failed')
    })

    renderPage()
    fillForm('Jane Doe', 'jane@example.com', 'Hello admissions')
    await submitForm()

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    // Error message should be visible
    const errorMsg = container.querySelector('[role="alert"]')
    expect(errorMsg).not.toBeNull()
    expect(errorMsg!.textContent).toContain('Unable to open your email app')

    // Form data should be preserved
    const nameInput = container.querySelector('#contact-name') as HTMLInputElement
    const emailInput = container.querySelector('#contact-email') as HTMLInputElement
    const messageInput = container.querySelector('#contact-message') as HTMLTextAreaElement
    expect(nameInput.value).toBe('Jane Doe')
    expect(emailInput.value).toBe('jane@example.com')
    expect(messageInput.value).toBe('Hello admissions')
  })
})
