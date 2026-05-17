/**
 * Bug Condition Exploration — ScoutQA Landing Page Fixes
 *
 * **Validates: Requirements 1.1, 1.2, 1.3**
 *
 * These tests encode the EXPECTED (fixed) behavior. They MUST FAIL on
 * unfixed code — failure confirms the bugs exist.
 *
 * Bug 1: OptimizedImage with WebP-native sources should render a plain <img>
 *   without a <picture> wrapper (no <source> needed for already-WebP files).
 *   On UNFIXED code the component always wraps in <picture> → test FAILS.
 *
 * Bug 2: Contact page H1 should have explicit `text-foreground` class for
 *   WCAG AA contrast on the gradient background.
 *   On UNFIXED code the H1 only has sizing classes → test FAILS.
 */
import { describe, it, expect, vi } from 'vitest'
import * as fc from 'fast-check'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { OptimizedImage } from '@/components/ui/OptimizedImage'

// ---------------------------------------------------------------------------
// Mocks for ContactPage dependencies
// ---------------------------------------------------------------------------
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
vi.mock('@hookform/resolvers/zod', () => ({
  zodResolver: () => ({}),
}))
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
  ArrowLeft: () => null,
  Mail: () => null,
  Phone: () => null,
  MapPin: () => null,
  Users: () => null,
  Award: () => null,
  BookOpen: () => null,
  Facebook: () => null,
  Twitter: () => null,
  Linkedin: () => null,
  Home: () => null,
  Globe: () => null,
  FileCheck: () => null,
  GraduationCap: () => null,
  MessageCircle: () => null,
  Clock: () => null,
}))
vi.mock('@/components/seo/Seo', () => ({
  Seo: () => null,
}))

// ---------------------------------------------------------------------------
// Bug 1 — OptimizedImage: WebP-native sources should NOT use <picture> wrapper
// ---------------------------------------------------------------------------

describe('[PBT] Bug 1 — OptimizedImage WebP-native sources render without <picture> wrapper', () => {
  const arbWebpSrc = fc.constantFrom(
    '/images/accreditation/GNCLogo.webp',
    '/images/accreditation/hpc_logobig.webp',
    '/images/accreditation/eczlogo.webp',
    '/images/accreditation/unza.webp',
  )

  it('WebP-native source renders plain <img> without <picture> wrapper', () => {
    fc.assert(
      fc.property(arbWebpSrc, (src) => {
        const markup = renderToStaticMarkup(
          React.createElement(OptimizedImage, {
            src,
            alt: 'Accreditation logo',
            width: 64,
            height: 64,
          }),
        )

        const parser = new DOMParser()
        const doc = parser.parseFromString(markup, 'text/html')

        // EXPECTED (fixed) behavior:
        // No <picture> wrapper when source is already WebP
        const picture = doc.querySelector('picture')
        expect(picture).toBeNull()

        // <img> should exist with correct dimensions
        const img = doc.querySelector('img')
        expect(img).not.toBeNull()
        expect(img!.getAttribute('width')).toBe('64')
        expect(img!.getAttribute('height')).toBe('64')

        // No redundant <source type="image/webp"> element
        const source = doc.querySelector('source[type="image/webp"]')
        expect(source).toBeNull()
      }),
      { numRuns: 20 },
    )
  })
})

// ---------------------------------------------------------------------------
// Bug 2 — Contact page H1 missing text-foreground color class
// ---------------------------------------------------------------------------

describe('[PBT] Bug 2 — Contact page H1 has explicit text-foreground class', () => {
  it('H1 element includes text-foreground in className', async () => {
    // Import the real ContactPage (dependencies are mocked above)
    const { default: ContactPage } = await import('@/pages/ContactPage')

    const markup = renderToStaticMarkup(React.createElement(ContactPage))
    const parser = new DOMParser()
    const doc = parser.parseFromString(markup, 'text/html')
    const h1 = doc.querySelector('h1')

    expect(h1).not.toBeNull()
    const classes = h1!.className.split(/\s+/)

    // EXPECTED (fixed) behavior:
    // H1 should have text-foreground for WCAG AA contrast on gradient background
    // On UNFIXED code, H1 only has "text-3xl font-bold sm:text-4xl" → FAILS
    expect(classes).toContain('text-foreground')
  })
})
