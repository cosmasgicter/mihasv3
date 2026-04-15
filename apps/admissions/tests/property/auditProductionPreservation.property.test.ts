/**
 * Preservation Property Tests — Audit Production Fixes
 *
 * **Validates: Requirements 3.1, 3.2, 3.5, 3.9, 3.13**
 *
 * These tests verify EXISTING correct behavior that must be preserved
 * through the bugfix. They MUST ALL PASS on unfixed code.
 *
 * 1. Settings dirty detection: modifying a field sets isDirty to true
 * 2. Settings validation errors: server field errors via setError() display inline
 * 3. ErrorDisplay real errors: non-empty messages render role="alert" with text
 * 4. SSE reconnection: scheduleReconnect is called on network errors when authFailed is false
 * 5. OptimizedImage fallback: renders fallback placeholder when onError fires
 */
import React, { act } from 'react'
import { describe, it, expect, vi } from 'vitest'
import * as fc from 'fast-check'
import { createRoot, type Root } from 'react-dom/client'
import * as fs from 'fs'
import * as path from 'path'

import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { OptimizedImage } from '@/components/ui/OptimizedImage'

// ---------------------------------------------------------------------------
// 1. Settings dirty detection — Requirement 3.1
// ---------------------------------------------------------------------------

describe('[PBT] Preservation — Settings dirty detection', () => {
  /**
   * **Validates: Requirements 3.1**
   *
   * The Settings page uses React Hook Form with isDirty. When a student
   * modifies a field but has NOT yet saved, isDirty must be true and the
   * "You have unsaved changes" indicator must appear.
   *
   * We verify this by reading the Settings.tsx source and confirming the
   * isDirty-driven UI guard is present.
   */
  it('Settings renders "You have unsaved changes" text gated on isDirty', () => {
    const filePath = path.resolve(__dirname, '../../src/pages/student/Settings.tsx')
    const fileContent = fs.readFileSync(filePath, 'utf-8')

    // The component must conditionally render the unsaved changes indicator
    // based on isDirty from React Hook Form
    expect(fileContent).toContain('isDirty')
    expect(fileContent).toContain('You have unsaved changes')

    // The isDirty guard should gate the unsaved changes text
    // Pattern: {isDirty && ( ... "You have unsaved changes" ... )}
    const isDirtyGuardPattern = /isDirty\s*&&\s*\(/
    expect(fileContent).toMatch(isDirtyGuardPattern)
  })

  it('Settings registers beforeunload handler when isDirty is true', () => {
    const filePath = path.resolve(__dirname, '../../src/pages/student/Settings.tsx')
    const fileContent = fs.readFileSync(filePath, 'utf-8')

    // The beforeunload handler must be present and gated on isDirty
    expect(fileContent).toContain('beforeunload')
    expect(fileContent).toContain('isDirty')

    // The useEffect for beforeunload should check isDirty
    const beforeUnloadPattern = /useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?if\s*\(\s*!isDirty\s*\)[\s\S]*?beforeunload/
    expect(fileContent).toMatch(beforeUnloadPattern)
  })

  it('Settings submit button is disabled when form is not dirty', () => {
    const filePath = path.resolve(__dirname, '../../src/pages/student/Settings.tsx')
    const fileContent = fs.readFileSync(filePath, 'utf-8')

    // The submit button should be disabled when !isDirty
    expect(fileContent).toMatch(/disabled=\{!isDirty/)
  })
})

// ---------------------------------------------------------------------------
// 2. Settings validation errors — Requirement 3.2
// ---------------------------------------------------------------------------

describe('[PBT] Preservation — Settings validation errors via setError()', () => {
  /**
   * **Validates: Requirements 3.2**
   *
   * When a save request fails with validation errors (server returns fieldErrors),
   * the system must display inline field errors via setError() and keep the form
   * in a dirty state so the user can correct and retry.
   */
  it('Settings onSubmit catch block calls setError for server field errors', () => {
    const filePath = path.resolve(__dirname, '../../src/pages/student/Settings.tsx')
    const fileContent = fs.readFileSync(filePath, 'utf-8')

    // The catch block must check for fieldErrors and call setError
    expect(fileContent).toContain('fieldErrors')
    expect(fileContent).toContain('setError')

    // Pattern: iterates over fieldErrors and calls setError for each
    const setErrorPattern = /Object\.entries\(err\.fieldErrors\)\.forEach\(\(\[field,\s*message\]\)\s*=>\s*\{[\s\S]*?setError\(/
    expect(fileContent).toMatch(setErrorPattern)
  })

  it('Settings displays error status banner when save fails with field errors', () => {
    const filePath = path.resolve(__dirname, '../../src/pages/student/Settings.tsx')
    const fileContent = fs.readFileSync(filePath, 'utf-8')

    // The error status message for field errors
    expect(fileContent).toContain('Please correct the highlighted fields and try again')

    // The save status banner uses role="alert" for error tone
    expect(fileContent).toMatch(/role=\{saveStatus\.tone === 'error' \? 'alert'/)
  })
})

// ---------------------------------------------------------------------------
// 3. ErrorDisplay real errors — Requirement 3.5
// ---------------------------------------------------------------------------

describe('[PBT] Preservation — ErrorDisplay renders real errors with role="alert"', () => {
  let container: HTMLDivElement
  let root: Root

  function setup(): void {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  }

  function teardown(): void {
    act(() => { root.unmount() })
    document.body.removeChild(container)
  }

  // Arbitrary: non-empty, non-whitespace error messages
  const arbRealMessage = fc.string({ minLength: 1, maxLength: 100 })
    .filter((s) => s.trim().length > 0)

  /**
   * **Validates: Requirements 3.5**
   *
   * When the dashboard encounters a real error, ErrorDisplay must render
   * with role="alert" and display the message text.
   */
  it('ErrorDisplay renders role="alert" element for non-empty messages (section variant)', () => {
    fc.assert(
      fc.property(arbRealMessage, (message) => {
        setup()

        act(() => {
          root.render(React.createElement(ErrorDisplay, { message }))
        })

        const alertEl = container.querySelector('[role="alert"]')
        expect(alertEl).not.toBeNull()
        expect(alertEl!.textContent).toContain(message)

        teardown()
      }),
      { numRuns: 15 },
    )
  })

  it('ErrorDisplay renders role="alert" element for non-empty messages (inline variant)', () => {
    fc.assert(
      fc.property(arbRealMessage, (message) => {
        setup()

        act(() => {
          root.render(
            React.createElement(ErrorDisplay, { message, variant: 'inline' as const }),
          )
        })

        const alertEl = container.querySelector('[role="alert"]')
        expect(alertEl).not.toBeNull()
        expect(alertEl!.textContent).toContain(message)

        teardown()
      }),
      { numRuns: 15 },
    )
  })

  it('ErrorDisplay with message="Network error" renders alert with that text', () => {
    setup()

    act(() => {
      root.render(React.createElement(ErrorDisplay, { message: 'Network error' }))
    })

    const alertEl = container.querySelector('[role="alert"]')
    expect(alertEl).not.toBeNull()
    expect(alertEl!.textContent).toContain('Network error')

    teardown()
  })
})

// ---------------------------------------------------------------------------
// 4. SSE reconnection — Requirement 3.9
// ---------------------------------------------------------------------------

describe('[PBT] Preservation — SSE scheduleReconnect on network errors', () => {
  /**
   * **Validates: Requirements 3.9**
   *
   * When the SSE client encounters a network error and authFailed is false,
   * scheduleReconnect must be called to attempt reconnection with backoff.
   *
   * We verify this by reading the sseClient.ts source and confirming the
   * reconnection logic is present and correctly gated.
   */
  it('scheduleReconnect returns early when authFailed is true', () => {
    const filePath = path.resolve(__dirname, '../../src/lib/sseClient.ts')
    const fileContent = fs.readFileSync(filePath, 'utf-8')

    // scheduleReconnect must check authFailed and return early
    const scheduleReconnectBody = fileContent.match(
      /function scheduleReconnect\(\)[\s\S]*?(?=function\s+\w+|const\s+\w+\s*=)/,
    )
    expect(scheduleReconnectBody).not.toBeNull()

    const body = scheduleReconnectBody![0]
    // Must check intentionalDisconnect || authFailed and return
    expect(body).toContain('intentionalDisconnect')
    expect(body).toContain('authFailed')
    expect(body).toMatch(/if\s*\(\s*intentionalDisconnect\s*\|\|\s*authFailed\s*\)/)
  })

  it('scheduleReconnect uses exponential backoff via calculateBackoff', () => {
    const filePath = path.resolve(__dirname, '../../src/lib/sseClient.ts')
    const fileContent = fs.readFileSync(filePath, 'utf-8')

    // Extract the scheduleReconnect function body up to the next JSDoc comment block
    const scheduleReconnectBody = fileContent.match(
      /function scheduleReconnect\(\)[\s\S]*?(?=\/\*\*\s*\n\s*\*\s*Clear)/,
    )
    expect(scheduleReconnectBody).not.toBeNull()

    const body = scheduleReconnectBody![0]
    // Must call calculateBackoff for delay computation
    expect(body).toContain('calculateBackoff')
    // Must use setTimeout for scheduling
    expect(body).toContain('setTimeout')
    // Must increment retryCount and call connect()
    expect(body).toContain('retryCount++')
    expect(body).toContain('connect()')
  })

  it('onerror handler calls scheduleReconnect for non-auth network errors', () => {
    const filePath = path.resolve(__dirname, '../../src/lib/sseClient.ts')
    const fileContent = fs.readFileSync(filePath, 'utf-8')

    // The onerror handler must call scheduleReconnect when probe returns non-auth status
    // Pattern: after probeEndpointForAuth, on non-401/403 status → scheduleReconnect()
    expect(fileContent).toContain('scheduleReconnect()')

    // The onerror handler must also call scheduleReconnect on probe failure (catch)
    // Pattern: .catch(() => { scheduleReconnect() })
    const catchReconnectPattern = /\.catch\(\(\)\s*=>\s*\{[\s\S]*?scheduleReconnect\(\)/
    expect(fileContent).toMatch(catchReconnectPattern)
  })
})

// ---------------------------------------------------------------------------
// 5. OptimizedImage fallback — Requirement 3.13
// ---------------------------------------------------------------------------

describe('[PBT] Preservation — OptimizedImage renders fallback on error', () => {
  let container: HTMLDivElement
  let root: Root

  function setup(): void {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  }

  function teardown(): void {
    act(() => { root.unmount() })
    document.body.removeChild(container)
  }

  /**
   * **Validates: Requirements 3.13**
   *
   * When an image fails to load via OptimizedImage, the component must
   * render a fallback placeholder with an SVG icon.
   */
  it('OptimizedImage renders fallback placeholder with SVG when onError fires', () => {
    setup()

    act(() => {
      root.render(
        React.createElement(OptimizedImage, {
          src: '/images/broken.jpg',
          alt: 'Test image',
          width: 400,
          height: 300,
        }),
      )
    })

    // Trigger image error
    const img = container.querySelector('img')
    expect(img).not.toBeNull()

    act(() => {
      img!.dispatchEvent(new Event('error'))
    })

    // After error, the img should be replaced by a fallback div
    const imgAfterError = container.querySelector('img')
    expect(imgAfterError).toBeNull()

    // Fallback should contain an SVG icon
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg!.getAttribute('aria-hidden')).toBe('true')

    teardown()
  })

  it('OptimizedImage fallback has role="img" and aria-label for informational images', () => {
    setup()

    act(() => {
      root.render(
        React.createElement(OptimizedImage, {
          src: '/images/campus.webp',
          alt: 'Campus building',
          width: 640,
          height: 480,
        }),
      )
    })

    const img = container.querySelector('img')!
    act(() => {
      img.dispatchEvent(new Event('error'))
    })

    const fallback = container.querySelector('[role="img"]')
    expect(fallback).not.toBeNull()
    expect(fallback!.getAttribute('aria-label')).toBe('Campus building')

    teardown()
  })

  it('OptimizedImage fallback displays alt text for non-decorative images', () => {
    const arbAlt = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0)

    fc.assert(
      fc.property(arbAlt, (altText) => {
        setup()

        act(() => {
          root.render(
            React.createElement(OptimizedImage, {
              src: '/images/test.jpg',
              alt: altText,
              width: 200,
              height: 150,
            }),
          )
        })

        const img = container.querySelector('img')!
        act(() => {
          img.dispatchEvent(new Event('error'))
        })

        // Fallback should show the alt text
        expect(container.textContent).toContain(altText)

        teardown()
      }),
      { numRuns: 10 },
    )
  })
})
