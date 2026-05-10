/**
 * @/lib/pdf — Public barrel for the PDF document system.
 *
 * This is the single module all callers should import from:
 *
 *   import { generateApplicationSlip, generatePaymentReceipt, generateAcceptanceLetter } from '@/lib/pdf'
 *
 * Document component implementations live in `./documents/*`. They are
 * exported via the `generate*` wrapper functions below so callers never see
 * the React element tree — only the final Blob.
 *
 * Types are exported for consumers that need to type fixtures or hooks.
 *
 * Generator functions are wired in subsequent tasks:
 *   Task 5 → generateApplicationSlip
 *   Task 6 → generatePaymentReceipt
 *   Task 7 → generateAcceptanceLetter
 */

export type {
  ApplicationSlipData,
  PaymentReceiptData,
  AcceptanceLetterData,
  AcceptanceCondition,
  PublicApplicationStatus,
} from './documents/types'

export { DEFAULT_SIGNATORY } from './documents/types'

export { generateApplicationSlip } from './documents/ApplicationSlip'
export { generatePaymentReceipt } from './documents/PaymentReceipt'
export { generateAcceptanceLetter } from './documents/AcceptanceLetter'
