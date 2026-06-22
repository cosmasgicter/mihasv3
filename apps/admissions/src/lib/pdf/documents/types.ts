/**
 * Beanola tenant PDF document types
 *
 * Input data shapes consumed by the three document components.
 *
 * For backward compatibility:
 *   - ApplicationSlipData is re-exported from the existing
 *     `applicationSlip.types.ts` file — unchanged.
 *   - PaymentReceiptData matches the shape consumed by the old
 *     `generatePaymentReceipt(data: ReceiptData)` function.
 *   - AcceptanceLetterData matches the old `AcceptanceLetterData`.
 */

// Default scanned signature, imported as a Vite URL asset (`?url`) so it is
// emitted as a hashed, immutable-cached file under `/assets/` at build time
// rather than being publicly fetchable from `public/images/signatures/`
// (perf-hardening R10.2). @react-pdf fetches the emitted same-origin URL at
// render time via the <Image src={...}> component.
import DIRECTOR_SIGNATURE_URL from '../assets/signatures/director-signature.png?url'

// Re-export the existing application slip type — it has the correct shape
// already and is used by services + tests.
export type { ApplicationSlipData, PublicApplicationStatus } from '../../applicationSlip.types'

/**
 * Data for payment receipt PDFs.
 *
 * All amounts are in the currency indicated by `currency` (defaults to ZMW).
 */
export interface PaymentReceiptData {
  receiptNumber: string
  applicationNumber: string
  studentName: string
  email: string
  phone: string
  program: string
  institution: string
  amount: number
  currency?: 'ZMW' | 'USD'
  paymentMethod: string
  paymentReference?: string
  paymentDate: string
  verifiedDate: string
  verifiedBy: string
}

/**
 * A single condition attached to a conditional acceptance.
 */
export interface AcceptanceCondition {
  description: string
  deadline?: string
}

/**
 * Data for acceptance letters — both unconditional and conditional.
 *
 * `conditional=true` switches to the conditional variant which surfaces the
 * `conditions` list in a dedicated section and adds a "subject to conditions
 * being met" paragraph. Unconditional omits the conditions section entirely.
 */
export interface AcceptanceLetterData {
  applicationNumber: string
  studentName: string
  program: string
  institution: string
  intake: string
  approvedDate: string
  startDate?: string
  conditional?: boolean
  conditions?: AcceptanceCondition[]
  /**
   * Student number assigned on full acceptance/enrolment, e.g. "MIHAS/26/00001".
   * When present it is shown in the letter's metadata strip. Optional — early
   * (pre-enrolment) acceptance letters may not have one yet.
   */
  studentNumber?: string
  /**
   * Optional applicant postal address, shown in the Name/Address/Date block
   * to match the official letter. Falls back to a blank dotted line.
   */
  studentAddress?: string
  /**
   * The K1,000 (default) non-refundable commitment fee, in ZMW, that secures
   * the student's place and is treated as part-payment toward tuition. Paid
   * into the school's tuition account (see the resolved profile).
   */
  commitmentFee?: number
  /** Optional signatory override — defaults to Dr Solomon Musonda. */
  signatoryName?: string
  /** Optional role override — defaults to "Managing Director". */
  signatoryRole?: string
  /** Optional postnominal ("MD", "PhD", etc) — defaults to "MD". */
  signatoryPostnominal?: string
  /**
   * Optional scanned-signature image path. When set, replaces the Pinyon
   * Script calligraphy rendering above the signature line.
   * Defaults to the canonical Dr Solomon Musonda scan (bundled `?url` asset).
   */
  signatureImage?: string
  /**
   * Optional division/school line that replaces or augments the institution
   * line under the typeset signatory name. For example, a nursing acceptance
   * at MIHAS should read "Mukuba Institute of Health and Applied Sciences
   * — School of Nursing" beneath the signatory.
   *
   * When omitted, the institution alone is shown.
   */
  signatoryDivision?: string
}

/**
 * Signatory defaults — used when data fields are absent. Keeps the
 * signature block consistent across documents that share the director.
 *
 * Dr Solomon Musonda is the Managing Director for both MIHAS and KATC.
 * "MD" (Doctor of Medicine) is the postnominal as it appears on the
 * official MIHAS application form and correspondence.
 *
 * The institution shown in the signature block is the one issuing the
 * specific document (MIHAS or KATC, resolved from the application's
 * `institution` field). The official acceptance letters close with
 * "On behalf of {institution}" above "Dr Solomon Musonda, MD /
 * Managing Director" — no school/division line — so the letter renders
 * the institution alone. The optional `signatoryDivision` field on
 * AcceptanceLetterData is retained for backward compatibility but is not
 * rendered by the acceptance letter.
 */
export const DEFAULT_SIGNATORY = {
  name: 'Dr Solomon Musonda',
  role: 'Managing Director',
  postnominal: 'MD',
  signatureImage: DIRECTOR_SIGNATURE_URL,
} as const

/**
 * Intrinsic pixel dimensions of the default signature scan
 * (`director-signature.png`) after cropping to the ink and upscaling:
 * 472×208 (~2.27:1). The aspect ratio must be preserved when rendering so
 * the signature is not stretched. SignatureBlock uses these to size the image.
 */
export const DEFAULT_SIGNATURE_DIMENSIONS = {
  width: 472,
  height: 208,
} as const
