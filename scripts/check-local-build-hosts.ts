#!/usr/bin/env bun
/**
 * Static outside-host check for a local build (platform-simplification task 3.7,
 * Requirements 1.3, 1.9, 1.11).
 *
 * `harness/bin/harness` runs this after `build_spa`. It fails when
 * `apps/admissions/dist/index.html` has
 *   - a `<link>` whose `rel` is preconnect, dns-prefetch, preload, modulepreload
 *     or stylesheet, or
 *   - a `<script src>`
 * that names a host outside the stack.
 *
 * A preconnect is not a request Playwright can see, which is why this exists next
 * to the runtime outside-host gate. Open Graph and Twitter `<meta>` tags, and
 * `<link rel="canonical">`, are not requests and are not checked.
 *
 * Stack hosts: localhost, 127.0.0.1, [::1], *.localhost, and the compose service
 * names minio, mailpit and adapters. A literal IP address outside loopback is an
 * outside host.
 *
 * Usage: bun run ./scripts/check-local-build-hosts.ts [path/to/index.html]
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { hostOf, isStackHost } from '../apps/admissions/scripts/stack-hosts'

export { hostOf, isStackHost }

const REPO_ROOT = resolve(import.meta.dirname, '..')
const DEFAULT_HTML = resolve(REPO_ROOT, 'apps/admissions/dist/index.html')

const CHECKED_RELS = new Set(['preconnect', 'dns-prefetch', 'preload', 'modulepreload', 'stylesheet'])

export interface Violation {
  element: string
  host: string
}

const TAG = /<(link|script)\b([^>]*)>/gi
const ATTR = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g

function attributes(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of raw.matchAll(ATTR)) {
    out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? ''
  }
  return out
}

/** Every checked element of `html` that names a host outside the stack. */
export function findOutsideHosts(html: string): Violation[] {
  const found: Violation[] = []
  for (const m of html.matchAll(TAG)) {
    const tag = m[1].toLowerCase()
    const attrs = attributes(m[2])
    let value: string | undefined
    let label: string
    if (tag === 'link') {
      const rels = (attrs.rel ?? '').toLowerCase().split(/\s+/)
      const rel = rels.find((r) => CHECKED_RELS.has(r))
      if (!rel) continue
      value = attrs.href
      label = `<link rel="${rel}">`
    } else {
      value = attrs.src
      label = '<script src>'
    }
    if (value === undefined) continue
    const host = hostOf(value)
    if (host && !isStackHost(host)) found.push({ element: label, host })
  }
  return found
}

function main(): void {
  const file = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_HTML
  const violations = findOutsideHosts(readFileSync(file, 'utf-8'))
  if (violations.length === 0) {
    console.log(`[check-local-build-hosts] ok: ${file} names no host outside the stack`)
    return
  }
  for (const v of violations) console.error(`[check-local-build-hosts] ${v.element} names ${v.host}, which is outside the stack`)
  console.error(
    '[check-local-build-hosts] A local build must not name an outside host. If VITE_API_BASE_URL or VITE_LENCO_WIDGET_URL is exported in your shell, unset it.'
  )
  process.exit(1)
}

if (import.meta.main) main()
