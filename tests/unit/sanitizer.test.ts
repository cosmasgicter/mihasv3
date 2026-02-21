import { describe, expect, it } from 'vitest'
import { sanitizeHtml } from '@/lib/sanitizer'

describe('sanitizeHtml', () => {
  it('escapes html-significant characters', () => {
    expect(sanitizeHtml('<b onclick="x">Tom & Jerry</b>')).toBe(
      '&lt;b onclick=&quot;x&quot;&gt;Tom &amp; Jerry&lt;/b&gt;'
    )
  })

  it('removes dangerous punctuation and control characters via escaping rules', () => {
    expect(sanitizeHtml("'`\\")).toBe('&#x27;&#x60;&#x5C;')
  })

  it('truncates output to 10,000 characters', () => {
    expect(sanitizeHtml('a'.repeat(12000))).toHaveLength(10000)
  })
})
