/**
 * Preservation Property Tests — Audit Production Fixes
 *
 * **Validates: Requirements 3.1, 3.2, 3.5, 3.13**
 *
 * These tests verify EXISTING correct behavior that must be preserved
 * through the bugfix. They MUST ALL PASS on unfixed code.
 *
 * 1. Settings dirty detection: modifying a field sets isDirty to true
 * 2. Settings validation errors: server field errors via setError() display inline
 * 3. ErrorDisplay real errors: non-empty messages render role="alert" with text
 * 4. OptimizedImage fallback: renders fallback placeholder when onError fires
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
  // admissions-v2 task 6.1 makes profile/settings autosave canonical (finding
  // STU-20): manual submit + a Settings-owned beforeunload confirm are replaced
  // by per-section autosave with explicit save state, and the single unload
  // guard now lives in the autosave hook. The preserved invariant is that a
  // user edit is detected and surfaced as visible save state, and unsaved work
  // is still protected on unload — just relocated to the canonical owner.

  it('Settings surfaces edits as explicit per-section save state', () => {
    const filePath = path.resolve(__dirname, '../../src/pages/student/Settings.tsx')
    const fileContent = fs.readFileSync(filePath, 'utf-8')

    // Edits route through the canonical per-section autosave hook and render a
    // visible save-state indicator (dirty/saving/saved/offline/…).
    expect(fileContent).toContain('useProfileSectionAutosave')
    expect(fileContent).toContain('SaveIndicator')
    // isDirty is still consulted (hydration guard) so autosave never clobbers
    // in-progress edits with background profile refreshes.
    expect(fileContent).toContain('isDirty')
  })

  it('the autosave hook owns the beforeunload guard for unsynced work', () => {
    const hookPath = path.resolve(__dirname, '../../src/hooks/student/useProfileSectionAutosave.ts')
    const hookContent = fs.readFileSync(hookPath, 'utf-8')

    // The guard moved from Settings to the hook and fires only when there is
    // genuinely unsynchronised work still queued.
    expect(hookContent).toContain('beforeunload')
    expect(hookContent).toContain('hasPendingWork')

    // Settings.tsx no longer owns a beforeunload handler.
    const settingsPath = path.resolve(__dirname, '../../src/pages/student/Settings.tsx')
    expect(fs.readFileSync(settingsPath, 'utf-8')).not.toContain('beforeunload')
  })

  it('Settings autosaves instead of gating a manual submit button on dirty', () => {
    const filePath = path.resolve(__dirname, '../../src/pages/student/Settings.tsx')
    const fileContent = fs.readFileSync(filePath, 'utf-8')

    // Manual-submit-only save is retired; the page schedules autosave on edit.
    expect(fileContent).toContain('scheduleSave')
    // The retired native window.confirm navigation guard is gone (STU-10).
    expect(fileContent).not.toContain('window.confirm')
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

  it('Settings surfaces save failures with an accessible alert save state', () => {
    const filePath = path.resolve(__dirname, '../../src/pages/student/Settings.tsx')
    const fileContent = fs.readFileSync(filePath, 'utf-8')

    // admissions-v2 task 6.1: the per-section SaveIndicator renders error and
    // conflict states with role="alert" + aria-live="assertive" (accessible
    // inline feedback), replacing the single manual-submit status banner.
    expect(fileContent).toContain('SaveIndicator')
    const indicatorPath = filePath // SaveIndicator is defined in Settings.tsx
    const indicatorContent = fs.readFileSync(indicatorPath, 'utf-8')
    expect(indicatorContent).toMatch(/role=\{status === 'error' \|\| status === 'conflict' \? 'alert'/)
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
