/**
 * Motion Primitives Audit Fix — Regression Tests
 *
 * Validates the dual reduced-motion strategy (ADR-009) at the component level:
 * - PageShell honours useReducedMotion for framer-motion suppression
 * - ButtonSpinner uses CSS-only reduced-motion (no AnimatePresence wrapper)
 * - smooth-animations.css contains required utility classes
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { render } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

// ─── Mocks (must precede component imports) ────────────────────────────────

let mockReduced = true

vi.mock('@/lib/animation-config', () => ({
  useReducedMotion: () => mockReduced,
  prefersReducedMotion: () => mockReduced,
}))

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

// ─── Imports (after mocks) ─────────────────────────────────────────────────

import { PageShell } from '@/components/ui/PageShell'
import { ButtonSpinner } from '@/components/ui/ButtonSpinner'

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('PageShell reduced-motion behaviour', () => {
  afterEach(() => {
    mockReduced = true
  })

  it('renders title and children without mid-animation transform when reduced motion is on', () => {
    mockReduced = true
    const markup = renderToStaticMarkup(
      <PageShell title="Test Page">
        <p>child content</p>
      </PageShell>
    )

    expect(markup).toContain('Test Page')
    expect(markup).toContain('child content')
    // When reduced motion is active, framer-motion with initial:false should
    // NOT apply a mid-animation transform style (e.g. translateY(8px))
    expect(markup).not.toMatch(/style="[^"]*translateY\(8px\)/)
  })

  it('renders as a div with bottom-nav-content-padding when reduced motion is off', () => {
    mockReduced = false
    const markup = renderToStaticMarkup(
      <PageShell title="Active Page">
        <p>visible child</p>
      </PageShell>
    )

    expect(markup).toContain('visible child')
    expect(markup).toContain('bottom-nav-content-padding')
    // motion.div renders as a plain <div> in the DOM
    expect(markup).toMatch(/^<div/)
  })

  it('does NOT remount subtree when reduced-motion preference toggles', () => {
    // Contract: PageShell uses a single motion.div wrapper whose animation
    // props change reactively. The subtree identity must be preserved so that
    // child component state (forms, inputs) is not lost on toggle.
    //
    // We verify structural equivalence: both renders produce the same child
    // content and the same wrapper element type, differing only in motion props.
    mockReduced = false
    const { container, rerender } = render(
      <PageShell title="Stable">
        <input data-testid="child-input" defaultValue="keep me" />
      </PageShell>
    )

    const wrapperBefore = container.firstElementChild
    expect(wrapperBefore?.tagName).toBe('DIV')

    // Toggle reduced motion
    mockReduced = true
    rerender(
      <PageShell title="Stable">
        <input data-testid="child-input" defaultValue="keep me" />
      </PageShell>
    )

    const wrapperAfter = container.firstElementChild
    // Same DOM node — no remount occurred
    expect(wrapperAfter).toBe(wrapperBefore)
  })
})

describe('ButtonSpinner regression (no AnimatePresence wrapper)', () => {
  it('renders without a data-projection-id marker (no AnimatePresence)', () => {
    const markup = renderToStaticMarkup(<ButtonSpinner />)

    // AnimatePresence injects data-projection-id on wrapper elements.
    // ButtonSpinner should render only two SVGs with a Fragment wrapper.
    expect(markup).not.toContain('data-projection-id')
  })

  it('renders exactly two SVG elements and no other wrapper', () => {
    const { container } = render(<ButtonSpinner />)

    const svgs = container.querySelectorAll('svg')
    // SpinnerIcon (motion.svg) + StaticIcon (plain svg)
    expect(svgs.length).toBe(2)

    // The root should be a bare container (Fragment renders children directly)
    // so the first children of the test container are the SVGs themselves
    const children = Array.from(container.children)
    expect(children.every((el) => el.tagName === 'svg')).toBe(true)
  })
})

describe('smooth-animations.css required classes', () => {
  const cssPath = path.resolve(
    __dirname,
    '../../src/styles/smooth-animations.css'
  )
  const css = fs.readFileSync(cssPath, 'utf-8')

  it('contains .animate-shake class', () => {
    expect(css).toContain('.animate-shake')
  })

  it('contains .input-focus-glow class', () => {
    expect(css).toContain('.input-focus-glow')
  })

  it('.input-focus-glow:focus references --color-primary-rgb', () => {
    // Extract the .input-focus-glow:focus rule block
    const focusRuleMatch = css.match(/\.input-focus-glow:focus\s*\{[^}]+\}/)
    expect(focusRuleMatch).not.toBeNull()
    expect(focusRuleMatch![0]).toContain('--color-primary-rgb')
  })
})
