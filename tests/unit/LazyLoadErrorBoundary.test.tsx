import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { LazyLoadErrorBoundary } from '@/components/LazyLoadErrorBoundary'

describe('LazyLoadErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    const markup = renderToStaticMarkup(
      <LazyLoadErrorBoundary>
        <div>Content loaded</div>
      </LazyLoadErrorBoundary>
    )
    expect(markup).toContain('Content loaded')
  })

  it('exports as a named export (not default)', () => {
    expect(typeof LazyLoadErrorBoundary).toBe('function')
    expect(LazyLoadErrorBoundary.name).toBe('LazyLoadErrorBoundary')
  })

  it('is a class component with getDerivedStateFromError', () => {
    expect(LazyLoadErrorBoundary.getDerivedStateFromError).toBeDefined()
    expect(typeof LazyLoadErrorBoundary.getDerivedStateFromError).toBe('function')
  })

  it('detects ChunkLoadError by name', () => {
    const error = new Error('Loading chunk failed')
    error.name = 'ChunkLoadError'
    const state = LazyLoadErrorBoundary.getDerivedStateFromError(error)
    expect(state).toEqual({ hasError: true, isChunkError: true })
  })

  it('detects "Loading chunk" in error message', () => {
    const error = new Error('Loading chunk abc123 failed')
    const state = LazyLoadErrorBoundary.getDerivedStateFromError(error)
    expect(state).toEqual({ hasError: true, isChunkError: true })
  })

  it('detects "Failed to fetch dynamically imported module" in error message', () => {
    const error = new Error('Failed to fetch dynamically imported module: /assets/chunk-abc.js')
    const state = LazyLoadErrorBoundary.getDerivedStateFromError(error)
    expect(state).toEqual({ hasError: true, isChunkError: true })
  })

  it('detects "Importing a module script failed" in error message', () => {
    const error = new Error('Importing a module script failed')
    const state = LazyLoadErrorBoundary.getDerivedStateFromError(error)
    expect(state).toEqual({ hasError: true, isChunkError: true })
  })

  it('marks non-chunk errors as generic errors', () => {
    const error = new Error('Some random rendering error')
    const state = LazyLoadErrorBoundary.getDerivedStateFromError(error)
    expect(state).toEqual({ hasError: true, isChunkError: false })
  })

  it('accepts a custom fallbackMessage prop', () => {
    const markup = renderToStaticMarkup(
      <LazyLoadErrorBoundary fallbackMessage="Custom error message">
        <div>Content</div>
      </LazyLoadErrorBoundary>
    )
    // When no error, children render normally
    expect(markup).toContain('Content')
  })

  it('renders with role="alert" in error state markup', () => {
    // We can verify the error UI structure by creating an instance in error state
    // and checking the render output. Since renderToStaticMarkup won't trigger
    // getDerivedStateFromError, we test the static method directly above
    // and verify the component structure renders the alert role.
    const instance = new LazyLoadErrorBoundary({ children: null })
    instance.state = { hasError: true, isChunkError: true }
    const errorElement = instance.render() as React.ReactElement
    expect(errorElement.props.role).toBe('alert')
  })

  it('renders retry button in error state', () => {
    const instance = new LazyLoadErrorBoundary({ children: null })
    instance.state = { hasError: true, isChunkError: true }
    const markup = renderToStaticMarkup(instance.render() as React.ReactElement)
    expect(markup).toContain('Try again')
    expect(markup).toContain('Reload page')
  })

  it('renders only "Try again" for non-chunk errors (no "Reload page")', () => {
    const instance = new LazyLoadErrorBoundary({ children: null })
    instance.state = { hasError: true, isChunkError: false }
    const markup = renderToStaticMarkup(instance.render() as React.ReactElement)
    expect(markup).toContain('Try again')
    expect(markup).not.toContain('Reload page')
  })

  it('shows chunk-specific message for chunk errors', () => {
    const instance = new LazyLoadErrorBoundary({ children: null })
    instance.state = { hasError: true, isChunkError: true }
    const markup = renderToStaticMarkup(instance.render() as React.ReactElement)
    expect(markup).toContain('newer version of the app is available')
  })

  it('shows generic message for non-chunk errors', () => {
    const instance = new LazyLoadErrorBoundary({ children: null })
    instance.state = { hasError: true, isChunkError: false }
    const markup = renderToStaticMarkup(instance.render() as React.ReactElement)
    expect(markup).toContain('Something went wrong loading this section')
  })

  it('uses custom fallbackMessage when provided in error state', () => {
    const instance = new LazyLoadErrorBoundary({
      children: null,
      fallbackMessage: 'Custom failure message',
    })
    instance.state = { hasError: true, isChunkError: true }
    const markup = renderToStaticMarkup(instance.render() as React.ReactElement)
    expect(markup).toContain('Custom failure message')
  })
})
