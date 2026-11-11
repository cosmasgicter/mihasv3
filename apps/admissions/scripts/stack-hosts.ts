/**
 * What counts as "inside the stack" for a local build and a harness run
 * (platform-simplification task 3.7, Requirement 1.11).
 *
 * Pure and dependency-free, with no `import.meta`, so it loads both from Bun
 * (`scripts/check-local-build-hosts.ts`) and from Playwright's TypeScript loader
 * (`apps/admissions/tests/harness-e2e/harness-fixtures.ts`). Stack hosts:
 * localhost, 127.0.0.1, [::1], *.localhost, and the compose service names minio,
 * mailpit and adapters. A literal IP address outside loopback is an outside host.
 */

const STACK_NAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1', 'minio', 'mailpit', 'adapters'])

/** True when `host` (a URL hostname, brackets allowed on IPv6) belongs to the stack. */
export function isStackHost(host: string): boolean {
  const name = host.trim().toLowerCase().replace(/\.$/, '')
  if (STACK_NAMES.has(name)) return true
  return name.endsWith('.localhost')
}

/** Schemes that reach the network. A browser-internal URL (`chrome://`, `chrome-extension://`,
 * the built-in PDF viewer) names no host on the network, so it is never an outside host. */
const NETWORK_SCHEMES = new Set(['http:', 'https:', 'ws:', 'wss:'])

/** The hostname a `href`/`src`/request URL points at, or null when it names no network host
 * (relative, `data:`, `blob:`, `#`, browser-internal schemes). */
export function hostOf(value: string): string | null {
  const v = value.trim()
  if (!v || v.startsWith('#')) return null
  const candidate = v.startsWith('//') ? `http:${v}` : v
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) return null // relative path or data:/blob:/mailto:
  try {
    const url = new URL(candidate)
    if (!NETWORK_SCHEMES.has(url.protocol)) return null
    return url.hostname // IPv6 keeps its brackets
  } catch {
    return null
  }
}
