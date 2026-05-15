#!/usr/bin/env bun
/**
 * Static check that the production HTML the build emits is compatible with
 * the production CSP defined in `vercel.json`.
 *
 * History: in May 2026 the admissions production CSP was tightened to
 * remove `script-src 'unsafe-inline'`. The post-build HTML finaliser was
 * still rewriting the main CSS `<link>` to use the
 * `media="print" onload="this.media='all'"` pattern, which CSP now blocks.
 * Browsers downloaded the CSS but never applied it, leaving the live site
 * unstyled. This check catches that whole class of regression at build
 * time, before anyone deploys it.
 *
 * Run:
 *   bun scripts/check-html-csp.ts
 *
 * Exits non-zero on any violation. Run after `bun run build`.
 */
import fs from 'node:fs/promises'
import path from 'node:path'

interface Violation {
  rule: string
  detail: string
  line?: number
}

const HTML_PATH = path.resolve(process.cwd(), 'dist', 'index.html')
const VERCEL_PATH = path.resolve(process.cwd(), 'vercel.json')

async function main(): Promise<number> {
  let html: string
  try {
    html = await fs.readFile(HTML_PATH, 'utf8')
  } catch (err) {
    console.error(`✖ check-html-csp: cannot read ${HTML_PATH}. Run \`bun run build\` first.`)
    return 1
  }

  const vercelJson = JSON.parse(await fs.readFile(VERCEL_PATH, 'utf8'))
  const csp = extractCsp(vercelJson)
  if (!csp) {
    console.error('✖ check-html-csp: no Content-Security-Policy header found in vercel.json')
    return 1
  }

  const directives = parseCsp(csp)
  const scriptSrc = directives.get('script-src') ?? []
  const styleSrc = directives.get('style-src') ?? []
  const allowsUnsafeInlineScript = scriptSrc.includes("'unsafe-inline'")
  const allowsUnsafeInlineStyle = styleSrc.includes("'unsafe-inline'")

  const violations: Violation[] = []

  // 1. No inline event handler attributes anywhere in any tag.
  //    These count as inline script under CSP and break the page when
  //    `script-src` does not include `'unsafe-inline'`.
  if (!allowsUnsafeInlineScript) {
    for (const m of matchAll(html, /<(?<tag>[a-zA-Z][^\s/>]*)\b[^>]*?\s(?<attr>on[a-zA-Z]+)\s*=/g)) {
      violations.push({
        rule: 'inline-event-handler',
        detail: `<${m.groups!.tag} ... ${m.groups!.attr}=...>`,
        line: lineOf(html, m.index),
      })
    }
  }

  // 2. No <link rel="stylesheet" media="print" onload=...> CSS-deferral
  //    pattern. Even with `script-src 'unsafe-inline'`, this is fragile
  //    and silently turns the page unstyled if the CSP ever tightens.
  for (const m of matchAll(
    html,
    /<link[^>]*\brel\s*=\s*"stylesheet"[^>]*\bmedia\s*=\s*"print"[^>]*>/g,
  )) {
    violations.push({
      rule: 'css-media-print-deferral',
      detail: m[0],
      line: lineOf(html, m.index),
    })
  }

  // 3. No `javascript:` URLs.
  for (const m of matchAll(html, /\b(?:href|src|action|formaction)\s*=\s*"javascript:/g)) {
    violations.push({
      rule: 'javascript-url',
      detail: m[0],
      line: lineOf(html, m.index),
    })
  }

  // 4. No inline <script>...</script> with body content unless allowed.
  //    Vite never emits inline script bodies for us; if one appears, it
  //    is almost certainly a regression.
  if (!allowsUnsafeInlineScript) {
    for (const m of matchAll(
      html,
      /<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/g,
    )) {
      const body = m[1].trim()
      if (body.length > 0) {
        violations.push({
          rule: 'inline-script-body',
          detail: `<script> with ${body.length} chars of inline JS`,
          line: lineOf(html, m.index),
        })
      }
    }
  }

  // 5. Inline <style> blocks are allowed iff `style-src 'unsafe-inline'`
  //    is in CSP. We currently allow it (Radix UI runtime + critters
  //    critical CSS). Flag if that ever changes.
  if (!allowsUnsafeInlineStyle) {
    for (const m of matchAll(html, /<style\b[^>]*>([\s\S]*?)<\/style>/g)) {
      if (m[1].trim().length > 0) {
        violations.push({
          rule: 'inline-style-body',
          detail: `<style> with ${m[1].length} chars of inline CSS but style-src lacks 'unsafe-inline'`,
          line: lineOf(html, m.index),
        })
      }
    }
  }

  // 6. The page MUST contain at least one <link rel="stylesheet"> pointing
  //    at the main CSS asset, otherwise Tailwind utilities and any styles
  //    not in the inlined critical CSS will never apply.
  const hasMainStylesheetLink = /<link[^>]*\brel\s*=\s*"stylesheet"[^>]*\bhref\s*=\s*"\/assets\/[^"]+\.css"/.test(
    html,
  )
  if (!hasMainStylesheetLink) {
    violations.push({
      rule: 'missing-main-stylesheet',
      detail: 'no <link rel="stylesheet" href="/assets/...css"> found',
    })
  }

  // 7. The page MUST contain an inline <style> block with non-trivial size.
  //    This is the critters-inlined critical CSS. If critters fails
  //    silently (try/catch in the plugin), this drops back to the
  //    preloader-only inline style which is small. Flag that as a soft
  //    warning so we notice degraded FCP before users do.
  let totalInlineStyleBytes = 0
  for (const m of matchAll(html, /<style\b[^>]*>([\s\S]*?)<\/style>/g)) {
    totalInlineStyleBytes += m[1].length
  }
  const CRITICAL_CSS_MIN_BYTES = 4000 // preloader CSS alone is ~3KB
  let degraded = false
  if (totalInlineStyleBytes < CRITICAL_CSS_MIN_BYTES) {
    degraded = true
  }

  // Report
  console.log(`\ncheck-html-csp: scanned ${HTML_PATH}`)
  console.log(`  CSP script-src 'unsafe-inline': ${allowsUnsafeInlineScript ? 'YES' : 'NO'}`)
  console.log(`  CSP style-src 'unsafe-inline':  ${allowsUnsafeInlineStyle ? 'YES' : 'NO'}`)
  console.log(`  inline <style> total bytes:     ${totalInlineStyleBytes}`)
  console.log(`  main <link rel=stylesheet>:     ${hasMainStylesheetLink ? 'present' : 'MISSING'}`)

  if (violations.length === 0) {
    if (degraded) {
      console.warn(
        `\n⚠ check-html-csp: only ${totalInlineStyleBytes} bytes of inline critical CSS — critters may have failed silently. FCP will degrade. Investigate the build log.`,
      )
    } else {
      console.log('\n✓ check-html-csp: HTML is compatible with the production CSP.')
    }
    return 0
  }

  console.error(`\n✖ check-html-csp: ${violations.length} violation(s):\n`)
  for (const v of violations) {
    const where = v.line ? `:${v.line}` : ''
    console.error(`  [${v.rule}]${where} ${v.detail}`)
  }
  console.error(
    `\nThese patterns are blocked by the current Content-Security-Policy in vercel.json.\nRefuse to deploy.`,
  )
  return 2
}

