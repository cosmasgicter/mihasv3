/**
 * Where a student is sent when they need a human — resolved from tenant context.
 *
 * Admissions-v2 task 8.3, finding **STU-24** ("student pages and tracker bypass
 * tenant context with hardcoded Beanola SEO, contact, and help values").
 *
 * The rule from `.kiro/steering/enterprise-tenancy.md` is that tenant-visible
 * support data comes from the resolved host context, and a **missing** tenant
 * asset falls back to the neutral platform brand — never to a legacy example
 * tenant, and never to an address hardcoded in a component.
 *
 * So there are exactly two outcomes, and no third:
 *
 * | tenant context                      | outcome                                  |
 * |-------------------------------------|------------------------------------------|
 * | resolved school with a contact email | `mailto:` that school's admissions inbox |
 * | shared portal, or no configured email| the in-app contact route                 |
 *
 * The neutral outcome is a real path forward (a route that exists and is staffed
 * by whoever the platform routes it to), not a dead end and not an invented
 * address. That distinction is the whole point of the finding: the payment page
 * used to print `admissions@beanola.com` and an office phone number into every
 * tenant's UI regardless of who the tenant was.
 *
 * Requirements: R12.6 (recovery action, no stale copy), R13.2, R2.6.
 */

/** The in-app contact route. Registered in the public route registry. */
export const PLATFORM_CONTACT_ROUTE = '/contact'

export type TenantSupportKind = 'tenant_email' | 'platform_contact_page'

/**
 * What the student needs a human for. Only the one sentence naming what the
 * recipient can do changes; the resolution rule above does not.
 *
 * Added by admissions-v2 task 10.4 (STU-18) so the official-document failure
 * state can reuse this resolver rather than fork it. The pre-10.4 document error
 * printed the tenant's own setup checklist at the student — "Configure the
 * document profile, template, logo, and signature" — which is work only a school
 * operator can do, and naming it leaks the school's configuration state.
 */
export type TenantSupportPurpose = 'payment' | 'official_document'

const PURPOSE_DESCRIPTIONS: Record<
  TenantSupportPurpose,
  { tenant: (school: string) => string; platform: string }
> = {
  payment: {
    tenant: (school) =>
      school
        ? `${school} admissions can look up your payment and confirm what they have received.`
        : 'Admissions can look up your payment and confirm what they have received.',
    platform: 'Send us the details of the payment and we will trace it with the provider.',
  },
  official_document: {
    tenant: (school) =>
      school
        ? `${school} admissions can issue this document for you.`
        : 'Admissions can issue this document for you.',
    platform: 'Tell us which document you need and we will arrange it for you.',
  },
}

export interface TenantSupportContact {
  kind: TenantSupportKind
  /** The tenant's support address, or `null` on the neutral platform fallback. */
  email: string | null
  /** Where the affordance points — a `mailto:` URL or an in-app route. */
  href: string
  /** Button/link label. */
  label: string
  /** One sentence naming who the student is about to contact. */
  description: string
  /** True when `href` leaves the app (so the caller can render a real anchor). */
  isExternal: boolean
}

export interface TenantSupportInput {
  /**
   * Support/admissions address from resolved tenant context
   * (`usePortalBrand().supportEmail`). Null on the shared portal.
   */
  supportEmail?: string | null
  /** Runtime brand name, already Beanola-defaulted by `usePortalBrand`. */
  brandName?: string | null
  /** Subject line for the `mailto:`, when one is built. */
  subject?: string
  /**
   * Body lines for the `mailto:`. Callers pass non-PII context only (an
   * application number is fine; a name, phone, or NRC is not).
   */
  bodyLines?: string[]
  /** What the student needs help with. Defaults to the payment wording. */
  purpose?: TenantSupportPurpose
}

/**
 * A conservative address check. This is not validation for storage — the backend
 * owns that — it only decides whether a value from tenant configuration is
 * shaped like something a `mailto:` can be built from. Anything else falls back
 * to the neutral route rather than rendering a broken link.
 */
function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(value)
}

/**
 * Resolve the support affordance for a student surface.
 *
 * Pure: no window, no fetch, no clock. Callers pass what the tenant context
 * resolved and render what comes back.
 */
export function resolveTenantSupportContact({
  supportEmail,
  brandName,
  subject,
  bodyLines,
  purpose = 'payment',
}: TenantSupportInput = {}): TenantSupportContact {
  const address = (supportEmail ?? '').trim()
  const school = (brandName ?? '').trim()
  const copy = PURPOSE_DESCRIPTIONS[purpose] ?? PURPOSE_DESCRIPTIONS.payment

  if (address && isPlausibleEmail(address)) {
    const params: string[] = []
    if (subject) params.push(`subject=${encodeURIComponent(subject)}`)
    if (bodyLines && bodyLines.length > 0) {
      params.push(`body=${encodeURIComponent(bodyLines.join('\n'))}`)
    }
    const query = params.length > 0 ? `?${params.join('&')}` : ''
    return {
      kind: 'tenant_email',
      email: address,
      href: `mailto:${address}${query}`,
      label: 'Email admissions',
      description: copy.tenant(school),
      isExternal: true,
    }
  }

  // Neutral platform fallback. No address is printed because none was
  // configured — the student is routed to the contact page instead of being
  // shown a school's inbox that may not be theirs (STU-24).
  return {
    kind: 'platform_contact_page',
    email: null,
    href: PLATFORM_CONTACT_ROUTE,
    label: 'Contact support',
    description: copy.platform,
    isExternal: false,
  }
}
