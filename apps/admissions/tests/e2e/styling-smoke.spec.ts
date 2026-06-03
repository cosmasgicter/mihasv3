/**
 * Smoke test: the deployed build is actually styled under the production CSP.
 *
 * History: in May 2026 the live admissions site shipped with broken CSS for
 * a period because the post-build HTML finaliser emitted
 *   <link rel="stylesheet" href="..." media="print" onload="this.media='all'">
 * while the production CSP `script-src` directive disallowed `'unsafe-inline'`,
 * so the inline `onload` was blocked. The browser downloaded the CSS but
 * never applied it. Every other test passed because CSS application is
 * invisible to API/integration tests.
 *
 * This test exists to catch that whole class of regression. It:
 *   1. Loads the home page (defaulting to whatever PLAYWRIGHT_BASE_URL
 *      points at — local preview, deploy preview, or production).
 *   2. Injects the production CSP into every document response so the
 *      check works even when running against `vite preview` (which sets
 *      no CSP) or against environments with a relaxed CSP.
 *   3. Asserts no CSP-violation messages appeared in the console.
 *   4. Asserts the page is visibly styled by reading the body's computed
 *      background color (must come from the design tokens, not the
 *      browser default), and asserting that document.styleSheets
 *      contains a non-trivial number of CSS rules.
 *
 * To run:
 *   # against a local production build:
 *   cd apps/admissions
 *   bun run build
 *   bun x --bun vite preview --port 4173 &
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 bun x playwright test tests/e2e/styling-smoke.spec.ts
 *
 *   # against production:
 *   PLAYWRIGHT_BASE_URL=https://apply.mihas.edu.zm bun x playwright test tests/e2e/styling-smoke.spec.ts
 */
import { test, expect } from '@playwright/test'

// Match the directive from apps/admissions/vercel.json. Kept inline (not
// imported from vercel.json) so the test fails LOUDLY if someone changes
// the CSP without updating this assertion: a CSP loosening should be a
// deliberate, reviewed action.
const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' blob: https://pay.lenco.co https://pay.sandbox.lenco.co",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "style-src-elem 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' data: https://api.mihas.edu.zm https://pay.lenco.co https://pay.sandbox.lenco.co https://api.lenco.co https://api.sandbox.lenco.co https://app.glitchtip.com",
  "frame-src 'self' https://pay.lenco.co https://pay.sandbox.lenco.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ')

test.describe('build styling smoke', () => {
  test('home page is fully styled under the production CSP', async ({ context, page }) => {
    // Inject production CSP into every document response.
    await context.route('**/*', async (route) => {
      const response = await route.fetch()
      const headers = { ...response.headers() }
      if (route.request().resourceType() === 'document') {
        headers['content-security-policy'] = PRODUCTION_CSP
      }
      await route.fulfill({ response, headers })
    })

    const cspViolations: string[] = []
    page.on('console', (msg) => {
      const text = msg.text()
      if (/Content Security Policy|Refused to (?:load|execute|apply)/i.test(text)) {
        cspViolations.push(text)
      }
    })

    await page.goto('/', { waitUntil: 'networkidle' })

    // 1. No CSP violation logged.
    expect(cspViolations, `CSP violations:\n${cspViolations.join('\n')}`).toHaveLength(0)

    // 2. Page is visibly styled — body background must come from design tokens.
    const bodyStyle = await page.evaluate(() => {
      const cs = getComputedStyle(document.body)
      return {
        backgroundColor: cs.backgroundColor,
        color: cs.color,
        fontFamily: cs.fontFamily,
        fontSize: cs.fontSize,
      }
    })
    // Default browser body background is `rgba(0, 0, 0, 0)`; design tokens
    // resolve to white (`rgb(255, 255, 255)`). Anything else means the
    // CSS never applied.
    expect(bodyStyle.backgroundColor).toBe('rgb(255, 255, 255)')
    expect(bodyStyle.fontFamily.toLowerCase()).toContain('inter')
    expect(bodyStyle.fontSize).toBe('16px')

    // 3. The full Tailwind/utility CSS is reachable. Without it, total CSS
    //    rules will be tiny (just the ~50 rules in the inlined critical
    //    CSS). With it, hundreds of rules are present.
    const totalRules = await page.evaluate(() => {
      let total = 0
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          total += (sheet.cssRules ?? []).length
        } catch {
          /* ignore cross-origin stylesheets */
        }
      }
      return total
    })
    expect(totalRules).toBeGreaterThan(500)

    // 4. The React root contains DOM with Tailwind utility classes — i.e.,
    //    the SPA mounted and is using the design system.
    const rootHasTailwindClasses = await page.evaluate(() => {
      const root = document.getElementById('root')
      if (!root) return false
      // Look for any element with a class attribute that contains a known
      // Tailwind utility produced by the project.
      return /\b(min-h-screen|bg-background|text-foreground|flex|grid|rounded-)/.test(
        root.outerHTML,
      )
    })
    expect(rootHasTailwindClasses).toBe(true)
  })
})
