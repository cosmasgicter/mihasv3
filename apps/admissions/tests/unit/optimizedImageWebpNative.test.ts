/**
 * Unit tests — OptimizedImage WebP-native source handling
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 3.1
 *
 * WebP-native sources (.webp) should render a plain <img> without a
 * <picture> wrapper, while non-WebP sources (.jpg, .png) and explicit
 * webpSrc continue to use the <picture> + <source> + <img> pattern.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { OptimizedImage } from '@/components/ui/OptimizedImage'

// ---------------------------------------------------------------------------
// WebP-native source — plain <img> rendering
// ---------------------------------------------------------------------------

describe('OptimizedImage — WebP-native source renders plain <img>', () => {
  it('.webp src renders without <picture> wrapper', () => {
    const markup = renderToStaticMarkup(
      React.createElement(OptimizedImage, {
        src: '/images/accreditation/GNCLogo.webp',
        alt: 'GNC Logo',
        width: 64,
        height: 64,
      }),
    )

    const parser = new DOMParser()
    const doc = parser.parseFromString(markup, 'text/html')

    expect(doc.querySelector('picture')).toBeNull()
    expect(doc.querySelector('img')).not.toBeNull()
  })

  it('.webp src has correct width and height attributes', () => {
    const markup = renderToStaticMarkup(
      React.createElement(OptimizedImage, {
        src: '/images/accreditation/hpc_logobig.webp',
        alt: 'HPC Logo',
        width: 64,
        height: 64,
      }),
    )

    const parser = new DOMParser()
    const doc = parser.parseFromString(markup, 'text/html')
    const img = doc.querySelector('img')

    expect(img).not.toBeNull()
    expect(img!.getAttribute('width')).toBe('64')
    expect(img!.getAttribute('height')).toBe('64')
  })

  it('.webp src has no <source type="image/webp"> element', () => {
    const markup = renderToStaticMarkup(
      React.createElement(OptimizedImage, {
        src: '/images/accreditation/eczlogo.webp',
        alt: 'ECZ Logo',
        width: 64,
        height: 64,
      }),
    )

    const parser = new DOMParser()
    const doc = parser.parseFromString(markup, 'text/html')

    expect(doc.querySelector('source[type="image/webp"]')).toBeNull()
  })

  it('.webp src preserves loading="lazy" and decoding="async"', () => {
    const markup = renderToStaticMarkup(
      React.createElement(OptimizedImage, {
        src: '/images/accreditation/unza.webp',
        alt: 'UNZA Logo',
        width: 64,
        height: 64,
      }),
    )

    const parser = new DOMParser()
    const doc = parser.parseFromString(markup, 'text/html')
    const img = doc.querySelector('img')

    expect(img).not.toBeNull()
    expect(img!.getAttribute('loading')).toBe('lazy')
    expect(img!.getAttribute('decoding')).toBe('async')
  })

  it('.webp src with lazy={false} renders loading="eager"', () => {
    const markup = renderToStaticMarkup(
      React.createElement(OptimizedImage, {
        src: '/images/accreditation/GNCLogo.webp',
        alt: 'GNC Logo',
        width: 64,
        height: 64,
        lazy: false,
      }),
    )

    const parser = new DOMParser()
    const doc = parser.parseFromString(markup, 'text/html')
    const img = doc.querySelector('img')

    expect(img).not.toBeNull()
    expect(img!.getAttribute('loading')).toBe('eager')
  })
})

// ---------------------------------------------------------------------------
// Non-WebP sources — <picture> + <source> + <img> preserved
// ---------------------------------------------------------------------------

describe('OptimizedImage — non-WebP sources still use <picture> wrapper', () => {
  it('.jpg src renders <picture> + <source> + <img>', () => {
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

    expect(doc.querySelector('picture')).not.toBeNull()
    expect(doc.querySelector('source[type="image/webp"]')).not.toBeNull()
    expect(doc.querySelector('img')).not.toBeNull()
  })

  it('.png src renders <picture> + <source> + <img>', () => {
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

    expect(doc.querySelector('picture')).not.toBeNull()
    expect(doc.querySelector('source[type="image/webp"]')).not.toBeNull()
    expect(doc.querySelector('img')).not.toBeNull()
  })

  it('explicit webpSrc prop renders <picture> + <source> + <img>', () => {
    const markup = renderToStaticMarkup(
      React.createElement(OptimizedImage, {
        src: '/images/logo.svg',
        alt: 'Logo',
        width: 100,
        height: 100,
        webpSrc: '/images/logo.webp',
      }),
    )

    const parser = new DOMParser()
    const doc = parser.parseFromString(markup, 'text/html')

    expect(doc.querySelector('picture')).not.toBeNull()
    const source = doc.querySelector('source[type="image/webp"]')
    expect(source).not.toBeNull()
    expect(source!.getAttribute('srcset')).toContain('/images/logo.webp')
    expect(doc.querySelector('img')).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Error fallback for WebP sources
// ---------------------------------------------------------------------------

describe('OptimizedImage — error fallback for .webp sources', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.removeChild(container)
  })

  it('renders broken-image icon and alt text on load error for .webp src', async () => {
    const root = createRoot(container)

    await act(async () => {
      root.render(
        React.createElement(OptimizedImage, {
          src: '/images/broken.webp',
          alt: 'Broken WebP image',
          width: 64,
          height: 64,
        }),
      )
    })

    const img = container.querySelector('img')
    expect(img).not.toBeNull()

    await act(async () => {
      img!.dispatchEvent(new Event('error'))
    })

    const fallbackDiv = container.querySelector('div[role="img"]')
    expect(fallbackDiv).not.toBeNull()

    const svg = fallbackDiv!.querySelector('svg')
    expect(svg).not.toBeNull()

    const altSpan = fallbackDiv!.querySelector('span.text-xs')
    expect(altSpan).not.toBeNull()
    expect(altSpan!.textContent).toBe('Broken WebP image')

    act(() => { root.unmount() })
  })
})
