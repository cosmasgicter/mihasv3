/**
 * Support contact resolves from tenant context, never from hardcoded copy.
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` task 8.3.
 * Requirements: R12.6 (recovery action), R13.2, R2.6 (neutral fallback).
 * Findings:     **STU-24** — student pages printed `admissions@beanola.com` and a
 *               platform office phone number into every tenant's UI.
 *
 * The two outcomes, and the absence of a third, are the whole contract: a resolved
 * school gets its own inbox; anything else gets the in-app contact route. No branch
 * invents an address, and none falls back to MIHAS or KATC.
 */
import { describe, expect, it } from 'vitest'

import {
  PLATFORM_CONTACT_ROUTE,
  resolveTenantSupportContact,
} from '@/lib/tenantSupport'

describe('resolveTenantSupportContact — resolved tenant', () => {
  it('uses the tenant address from context', () => {
    const contact = resolveTenantSupportContact({
      supportEmail: 'admissions@example-school.edu.zm',
      brandName: 'Example School',
    })

    expect(contact.kind).toBe('tenant_email')
    expect(contact.email).toBe('admissions@example-school.edu.zm')
    expect(contact.href).toBe('mailto:admissions@example-school.edu.zm')
    expect(contact.isExternal).toBe(true)
    expect(contact.description).toContain('Example School')
  })

  it('encodes a subject and body without inventing either', () => {
    const contact = resolveTenantSupportContact({
      supportEmail: 'help@example-school.edu.zm',
      subject: 'Help with my application fee payment',
      bodyLines: ['Hello Admissions team,', '', 'My payment did not complete.'],
    })

    expect(contact.href).toContain('subject=Help%20with%20my%20application%20fee%20payment')
    expect(contact.href).toContain('body=')
    // A caller that passes no subject/body gets a bare mailto, not a template.
    expect(resolveTenantSupportContact({ supportEmail: 'help@example-school.edu.zm' }).href).toBe(
      'mailto:help@example-school.edu.zm',
    )
  })

  it('trims whitespace from a configured address', () => {
    const contact = resolveTenantSupportContact({ supportEmail: '  desk@school.edu.zm \n' })
    expect(contact.email).toBe('desk@school.edu.zm')
  })
})

describe('resolveTenantSupportContact — neutral platform fallback', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['empty', ''],
    ['whitespace', '   '],
    ['not an address', 'admissions'],
    ['no domain dot', 'admissions@localhost'],
  ])('routes to the contact page when the tenant email is %s', (_label, supportEmail) => {
    const contact = resolveTenantSupportContact({ supportEmail })

    expect(contact.kind).toBe('platform_contact_page')
    expect(contact.href).toBe(PLATFORM_CONTACT_ROUTE)
    expect(contact.isExternal).toBe(false)
    // The neutral outcome prints no address at all — that was the finding.
    expect(contact.email).toBeNull()
  })

  it('never emits a hardcoded platform or legacy-school address', () => {
    const rendered = JSON.stringify(
      [
        resolveTenantSupportContact(),
        resolveTenantSupportContact({ supportEmail: null, brandName: 'Beanola Admissions' }),
      ],
    ).toLowerCase()

    for (const banned of ['admissions@beanola.com', 'support@beanola.com', 'mihas', 'katc', '+260']) {
      expect(rendered).not.toContain(banned)
    }
  })

  it('still offers a real path forward', () => {
    const contact = resolveTenantSupportContact()
    expect(contact.href.length).toBeGreaterThan(0)
    expect(contact.label.trim().length).toBeGreaterThan(0)
    expect(contact.description.trim().length).toBeGreaterThan(0)
  })
})
