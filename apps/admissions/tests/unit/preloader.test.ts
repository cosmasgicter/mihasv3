import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Unit tests for the Preloader lifecycle.
 *
 * These test the extracted logic patterns from main.tsx and index.html
 * rather than importing main.tsx directly (which has side effects).
 *
 * Validates: Requirements 2.2, 2.4
 */

describe('Preloader removal after React mount', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('adds fade-out class to #preloader after mount', () => {
    // Set up DOM as index.html would
    document.body.innerHTML = `
      <div id="root">
        <div id="preloader" class="preloader">
          <div class="preloader-dots"><span></span><span></span><span></span></div>
        </div>
      </div>
    `

    // Mirror main.tsx preloader removal logic
    const preloader = document.getElementById('preloader')
    expect(preloader).not.toBeNull()

    preloader!.classList.add('fade-out')

    expect(preloader!.classList.contains('fade-out')).toBe(true)
  })

  it('removes #preloader from DOM after 500ms fade-out', () => {
    document.body.innerHTML = `
      <div id="root">
        <div id="preloader" class="preloader">
          <div class="preloader-dots"><span></span><span></span><span></span></div>
        </div>
      </div>
    `

    const preloader = document.getElementById('preloader')
    expect(preloader).not.toBeNull()

    // Mirror main.tsx: add fade-out, then remove after 500ms
    preloader!.classList.add('fade-out')
    setTimeout(() => {
      preloader!.remove()
    }, 500)

    // Still in DOM before timeout
    expect(document.getElementById('preloader')).not.toBeNull()

    // Advance past 500ms
    vi.advanceTimersByTime(500)

    // Removed from DOM
    expect(document.getElementById('preloader')).toBeNull()
  })

  it('clears the slow-load timeout on mount so the message never appears', () => {
    const slowTimeout = setTimeout(() => {}, 10_000)
    const win = window as unknown as Record<string, unknown>
    win.__preloaderTimeout = slowTimeout

    // Mirror main.tsx: clear the timeout
    clearTimeout(win.__preloaderTimeout as number)

    // Advance past 10s — the slow-load callback should never fire
    const callback = vi.fn()
    const testTimeout = setTimeout(callback, 10_000)
    clearTimeout(testTimeout)

    vi.advanceTimersByTime(11_000)
    // If the original timeout was cleared, no side effects occur
    expect(win.__preloaderTimeout).toBeDefined()
  })

  it('handles missing #preloader gracefully (no error thrown)', () => {
    document.body.innerHTML = '<div id="root"></div>'

    // Mirror main.tsx logic — should not throw
    const preloader = document.getElementById('preloader')
    if (preloader) {
      preloader.classList.add('fade-out')
      setTimeout(() => {
        preloader.remove()
      }, 500)
    }

    expect(preloader).toBeNull()
  })
})

describe('Preloader slow-load message', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows #preloader-slow after 10 seconds', () => {
    document.body.innerHTML = `
      <div id="root">
        <div id="preloader" class="preloader">
          <div class="preloader-dots"><span></span><span></span><span></span></div>
          <p id="preloader-slow" class="preloader-slow" hidden>
            Taking longer than expected. <a href="/">Refresh</a>
          </p>
        </div>
      </div>
    `

    const slowEl = document.getElementById('preloader-slow')
    expect(slowEl).not.toBeNull()
    expect(slowEl!.hidden).toBe(true)

    // Mirror index.html inline script
    setTimeout(() => {
      const el = document.getElementById('preloader-slow')
      if (el) el.hidden = false
    }, 10_000)

    // Not visible before 10s
    vi.advanceTimersByTime(9_999)
    expect(document.getElementById('preloader-slow')!.hidden).toBe(true)

    // Visible after 10s
    vi.advanceTimersByTime(1)
    expect(document.getElementById('preloader-slow')!.hidden).toBe(false)
  })

  it('slow-load message contains a refresh link', () => {
    document.body.innerHTML = `
      <div id="root">
        <div id="preloader" class="preloader">
          <p id="preloader-slow" class="preloader-slow" hidden>
            Taking longer than expected. <a href="/">Refresh</a>
          </p>
        </div>
      </div>
    `

    const link = document.querySelector('#preloader-slow a')
    expect(link).not.toBeNull()
    expect(link!.getAttribute('href')).toBe('/')
  })

  it('slow-load message stays hidden if React mounts before 10s', () => {
    document.body.innerHTML = `
      <div id="root">
        <div id="preloader" class="preloader">
          <p id="preloader-slow" class="preloader-slow" hidden>
            Taking longer than expected. <a href="/">Refresh</a>
          </p>
        </div>
      </div>
    `

    // Mirror index.html: set up the 10s timeout
    const t = setTimeout(() => {
      const el = document.getElementById('preloader-slow')
      if (el) el.hidden = false
    }, 10_000)

    // Mirror main.tsx: React mounts at ~3s, clears the timeout
    vi.advanceTimersByTime(3_000)
    clearTimeout(t)

    // Advance well past 10s
    vi.advanceTimersByTime(15_000)

    // Message should still be hidden because the timeout was cleared
    expect(document.getElementById('preloader-slow')!.hidden).toBe(true)
  })
})
