import { describe, expect, it } from 'vitest'
import { sanitizeHtml } from '@/lib/sanitizer'

describe('sanitizeHtml', () => {
  it('strips dangerous tags like script', () => {
    expect(sanitizeHtml('<script>alert("xss")</script>')).toBe('')
  })

  it('strips event handler attributes', () => {
    const result = sanitizeHtml('<b onclick="alert(1)">text</b>')
    expect(result).toBe('<b>text</b>')
    expect(result).not.toContain('onclick')
  })

  it('preserves allowed tags', () => {
    const input = '<p>Hello <strong>world</strong> and <em>friends</em></p>'
    expect(sanitizeHtml(input)).toBe(input)
  })

  it('preserves allowed attributes on anchor tags', () => {
    const input = '<a href="https://example.com" target="_blank" rel="noopener">link</a>'
    expect(sanitizeHtml(input)).toBe(input)
  })

  it('strips disallowed tags like iframe, object, embed', () => {
    expect(sanitizeHtml('<iframe src="evil.com"></iframe>')).toBe('')
    expect(sanitizeHtml('<object data="evil.swf"></object>')).toBe('')
    expect(sanitizeHtml('<embed src="evil.swf">')).toBe('')
  })

  it('strips disallowed attributes like style and onerror', () => {
    const result = sanitizeHtml('<p style="color:red" onerror="alert(1)">text</p>')
    expect(result).toBe('<p>text</p>')
  })

  it('returns empty string for null/undefined/non-string input', () => {
    expect(sanitizeHtml('')).toBe('')
    expect(sanitizeHtml(null as any)).toBe('')
    expect(sanitizeHtml(undefined as any)).toBe('')
  })

  it('preserves list markup', () => {
    const input = '<ul><li>one</li><li>two</li></ul>'
    expect(sanitizeHtml(input)).toBe(input)
  })

  it('preserves plain text without modification', () => {
    expect(sanitizeHtml('Hello world')).toBe('Hello world')
  })
})
