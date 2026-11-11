// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  APP_ORIGIN_IGNORED_AS_API,
  PRODUCTION_WIDGET_URL,
  SANDBOX_WIDGET_URL,
  resolveResourceHints,
} from '../../scripts/resourceHints'

// Task 3.7 (R1.9, R1.11): preconnect hints come from configuration, not from index.html.
const SRC = path.resolve(__dirname, '../../src')
const read = (rel: string) => readFileSync(path.join(SRC, rel), 'utf8')

describe('resolveResourceHints', () => {
  it('a production build with the API origin and no widget variable emits the API and live-widget hints', () => {
    expect(
      resolveResourceHints({ apiBaseUrl: 'https://api.example.test', widgetUrl: '', isProduction: true })
    ).toEqual([
      { href: 'https://api.example.test', crossorigin: true },
      { href: 'https://pay.lenco.co', crossorigin: false },
    ])
  })

  it('never emits the sandbox hint for a production build', () => {
    const hrefs = resolveResourceHints({ apiBaseUrl: 'https://api.example.test', isProduction: true }).map((h) => h.href)
    expect(hrefs).not.toContain('https://pay.sandbox.lenco.co')
  })

  it('a non-production build with no widget variable hints the sandbox widget', () => {
    const hrefs = resolveResourceHints({ apiBaseUrl: undefined, isProduction: false }).map((h) => h.href)
    expect(hrefs).toEqual(['https://pay.sandbox.lenco.co'])
  })

  it('the harness build emits none: the app origin is the same-origin sentinel and the widget is a relative stub', () => {
    expect(
      resolveResourceHints({
        apiBaseUrl: APP_ORIGIN_IGNORED_AS_API,
        widgetUrl: '/__lenco/js/v1/inline.js',
        isProduction: true,
      })
    ).toEqual([])
  })

  it('strips a trailing slash and /api/v1 before comparing, as getApiBaseUrl does', () => {
    expect(resolveResourceHints({ apiBaseUrl: `${APP_ORIGIN_IGNORED_AS_API}/api/v1/`, widgetUrl: '/x.js', isProduction: true })).toEqual([])
    expect(resolveResourceHints({ apiBaseUrl: 'https://api.example.test/api/v1', widgetUrl: '/x.js', isProduction: true })).toEqual([
      { href: 'https://api.example.test', crossorigin: true },
    ])
  })

  it.each(['http://localhost:8000', 'http://127.0.0.1:8000', 'http://[::1]:8000', 'http://mihas.localhost:8090'])(
    'a local API host (%s) gets no hint',
    (apiBaseUrl) => {
      expect(resolveResourceHints({ apiBaseUrl, widgetUrl: '/x.js', isProduction: false })).toEqual([])
    }
  )

  it('an absolute widget URL on a local host gets no hint', () => {
    expect(resolveResourceHints({ widgetUrl: 'http://localhost:59099/js/v1/inline.js', isProduction: true })).toEqual([])
  })

  it('a malformed or non-http value is ignored', () => {
    expect(resolveResourceHints({ apiBaseUrl: 'not a url', widgetUrl: 'ftp://x.test/a.js', isProduction: true })).toEqual([])
  })
})

describe('constants stay in step with the app', () => {
  it('APP_ORIGIN_IGNORED_AS_API matches PRODUCTION_APP_ORIGIN in apiConfig.ts', () => {
    const match = /const PRODUCTION_APP_ORIGIN = '([^']+)'/.exec(read('lib/apiConfig.ts'))
    expect(match?.[1]).toBe(APP_ORIGIN_IGNORED_AS_API)
  })

  it('the widget URLs match useLencoWidget.ts', () => {
    const source = read('hooks/useLencoWidget.ts')
    expect(source).toContain(`const PRODUCTION_WIDGET_URL = '${PRODUCTION_WIDGET_URL}'`)
    expect(source).toContain(`const SANDBOX_WIDGET_URL = '${SANDBOX_WIDGET_URL}'`)
  })
})
