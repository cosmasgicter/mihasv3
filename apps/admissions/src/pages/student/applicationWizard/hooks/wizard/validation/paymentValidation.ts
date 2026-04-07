/**
 * Payment validation — Lenco widget handles payment now.
 * The payment step is valid when a successful payment exists (checked by PaymentStep component).
 * This module is kept as a stub for backward compatibility with imports.
 */

export interface PaymentValidationContext {
  formData: Record<string, unknown>
  proofOfPaymentFile?: File | null
  setError: (msg: string | null) => void
  showError: (msg: string) => void
}

/**
 * @deprecated Payment is now handled by the Lenco widget. This always returns true.
 */
export function validatePaymentStep(_ctx: PaymentValidationContext): boolean {
  return true
}
