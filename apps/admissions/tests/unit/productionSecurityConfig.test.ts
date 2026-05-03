import { describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ADMISSIONS_ROOT = path.resolve(__dirname, '../..')

function getGlobalHeader(key: string): string {
  const vercelJson = JSON.parse(fs.readFileSync(path.join(ADMISSIONS_ROOT, 'vercel.json'), 'utf-8'))
  const globalHeaders = vercelJson.headers.find((h: { source: string }) => h.source === '/(.*)')
  const header = globalHeaders?.headers.find((h: { key: string }) => h.key === key)
  return header?.value ?? ''
}

describe('production security config', () => {
  it('does not allow inline scripts in production CSP', () => {
    const csp = getGlobalHeader('Content-Security-Policy')
    const scriptSrc = csp.match(/(?:^|;\s*)script-src\s+([^;]+)/)?.[1] ?? ''

    expect(scriptSrc).toContain("'self'")
    expect(scriptSrc).not.toContain("'unsafe-inline'")
  })

  it('loads preloader behavior from a same-origin external script', () => {
    const html = fs.readFileSync(path.join(ADMISSIONS_ROOT, 'index.html'), 'utf-8')

    expect(html).toContain('<script src="/preloader.js" defer></script>')
    expect(html).not.toMatch(/<script>\s*\(function/)
    expect(fs.existsSync(path.join(ADMISSIONS_ROOT, 'public/preloader.js'))).toBe(true)
  })

  it('documents the remaining style-src inline exception without a script exception', () => {
    const note = getGlobalHeader('X-CSP-Note')

    expect(note).toContain('script-src does not allow unsafe-inline')
    expect(note).toContain('style-src unsafe-inline remains')
  })

  it('requires all production VITE variables used by the admissions deployment', () => {
    const viteConfig = fs.readFileSync(path.join(ADMISSIONS_ROOT, 'vite.config.ts'), 'utf-8')
    const required = [
      'VITE_API_BASE_URL',
      'VITE_APP_BASE_URL',
      'VITE_APP_VERSION',
      'VITE_SITE_URL',
      'VITE_LENCO_PUBLIC_KEY',
      'VITE_GLITCHTIP_DSN',
    ]

    for (const key of required) {
      expect(viteConfig).toContain(`'${key}'`)
    }
  })
})
