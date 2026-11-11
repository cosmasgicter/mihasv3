/**
 * Resource hints derived from build configuration (platform-simplification task 3.7,
 * Requirements 1.9 and 1.11).
 *
 * `index.html` used to hard-code three `<link rel="preconnect">` lines to the
 * production API and to both Lenco widget hosts. A local build (the harness, a
 * developer's machine) then told the browser to open connections to hosts outside
 * the stack. The `beanola-resource-hints` plugin in `vite.config.ts` now emits the
 * hints from configuration instead, using this pure function.
 *
 * Assumption, stated on purpose: production sets `VITE_API_BASE_URL` to the API
 * origin, which is what the deploy documentation already says. A build that sets it
 * to the app origin (the harness's same-origin sentinel) gets no API hint, although
 * `getApiBaseUrl` (`src/lib/apiConfig.ts`) maps that value to the API origin at
 * runtime. If production were configured that way, the only effect is one later TLS
 * handshake to the API.
 */

/** Keep in step with `PRODUCTION_APP_ORIGIN` in `src/lib/apiConfig.ts` (a test checks it). */
export const APP_ORIGIN_IGNORED_AS_API = 'https://apply.beanola.com'
/** Keep in step with `useLencoWidget.ts` (a test checks both). */
export const PRODUCTION_WIDGET_URL = 'https://pay.lenco.co/js/v1/inline.js'
export const SANDBOX_WIDGET_URL = 'https://pay.sandbox.lenco.co/js/v1/inline.js'

export interface ResourceHint {
  href: string
  crossorigin: boolean
}

export interface ResourceHintInput {
  apiBaseUrl?: string
  widgetUrl?: string
  isProduction: boolean
}

function isLocalHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '')
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.localhost')
}

/** The origin of an absolute http(s) URL that is not a local host, else null. */
function remoteOrigin(value: string | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null // relative (`/__lenco/...`) or malformed: nothing to preconnect to
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (isLocalHostname(url.hostname)) return null
  return url.origin
}

export function resolveResourceHints(input: ResourceHintInput): ResourceHint[] {
  const hints: ResourceHint[] = []

  // Same normalisation as `getApiBaseUrl`: a trailing slash and `/api/v1` are not part of the origin.
  const apiBase = input.apiBaseUrl?.trim().replace(/\/$/, '').replace(/\/api\/v1$/, '')
  const apiOrigin = remoteOrigin(apiBase)
  if (apiOrigin && apiOrigin !== APP_ORIGIN_IGNORED_AS_API) {
    hints.push({ href: apiOrigin, crossorigin: true })
  }

  // The widget URL the app will actually load (`useLencoWidget.ts`).
  const widgetUrl = input.widgetUrl?.trim() || (input.isProduction ? PRODUCTION_WIDGET_URL : SANDBOX_WIDGET_URL)
  const widgetOrigin = remoteOrigin(widgetUrl)
  if (widgetOrigin) {
    hints.push({ href: widgetOrigin, crossorigin: false })
  }
  return hints
}
