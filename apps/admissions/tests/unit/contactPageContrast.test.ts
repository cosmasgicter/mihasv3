/**
 * Unit tests — Contact page contrast and styling
 *
 * Validates: Requirements 2.3, 2.4, 3.3, 3.4
 */
import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('react-router-dom', () => ({
  Link: ({ children, ...props }: any) => React.createElement('a', props, children),
}))
vi.mock('react-hook-form', () => ({
  useForm: () => ({
    register: () => ({}),
    handleSubmit: (fn: any) => (e: any) => { e?.preventDefault?.(); fn({}) },
    formState: { errors: {} },
  }),
}))
vi.mock('@hookform/resolvers/zod', () => ({ zodResolver: () => ({}) }))
vi.mock('@/components/smoothui', () => ({
  ScrollReveal: ({ children }: any) => React.createElement('div', null, children),
}))
vi.mock('@/components/layout/PublicLayout', () => ({
  PublicLayout: ({ children }: any) => React.createElement('div', null, children),
}))
vi.mock('@/components/ui', () => ({
  Card: ({ children, ...props }: any) => React.createElement('div', props, children),
  CardContent: ({ children, ...props }: any) => React.createElement('div', props, children),
  CardTitle: ({ children, ...props }: any) => React.createElement('div', props, children),
}))
vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, ...props }: any) => React.createElement('button', props, children),
}))
vi.mock('@/components/icons', () => ({
  ArrowLeft: () => null, Mail: () => null, Phone: () => null,
  MapPin: () => null, Users: () => null, Award: () => null,
  BookOpen: () => null, Facebook: () => null, Twitter: () => null, Linkedin: () => null,
}))
vi.mock('@/components/seo/Seo', () => ({ Seo: () => null }))

describe('Contact page — H1 contrast', () => {
  it('H1 has text-foreground class', async () => {
    const { default: ContactPage } = await import('@/pages/ContactPage')
    const markup = renderToStaticMarkup(React.createElement(ContactPage))
    const doc = new DOMParser().parseFromString(markup, 'text/html')
    const h1 = doc.querySelector('h1')
    expect(h1).not.toBeNull()
    expect(h1!.className).toContain('text-foreground')
  })

  it('H1 still has text-3xl font-bold sm:text-4xl sizing classes', async () => {
    const { default: ContactPage } = await import('@/pages/ContactPage')
    const markup = renderToStaticMarkup(React.createElement(ContactPage))
    const doc = new DOMParser().parseFromString(markup, 'text/html')
    const h1 = doc.querySelector('h1')
    expect(h1).not.toBeNull()
    expect(h1!.className).toContain('text-3xl')
    expect(h1!.className).toContain('font-bold')
    expect(h1!.className).toContain('sm:text-4xl')
  })
})

describe('Contact page — form styling preserved', () => {
  it('paragraph retains text-muted-foreground class', async () => {
    const { default: ContactPage } = await import('@/pages/ContactPage')
    const markup = renderToStaticMarkup(React.createElement(ContactPage))
    const doc = new DOMParser().parseFromString(markup, 'text/html')
    const h1 = doc.querySelector('h1')
    expect(h1).not.toBeNull()
    const p = h1!.parentElement?.querySelector('p')
    expect(p).not.toBeNull()
    expect(p!.className).toContain('text-muted-foreground')
  })

  it('form labels retain text-foreground class', async () => {
    const { default: ContactPage } = await import('@/pages/ContactPage')
    const markup = renderToStaticMarkup(React.createElement(ContactPage))
    const doc = new DOMParser().parseFromString(markup, 'text/html')
    const labels = doc.querySelectorAll('label')
    expect(labels.length).toBeGreaterThan(0)
    labels.forEach((label) => {
      expect(label.className).toContain('text-foreground')
    })
  })

  it('form error messages retain text-destructive class pattern', async () => {
    const { default: ContactPage } = await import('@/pages/ContactPage')
    const markup = renderToStaticMarkup(React.createElement(ContactPage))
    const doc = new DOMParser().parseFromString(markup, 'text/html')
    const alerts = doc.querySelectorAll('[role="alert"]')
    expect(alerts.length).toBe(0)
  })
})
