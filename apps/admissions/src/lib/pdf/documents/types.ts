/**
 * MIHAS-KATC PDF Document Types
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
  /** Optional signatory override — defaults to Dr Solomon Musonda. */
  signatoryName?: string
  /** Optional role override — defaults to "Managing Director". */
  signatoryRole?: string
  /** Optional postnominal ("MD", "PhD", etc) — defaults to "MD". */
  signatoryPostnominal?: string
  /**
   * Optional scanned-signature image path. When set, replaces the Pinyon
   * Script calligraphy rendering above the signature line.
   * Defaults to the canonical Dr Solomon Musonda scan.
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
 * `institution` field). For nursing-program acceptance letters, the
 * division line resolves to "… — School of Nursing" via
 * `deriveSignatoryDivision()` in AcceptanceLetter.
 */
export const DEFAULT_SIGNATORY = {
  name: 'Dr Solomon Musonda',
  role: 'Managing Director',
  postnominal: 'MD',
  signatureImage: '/images/signatures/solomon-musonda.png',
} as const
