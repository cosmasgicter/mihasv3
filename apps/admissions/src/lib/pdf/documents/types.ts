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
  signatoryRole?: string
}

/**
 * Signatory defaults — used when data fields are absent. Keeps the
 * signature block consistent across documents that share the director.
 *
 * Dr Solomon Musonda is the overall Director for both MIHAS and KATC —
 * not the "Director of Admissions". The institution shown in the
 * signature block is the one issuing the specific document (MIHAS or
 * KATC, resolved from the application's `institution` field).
 */
export const DEFAULT_SIGNATORY = {
  name: 'Dr Solomon Musonda',
  role: 'Director',
} as const
