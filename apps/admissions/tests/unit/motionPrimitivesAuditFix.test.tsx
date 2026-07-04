/**
 * Motion Primitives Audit Fix — Regression Tests
 *
 * Validates the dual reduced-motion strategy (ADR-009) at the component level:
 * - PageShell uses a CSS-only entrance animation (no framer-motion), which the
 *   global `prefers-reduced-motion` rule in index.css already neutralises —
 *   the same pattern ButtonSpinner already established below.
 * - ButtonSpinner uses CSS-only reduced-motion (no AnimatePresence wrapper)
 * - smooth-animations.css contains required utility classes
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { render } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

// ─── Mocks (must precede component imports) ────────────────────────────────

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

// ─── Imports (after mocks) ─────────────────────────────────────────────────

import { PageShell } from '@/components/ui/PageShell'
import { ButtonSpinner } from '@/components/ui/ButtonSpinner'

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('PageShell reduced-motion behaviour', () => {
  it('renders title and children as a plain div with the CSS entrance animation class', () => {
    const markup = renderToStaticMarkup(
      <PageShell title="Test Page">
        <p>child content</p>
      </PageShell>
    )

    expect(markup).toContain('Test Page')
    expect(markup).toContain('child content')
    expect(markup).toContain('bottom-nav-content-padding')
    expect(markup).toContain('animate-page-shell-in')
    // No framer-motion: the wrapper is a plain <div>, never a mid-animation
    // inline transform style (framer-motion previously injected one).
    expect(markup).toMatch(/^<div/)
    expect(markup).not.toMatch(/style="[^"]*translateY\(8px\)/)
  })

  it('does not remount the subtree across re-renders (form state preserved)', () => {
    // Contract: PageShell's wrapper is a stable plain div, so re-rendering
    // never remounts child component state (forms, inputs).
    const { container, rerender } = render(
      <PageShell title="Stable">
        <input data-testid="child-input" defaultValue="keep me" />
      </PageShell>
    )

    const wrapperBefore = container.firstElementChild
    expect(wrapperBefore?.tagName).toBe('DIV')

    rerender(
      <PageShell title="Stable Renamed">
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

  it('renders exactly one SVG element and no wrapper', () => {
    const { container } = render(<ButtonSpinner />)

    const svgs = container.querySelectorAll('svg')
    // Single SVG — the framer-motion + static-fallback hybrid was
    // dropped in favour of CSS animations, which the global
    // `prefers-reduced-motion` rule already neutralises.
    expect(svgs.length).toBe(1)

    // The root should be the SVG itself (no Fragment / wrapper element).
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