function extractCsp(vercelJson: any): string | undefined {
  const headerGroups = vercelJson?.headers ?? []
  for (const group of headerGroups) {
    if (group?.source !== '/(.*)') continue
    for (const h of group.headers ?? []) {
      if (h.key === 'Content-Security-Policy' && typeof h.value === 'string') {
        return h.value
      }
    }
  }
  return undefined
}

function parseCsp(csp: string): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const directive of csp.split(';')) {
    const trimmed = directive.trim()
    if (!trimmed) continue
    const [name, ...values] = trimmed.split(/\s+/)
    out.set(name, values)
  }
  return out
}

function* matchAll(
  s: string,
  re: RegExp,
): Iterable<RegExpExecArray & { groups?: Record<string, string> }> {
  const flagged = re.flags.includes('g') ? re : new RegExp(re.source, re.flags + 'g')
  let m: RegExpExecArray | null
  while ((m = flagged.exec(s)) !== null) {
    yield m as RegExpExecArray & { groups?: Record<string, string> }
    if (m.index === flagged.lastIndex) flagged.lastIndex++
  }
}

function lineOf(s: string, index: number): number {
  let line = 1
  for (let i = 0; i < index && i < s.length; i++) if (s.charCodeAt(i) === 10) line++
  return line
}

main().then((code) => process.exit(code))
