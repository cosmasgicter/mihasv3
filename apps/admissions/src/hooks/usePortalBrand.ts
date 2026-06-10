import { catalogData } from '@/data/catalog'

/**
 * Runtime portal brand selector (R3.1, R3.2, R3.6, R10.6).
 *
 * Thin, memo-free wrapper over `catalogData.useContext()` (the React Query read
 * of `/api/v1/catalog/context/`) that centralises the brand + offering-filter
 * derivation so student-facing surfaces never hard-code a school name and never
 * re-implement the Beanola fallback inline.
 *
 * - On a white-label host, `brandName` is the institution's runtime brand and
 *   `offeringInstitutionId` restricts catalog/offering choices to that school.
 * - On the shared Beanola portal (or any fallback), `brandName` is the Beanola
 *   brand and `offeringInstitutionId` is `undefined` (no single-school
 *   favouritism / no pre-filter).
 *
 * The Beanola fallback is preserved: while the context query is loading or has
 * failed, `brandName` resolves to "Beanola Admissions" and the portal is treated
 * as shared.
 */
const DEFAULT_BRAND_NAME = 'Beanola Admissions'

export interface PortalBrand {
  /** Visible brand name. Beanola on shared/fallback; institution brand on white-label. */
  brandName: string
  /** Brand owner, when supplied by runtime context (defaults to Beanola Technologies). */
  brandOwner: string
  /** True only when the runtime host resolved to an active white-label institution. */
  isWhiteLabel: boolean
  /** Institution id to filter offerings by on white-label; `undefined` on the shared portal. */
  offeringInstitutionId: string | undefined
  /** Admissions/support email from runtime context, if any. */
  supportEmail: string | null
  /** True while the context query is still resolving. */
  isLoading: boolean
}

export function usePortalBrand(): PortalBrand {
  const { data: context, isLoading } = catalogData.useContext()

  const isWhiteLabel = context?.portal_type === 'white_label'

  return {
    brandName: context?.brand?.name || DEFAULT_BRAND_NAME,
    brandOwner: context?.brand?.owner || 'Beanola Technologies',
    isWhiteLabel: Boolean(isWhiteLabel),
    offeringInstitutionId: isWhiteLabel ? context?.institution_id || undefined : undefined,
    supportEmail: context?.brand?.admissions_email || context?.brand?.support_email || null,
    isLoading,
  }
}

export { DEFAULT_BRAND_NAME }
