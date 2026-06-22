/**
 * Unit tests — Frontend static asset and bundle optimization
 *
 * Feature: system-performance-hardening
 * Requirements: 10.4, 10.6, 10.7
 *
 * Covers three behaviour-preserving frontend optimizations:
 *  - R10.4: the spreadsheet writer module is loaded through a dynamic import
 *    inside the export action, so it is excluded from the initial bundle and
 *    only evaluated on the first export.
 *  - R10.6: the admin card virtualization threshold is the single fixed
 *    integer 40 (within the inclusive range 30–50).
 *  - R10.7: a static-asset load failure renders the existing OptimizedImage
 *    fallback while preserving the surrounding layout (rendered dimensions).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

const EXPORT_UTILS_PATH = path.resolve(__dirname, '../../src/lib/exportUtils.ts')

// ---------------------------------------------------------------------------
// R10.4 — Spreadsheet writer is dynamically imported (excluded from initial bundle)
// ---------------------------------------------------------------------------

describe('R10.4 — spreadsheet writer is loaded via dynamic import', () => {
  const source = fs.readFileSync(EXPORT_UTILS_PATH, 'utf-8')

  it('has no top-level static import of the spreadsheet writer or the xlsx package', () => {
    // The xlsx npm package was removed; the writer lives in @/lib/xlsxWriter.
    // Neither may be statically imported at module top level, or it would be
    // pulled into the initial bundle.
    const staticImportLines = source
      .split('\n')
      .filter((line) => /^\s*import\b/.test(line))

    for (const line of staticImportLines) {
      expect(line).not.toMatch(/from\s+['"]xlsx['"]/)
      expect(line).not.toMatch(/from\s+['"]@\/lib\/xlsxWriter['"]/)
    }
  })

  it('loads the writer through an await import() inside the export action', () => {
    // The dynamic import must be present so the module is split into its own
    // lazily-loaded chunk and fetched only when an export runs.
    expect(source).toMatch(/await\s+import\(\s*['"]@\/lib\/xlsxWriter['"]\s*\)/)
  })

  it('does not evaluate the writer module until exportToExcel is invoked', async () => {
    // Mock the writer so we can observe exactly when it is first used.
    const downloadXlsx = vi.fn()
    vi.doMock('@/lib/xlsxWriter', () => ({
      downloadXlsx,
      createXlsxBlob: vi.fn(),
    }))

    // Importing exportUtils must NOT trigger the writer (it is only referenced
    // inside the dynamically-imported export action).
    const { exportToExcel } = await import('@/lib/exportUtils')
    expect(downloadXlsx).not.toHaveBeenCalled()

    // Running the export action triggers the dynamic import and uses the writer.
    await exportToExcel([], 'applications.xlsx')
    expect(downloadXlsx).toHaveBeenCalledTimes(1)

    vi.doUnmock('@/lib/xlsxWriter')
    vi.resetModules()
  })
})

// ---------------------------------------------------------------------------
// R10.6 — Admin card virtualization threshold is the fixed integer 40
// ---------------------------------------------------------------------------

describe('R10.6 — admin card virtualization threshold is a fixed 40', () => {
  it('exposes ADMIN_CARD_VIRTUALIZATION_THRESHOLD equal to 40', async () => {
    const { ADMIN_CARD_VIRTUALIZATION_THRESHOLD } = await import('@/pages/admin/Applications')
    expect(ADMIN_CARD_VIRTUALIZATION_THRESHOLD).toBe(40)
  })

  it('is a single fixed integer within the inclusive range 30–50', async () => {
    const { ADMIN_CARD_VIRTUALIZATION_THRESHOLD } = await import('@/pages/admin/Applications')
    expect(Number.isInteger(ADMIN_CARD_VIRTUALIZATION_THRESHOLD)).toBe(true)
    expect(ADMIN_CARD_VIRTUALIZATION_THRESHOLD).toBeGreaterThanOrEqual(30)
    expect(ADMIN_CARD_VIRTUALIZATION_THRESHOLD).toBeLessThanOrEqual(50)
  })
})

// ---------------------------------------------------------------------------
// R10.7 — Static-asset load failure renders the OptimizedImage fallback
//         while preserving layout
// ---------------------------------------------------------------------------

describe('R10.7 — OptimizedImage fallback preserves layout on load failure', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.removeChild(container)
  })

  it('renders the fallback element preserving the rendered dimensions and alt text', async () => {
    const { OptimizedImage } = await import('@/components/ui/OptimizedImage')
    const root = createRoot(container)

    await act(async () => {
      root.render(
        React.createElement(OptimizedImage, {
          src: '/images/missing-asset.png',
          alt: 'Campus photo',
          width: 320,
          height: 200,
        }),
      )
    })

    const img = container.querySelector('img')
    expect(img).not.toBeNull()

    // Simulate the static asset failing to load.
    await act(async () => {
      img!.dispatchEvent(new Event('error'))
    })

    // The fallback element replaces the image but keeps the same footprint so
    // the surrounding layout does not shift (R10.7).
    const fallback = container.querySelector('div[role="img"]')
    expect(fallback).not.toBeNull()
    expect((fallback as HTMLElement).style.width).toBe('320px')
    expect((fallback as HTMLElement).style.height).toBe('200px')

    // The accessible label / visible alt text is preserved in the fallback.
    expect(fallback!.getAttribute('aria-label')).toBe('Campus photo')
    const altSpan = fallback!.querySelector('span.text-xs')
    expect(altSpan).not.toBeNull()
    expect(altSpan!.textContent).toBe('Campus photo')

    act(() => { root.unmount() })
  })

  it('preserves layout for decorative images without exposing an alt label', async () => {
    const { OptimizedImage } = await import('@/components/ui/OptimizedImage')
    const root = createRoot(container)

    await act(async () => {
      root.render(
        React.createElement(OptimizedImage, {
          src: '/images/decorative.png',
          alt: 'decorative',
          width: 48,
          height: 48,
          decorative: true,
        }),
      )
    })

    const img = container.querySelector('img')
    expect(img).not.toBeNull()

    await act(async () => {
      img!.dispatchEvent(new Event('error'))
    })

    const fallback = container.querySelector('div[role="presentation"]')
    expect(fallback).not.toBeNull()
    expect((fallback as HTMLElement).style.width).toBe('48px')
    expect((fallback as HTMLElement).style.height).toBe('48px')
    expect(fallback!.getAttribute('aria-label')).toBeNull()

    act(() => { root.unmount() })
  })
})
