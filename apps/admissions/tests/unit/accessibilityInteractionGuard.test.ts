import { describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const SRC_ROOT = path.resolve(__dirname, '../../src')

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(SRC_ROOT, relativePath), 'utf-8')
}

describe('accessibility interaction guard', () => {
  it('keeps public and authenticated layouts skip-linkable with focusable main landmarks', () => {
    const publicLayout = readSource('components/layout/PublicLayout.tsx')
    const appLayout = readSource('components/navigation/AppLayout.tsx')

    for (const source of [publicLayout, appLayout]) {
      expect(source).toContain('SkipLink')
      expect(source).toContain('APP_MAIN_CONTENT_ID')
      expect(source).toContain('tabIndex={-1}')
    }
  })

  it('keeps route-change focus targeting the canonical main content id', () => {
    const app = readSource('App.tsx')
    const authShell = readSource('components/AuthenticatedRouteShell.tsx')

    expect(app).toContain('APP_MAIN_CONTENT_ID')
    expect(app).toContain('requestAnimationFrame(focusMainContent)')
    expect(app).toContain('setTimeout(focusMainContent, 150)')
    expect(app).toContain("target.setAttribute('tabindex', '-1')")
    expect(authShell).toContain('document.getElementById(APP_MAIN_CONTENT_ID)')
    expect(authShell).not.toContain("document.getElementById('main-content')")
  })

  it('keeps async slip progress dialog dismissible and named', () => {
    const source = readSource('pages/student/applicationWizard/components/SubmissionSuccess.tsx')

    expect(source).toContain('useEscapeKey')
    expect(source).toContain('aria-modal="true"')
    expect(source).toContain('aria-label="Application slip progress"')
    expect(source).toContain('autoFocus')
  })

  it('keeps status badges perceivable beyond color alone', () => {
    const source = readSource('components/ui/StatusBadge.tsx')

    expect(source).toContain('label: React.ReactNode')
    expect(source).toContain('TONE_DEFAULT_ICONS')
    expect(source).toContain('aria-hidden="true"')
  })

  it('keeps global reduced-motion safeguards enabled', () => {
    const indexCss = readSource('index.css')

    expect(indexCss).toContain('@media (prefers-reduced-motion: reduce)')
    expect(indexCss).toContain('animation-duration: 0.01ms !important')
    expect(indexCss).toContain('transition-duration: 0.01ms !important')
    expect(indexCss).toContain('scroll-behavior: auto !important')
  })
})
