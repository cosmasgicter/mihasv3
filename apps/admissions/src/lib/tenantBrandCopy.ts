/**
 * The one place a **visible brand name** enters student-facing copy.
 *
 * Admissions-v2 task 11.5, findings **STU-24** ("student pages and tracker
 * bypass tenant context with hardcoded Beanola SEO, contact, and help values")
 * and **TEN-09** (product identity documents still described an example tenant as
 * the platform, although Beanola owns it and schools are tenants);
 * requirements **R2.2** (platform identity is Beanola; a school appears only as
 * resolved tenant data) and **R2.3** (no trusted context → fail closed to the
 * neutral Beanola context, never guess an institution).
 *
 * The defect this closes is small and repeated: nine student and tracker
 * surfaces wrote the platform brand into a `<Seo title>` as a **literal**
 * (`'Activity History | Beanola Admissions'`). On a resolved tenant host that is
 * wrong in the browser tab, in the share card, and in the bookmark — the student
 * applied to a school, and the tab said the platform's name. Writing the tenant
 * name as a literal instead would be the *opposite* error and forbidden by R2.2.
 *
 * So the brand is neither literal: it is whatever
 * `usePortalBrand()` resolved from `GET /api/v1/catalog/context/`
 * (`InstitutionContextService.resolve`), which is already Beanola-defaulted while
 * the context query is loading, on the shared portal, and on any resolution
 * failure. That default **is** R2.3's fail-closed neutral context, so this helper
 * needs no fallback logic of its own beyond an empty-value guard.
 *
 * Pure: no hook, no window, no fetch. The hook stays at the call site so the
 * resolution path remains visible in the page that renders the title.
 */

/**
 * `"<page> | <brand>"`, or just `"<page>"` when no brand resolved yet.
 *
 * The separator and order match the convention the rest of the app already uses,
 * so this changes *where the brand comes from* and nothing about how a title
 * reads.
 *
 * @param pageTitle What this page is. Never a brand.
 * @param brandName The resolved brand from `usePortalBrand().brandName`.
 */
export function brandedPageTitle(pageTitle: string, brandName?: string | null): string {
  const page = (pageTitle ?? '').trim()
  const brand = (brandName ?? '').trim()
  if (!page) return brand
  if (!brand) return page
  // Already branded (a caller that passed the whole string): leave it alone
  // rather than appending the brand twice.
  if (page.endsWith(`| ${brand}`)) return page
  return `${page} | ${brand}`
}
