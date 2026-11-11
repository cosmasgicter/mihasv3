// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { findOutsideHosts, hostOf, isStackHost } from '../../../../scripts/check-local-build-hosts'

// Task 3.7 (R1.3, R1.9, R1.11): the static outside-host check on a built index.html.

const page = (head: string) => `<!doctype html><html><head>${head}</head><body><div id="root"></div></body></html>`

describe('isStackHost', () => {
  it.each(['localhost', 'LOCALHOST', '127.0.0.1', '[::1]', 'mihas.localhost', 'a.b.localhost', 'minio', 'mailpit', 'adapters', 'localhost.'])(
    '%s belongs to the stack',
    (host) => expect(isStackHost(host)).toBe(true)
  )

  it.each([
    'apply.beanola.com',
    'pay.lenco.co',
    'localhost.example.test', // a name that merely starts with localhost
    'notlocalhost', // a name that merely ends with it, with no dot
    '8.8.8.8', // IPv4 outside loopback
    '10.0.0.5',
    '127.0.0.2', // loopback range, but not a listed stack host
    '[2001:db8::1]', // IPv6 outside loopback
    '[fe80::1]',
    '[::2]',
  ])('%s does not', (host) => expect(isStackHost(host)).toBe(false))
})

describe('hostOf', () => {
  it('reads absolute, protocol-relative and IPv6 URLs', () => {
    expect(hostOf('https://api.example.test/x')).toBe('api.example.test')
    expect(hostOf('//cdn.example.test/a.js')).toBe('cdn.example.test')
    expect(hostOf('http://[::1]:8090/a')).toBe('[::1]')
    expect(hostOf('http://192.168.1.4:8000/')).toBe('192.168.1.4')
  })

  it('returns null for values that name no host', () => {
    for (const value of ['/assets/a.js', 'assets/a.js', './a.css', '#top', 'data:image/png;base64,AA', 'blob:x', '', '  ', 'chrome-extension://abc/x.js', 'chrome://resources/x.js', 'file:///etc/x.js']) {
      expect(hostOf(value), value).toBeNull()
    }
  })
})

describe('findOutsideHosts', () => {
  it('passes a page whose assets are same-origin', () => {
    const html = page(
      '<link rel="stylesheet" crossorigin href="/assets/a.css"><link rel="modulepreload" href="/assets/b.js"><script type="module" src="/assets/index.js"></script>'
    )
    expect(findOutsideHosts(html)).toEqual([])
  })

  it.each(['preconnect', 'dns-prefetch', 'preload', 'modulepreload', 'stylesheet'])('flags an outside <link rel="%s">', (rel) => {
    const html = page(`<link rel="${rel}" href="https://pay.lenco.co/x">`)
    expect(findOutsideHosts(html)).toEqual([{ element: `<link rel="${rel}">`, host: 'pay.lenco.co' }])
  })

  it('flags an outside <script src>, quoted or not, and a protocol-relative one', () => {
    expect(findOutsideHosts(page('<script src="https://cdn.example.test/a.js"></script>'))).toHaveLength(1)
    expect(findOutsideHosts(page('<script src=//cdn.example.test/a.js></script>'))).toHaveLength(1)
  })

  it('flags an IP address outside loopback and accepts loopback literals', () => {
    expect(findOutsideHosts(page('<link rel="preconnect" href="http://10.1.2.3:8000">'))).toHaveLength(1)
    expect(findOutsideHosts(page('<link rel="preconnect" href="http://[2001:db8::1]:8000">'))).toHaveLength(1)
    expect(findOutsideHosts(page('<link rel="preconnect" href="http://127.0.0.1:8000"><link rel="preconnect" href="http://[::1]:8000">'))).toEqual([])
  })

  it('does not count Open Graph or Twitter meta tags, a canonical link or an icon', () => {
    const html = page(
      [
        '<meta property="og:url" content="https://apply.beanola.com">',
        '<meta property="og:image" content="https://apply.beanola.com/images/og-image.png">',
        '<meta name="twitter:image" content="https://apply.beanola.com/images/og-image.png">',
        '<link rel="canonical" href="https://apply.beanola.com/">',
        '<link rel="icon" href="https://apply.beanola.com/favicon.ico">',
      ].join('')
    )
    expect(findOutsideHosts(html)).toEqual([])
  })

  it('reads a multi-valued rel and names every offender', () => {
    const html = page('<link rel="preload prefetch" as="font" href="https://fonts.example.test/f.woff2"><script src="https://x.test/a.js"></script>')
    expect(findOutsideHosts(html).map((v) => v.host)).toEqual(['fonts.example.test', 'x.test'])
  })
})
