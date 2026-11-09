/**
 * The document opener's query grammar (SJR task 3.17, R5-a): every link
 * `documentOpenHref` builds parses back to the same target, and every other shape
 * is refused before a request is sent.
 */
import { describe, expect, it } from 'vitest'

import {
  documentOpenHref,
  documentOpenHrefForRow,
  isNavigableUrl,
  parseDocumentOpenSearch,
} from '@/lib/documentOpen'

const ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const APP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function parse(href: string) {
  return parseDocumentOpenSearch(new URL(href, 'https://app.test').searchParams)
}

describe('documentOpenHref and parseDocumentOpenSearch', () => {
  it('round-trips an uploaded document', () => {
    const target = { kind: 'document', documentId: ID } as const
    expect(documentOpenHref(target)).toBe(`/student/documents/open?doc=${ID}`)
    expect(parse(documentOpenHref(target))).toEqual(target)
  })

  it('round-trips a legacy synthetic row', () => {
    const target = { kind: 'legacy', documentType: 'extra_kyc', applicationId: APP } as const
    expect(parse(documentOpenHref(target))).toEqual(target)
    expect(documentOpenHrefForRow({ id: `legacy:extra_kyc:${APP}` })).toBe(
      `/student/documents/open?doc=legacy:extra_kyc:${APP}`,
    )
  })

  it('round-trips an official document', () => {
    const target = { kind: 'official', applicationId: APP, documentType: 'payment_receipt' } as const
    expect(documentOpenHref(target)).toBe(`/student/documents/open?app=${APP}&type=payment_receipt`)
    expect(parse(documentOpenHref(target))).toEqual(target)
  })

  it.each([
    '?',
    '?doc=not-a-uuid',
    `?doc=legacy:other:${APP}`,
    `?doc=legacy:result_slip:not-a-uuid`,
    `?doc=${ID}&app=${APP}`,
    `?app=${APP}`,
    `?app=${APP}&type=finance_receipt`,
    `?app=not-a-uuid&type=application_slip`,
  ])('refuses %s', (search) => {
    expect(parseDocumentOpenSearch(new URLSearchParams(search))).toBeNull()
  })
})

describe('isNavigableUrl', () => {
  it('accepts http(s) and refuses anything that could run code', () => {
    expect(isNavigableUrl('https://files.test/a.pdf?X-Amz-Signature=x')).toBe(true)
    expect(isNavigableUrl('http://localhost:9000/a.pdf')).toBe(true)
    expect(isNavigableUrl('javascript:alert(1)')).toBe(false)
    expect(isNavigableUrl('data:text/html,hi')).toBe(false)
    expect(isNavigableUrl('')).toBe(false)
    expect(isNavigableUrl(undefined)).toBe(false)
  })
})
