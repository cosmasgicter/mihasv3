import { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'

import { OptimizedImage } from '@/components/ui/OptimizedImage'

describe('OptimizedImage', () => {
  it('sets alt="" and role="presentation" on decorative images', () => {
    const markup = renderToStaticMarkup(
      <OptimizedImage
        src="/images/decorative-pattern.jpg"
        alt="This should be ignored"
        decorative
        width={200}
        height={100}
      />
    )

    expect(markup).toContain('alt=""')
    expect(markup).toContain('role="presentation"')
    expect(markup).not.toContain('This should be ignored')
  })

  it('preserves descriptive alt on informational images', () => {
    const markup = renderToStaticMarkup(
      <OptimizedImage
        src="/images/campus.jpg"
        alt="Students at campus"
        width={640}
        height={480}
      />
    )

    expect(markup).toContain('alt="Students at campus"')
    expect(markup).not.toContain('role="presentation"')
  })

  describe('error fallback rendering', () => {
    let container: HTMLDivElement

    beforeEach(() => {
      container = document.createElement('div')
      document.body.appendChild(container)
    })

    afterEach(() => {
      document.body.removeChild(container)
    })

    it('shows placeholder icon on image load failure', () => {
      act(() => {
        createRoot(container).render(
          <OptimizedImage
            src="/images/broken.jpg"
            alt="Broken image"
            width={320}
            height={240}
          />
        )
      })

      const img = container.querySelector('img')!
      act(() => {
        img.dispatchEvent(new Event('error'))
      })

      const svg = container.querySelector('svg')
      expect(svg).not.toBeNull()
      expect(svg?.getAttribute('aria-hidden')).toBe('true')
    })

    it('displays alt text in fallback for informational images', () => {
      act(() => {
        createRoot(container).render(
          <OptimizedImage
            src="/images/broken.jpg"
            alt="Campus building photo"
            width={320}
            height={240}
          />
        )
      })

      const img = container.querySelector('img')!
      act(() => {
        img.dispatchEvent(new Event('error'))
      })

      const fallback = container.querySelector('[role="img"]')
      expect(fallback).not.toBeNull()
      expect(fallback?.getAttribute('aria-label')).toBe('Campus building photo')
      expect(container.textContent).toContain('Campus building photo')
    })

    it('hides alt text in fallback for decorative images', () => {
      act(() => {
        createRoot(container).render(
          <OptimizedImage
            src="/images/broken-decorative.jpg"
            alt="Decorative pattern"
            decorative
            width={200}
            height={100}
          />
        )
      })

      const img = container.querySelector('img')!
      act(() => {
        img.dispatchEvent(new Event('error'))
      })

      const fallback = container.querySelector('[role="presentation"]')
      expect(fallback).not.toBeNull()
      expect(fallback?.getAttribute('aria-label')).toBeNull()
      expect(container.textContent).not.toContain('Decorative pattern')
    })

    it('sets role="img" with aria-label on informational fallback', () => {
      act(() => {
        createRoot(container).render(
          <OptimizedImage
            src="/images/broken.jpg"
            alt="Students studying"
            width={400}
            height={300}
          />
        )
      })

      const img = container.querySelector('img')!
      act(() => {
        img.dispatchEvent(new Event('error'))
      })

      const fallback = container.querySelector('[role="img"]')
      expect(fallback).not.toBeNull()
      expect(fallback?.getAttribute('aria-label')).toBe('Students studying')
    })

    it('sets role="presentation" without aria-label on decorative fallback', () => {
      act(() => {
        createRoot(container).render(
          <OptimizedImage
            src="/images/broken.jpg"
            alt=""
            decorative
            width={100}
            height={100}
          />
        )
      })

      const img = container.querySelector('img')!
      act(() => {
        img.dispatchEvent(new Event('error'))
      })

      const fallback = container.querySelector('[role="presentation"]')
      expect(fallback).not.toBeNull()
      expect(fallback?.hasAttribute('aria-label')).toBe(false)
    })
  })
})
