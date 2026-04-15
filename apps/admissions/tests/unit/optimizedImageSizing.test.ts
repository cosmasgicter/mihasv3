/**
 * Unit tests — OptimizedImage sizing fixes
 *
 * Validates that <picture> has block w-full h-full classes,
 * <img> does NOT have h-auto, caller classes are applied without conflict,
 * and error fallback still renders correctly.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { OptimizedImage } from '@/components/ui/OptimizedImage'

// ---------------------------------------------------------------------------
// <picture> element block sizing
// ---------------------------------------------------------------------------

describe('OptimizedImage — <picture> element has block sizing', () => {
  it('<picture> has block, w-full, h-full classes', () => {
    const markup = renderToStaticMarkup(
      React.createElement(OptimizedImage, {
        src: '/images/logo-nmcz.png',
        alt: 'NMCZ Logo',
        width: 48,
        height: 48,
        className: 'h-full w-full object-contain',
      }),
    )

    const parser = new DOMParser()
    const doc = parser.parseFromString(markup, 'text/html')
    const picture = doc.querySelector('picture')

    expect(picture).not.toBeNull()
    const classes = picture!.className.split(/\s+/)
    expect(classes).toContain('block')
    expect(classes).toContain('w-full')
    expect(classes).toContain('h-full')
  })

  it('<picture> block sizing does not break hero/program card usage (no h-full w-full passed)', () => {
    const markup = renderToStaticMarkup(
      React.createElement(OptimizedImage, {
        src: '/images/hero.jpg',
        alt: 'Hero image',
        width: 1200,
        height: 600,
        className: 'rounded-lg shadow-md',
      }),
    )

    const parser = new DOMParser()
    const doc = parser.parseFromString(markup, 'text/html')
    const picture = doc.querySelector('picture')
    const img = doc.querySelector('img')

    // <picture> still has block sizing (safe for all contexts)
    expect(picture).not.toBeNull()
    const pictureClasses = picture!.className.split(/\s+/)
    expect(pictureClasses).toContain('block')
    expect(pictureClasses).toContain('w-full')
    expect(pictureClasses).toContain('h-full')

    // <img> has caller classes and max-w-full
    expect(img).not.toBeNull()
    expect(img!.className).toContain('max-w-full')
    expect(img!.className).toContain('rounded-lg')
    expect(img!.className).toContain('shadow-md')
  })
})

// ---------------------------------------------------------------------------
// <img> element — no h-auto conflict
// ---------------------------------------------------------------------------

describe('OptimizedImage — <img> element has no h-auto', () => {
  it('<img> does NOT have h-auto in default classes', () => {
    const markup = renderToStaticMarkup(
      React.createElement(OptimizedImage, {
        src: '/images/campus.png',
        alt: 'Campus',
        width: 640,
        height: 480,
      }),
    )

    const parser = new DOMParser()
    const doc = parser.parseFromString(markup, 'text/html')
    const img = doc.querySelector('img')

    expect(img).not.toBeNull()
    const classes = img!.className.split(/\s+/)
    expect(classes).not.toContain('h-auto')
  })

  it('<img> with caller className="h-full w-full object-contain" has no conflicting h-auto', () => {
    const markup = renderToStaticMarkup(
      React.createElement(OptimizedImage, {
        src: '/images/logo-ecz.png',
        alt: 'ECZ Logo',
        width: 48,
        height: 48,
        className: 'h-full w-full object-contain',
      }),
    )

    const parser = new DOMParser()
    const doc = parser.parseFromString(markup, 'text/html')
    const img = doc.querySelector('img')

    expect(img).not.toBeNull()
    const classes = img!.className.split(/\s+/)
    expect(classes).not.toContain('h-auto')
    expect(classes).toContain('h-full')
    expect(classes).toContain('w-full')
    expect(classes).toContain('object-contain')
  })

  it('<img> with no caller className still has max-w-full', () => {
    const markup = renderToStaticMarkup(
      React.createElement(OptimizedImage, {
        src: '/images/hero.jpg',
        alt: 'Hero',
        width: 800,
        height: 600,
      }),
    )

    const parser = new DOMParser()
    const doc = parser.parseFromString(markup, 'text/html')
    const img = doc.querySelector('img')

    expect(img).not.toBeNull()
    expect(img!.className).toContain('max-w-full')
  })
})

// ---------------------------------------------------------------------------
// Error fallback
// ---------------------------------------------------------------------------

describe('OptimizedImage — error fallback renders correctly', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.removeChild(container)
  })

  it('renders broken-image icon and alt text on load error', async () => {
    const root = createRoot(container)

    await act(async () => {
      root.render(
        React.createElement(OptimizedImage, {
          src: '/images/broken.png',
          alt: 'Broken image test',
          width: 200,
          height: 200,
        }),
      )
    })

    const img = container.querySelector('img')
    expect(img).not.toBeNull()

    await act(async () => {
      img!.dispatchEvent(new Event('error'))
    })

    // Fallback div with role="img"
    const fallbackDiv = container.querySelector('div[role="img"]')
    expect(fallbackDiv).not.toBeNull()

    // SVG broken-image icon
    const svg = fallbackDiv!.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg!.getAttribute('aria-hidden')).toBe('true')

    // Alt text displayed
    const altSpan = fallbackDiv!.querySelector('span.text-xs')
    expect(altSpan).not.toBeNull()
    expect(altSpan!.textContent).toBe('Broken image test')

    act(() => { root.unmount() })
  })
})
