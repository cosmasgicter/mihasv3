/**
 * @/lib/pdf — Public barrel for the PDF document system.
 *
 * Each generator below dynamically imports its document implementation
 * the first time it is called. This keeps the synchronous part of this
 * module trivially small (just types + thin wrappers) so importing
 * `@/lib/pdf` from a hook does NOT pull every document component into
 * the same chunk as the caller.
 *
 * Why per-document dynamic imports
 * --------------------------------
 * Before May 2026 this barrel did:
 *   export { generateApplicationSlip } from './documents/ApplicationSlip'
 *   export { generatePaymentReceipt }   from './documents/PaymentReceipt'
 *   export { generateAcceptanceLetter } from './documents/AcceptanceLetter'
 *
 * Vite saw three static imports and merged ApplicationSlip + PaymentReceipt
 * + AcceptanceLetter (plus the shared theme/components) into a single
 * chunk roughly 1.4 MB raw / 474 KB gzipped. Every caller paid for all
 * three documents even when they only needed the receipt.
 *
 * Now, each `generate*` function is a tiny wrapper that dynamically
 * imports just its document. Vite emits three separate chunks, only the
 * one corresponding to the document the user actually requested is
 * downloaded, and the barrel itself is a few hundred bytes.
 *
 * The public signatures are unchanged: every caller already awaits the
 * returned Promise<Blob>.
 *
 * Usage:
 *   import { generatePaymentReceipt } from '@/lib/pdf'
 *   const blob = await generatePaymentReceipt(data)
 */

import type {
  AcceptanceLetterData,
  ApplicationSlipData,
  PaymentReceiptData,
} from './documents/types'

export type {
  AcceptanceCondition,
  AcceptanceLetterData,
  ApplicationSlipData,
  PaymentReceiptData,
  PublicApplicationStatus,
} from './documents/types'

export { DEFAULT_SIGNATORY } from './documents/types'

/**
 * Generate the application slip PDF. The document component and its
 * @react-pdf/renderer dependencies are loaded on first call only.
 */
export async function generateApplicationSlip(
  data: ApplicationSlipData,
): Promise<Blob> {
  const m = await import('./documents/ApplicationSlip')
  return m.generateApplicationSlip(data)
}

/**
 * Generate a payment receipt PDF. The document component and its
 * @react-pdf/renderer dependencies are loaded on first call only.
 */
export async function generatePaymentReceipt(
  data: PaymentReceiptData,
): Promise<Blob> {
  const m = await import('./documents/PaymentReceipt')
  return m.generatePaymentReceipt(data)
}

/**
 * Generate an acceptance (or conditional acceptance) letter PDF. The
 * document component and its @react-pdf/renderer dependencies are loaded
 * on first call only.
 */
export async function generateAcceptanceLetter(
  data: AcceptanceLetterData,
): Promise<Blob> {
  const m = await import('./documents/AcceptanceLetter')
  return m.generateAcceptanceLetter(data)
}
