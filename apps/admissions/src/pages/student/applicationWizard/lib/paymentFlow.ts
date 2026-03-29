import type { WizardFormData } from '../types'

export interface PaymentValidationContext {
  formData: WizardFormData
  proofOfPaymentFile: File | null
  setError: (value: string) => void
  showError: (title: string, message?: string) => void
}

export type PaymentUpdatePayload = {
  payment_method: string | null
  payer_name: string | null
  payer_phone: string | null
  amount: number | null
  paid_at: string | null
  momo_ref: string | null
  payment_status: string | null
  pop_url?: string | null
}

type PaymentFormSubset = Partial<
  Pick<
    WizardFormData,
    'payment_option' | 'payment_method' | 'payer_name' | 'payer_phone' | 'amount' | 'paid_at' | 'momo_ref'
  >
>

const DEFAULT_PAYMENT_OPTION = 'pay_now'
const MINIMUM_APPLICATION_FEE = 153

export function requiresImmediatePayment(formData: PaymentFormSubset): boolean {
  return (formData.payment_option ?? DEFAULT_PAYMENT_OPTION) !== 'pay_later'
}

export function validatePaymentStep({
  formData,
  proofOfPaymentFile,
  setError,
  showError
}: PaymentValidationContext): boolean {
  if (!requiresImmediatePayment(formData)) {
    return true
  }

  if (!formData.payment_method) {
    setError('')
    showError('Payment method is required')
    return false
  }

  if (!proofOfPaymentFile) {
    setError('')
    showError('Proof of payment must be uploaded before review')
    return false
  }

  if (typeof formData.amount === 'number' && Number.isFinite(formData.amount) && formData.amount < MINIMUM_APPLICATION_FEE) {
    setError('')
    showError(`Amount paid must be at least K${MINIMUM_APPLICATION_FEE}`)
    return false
  }

  return true
}

export function buildApplicationPaymentUpdate(
  formData: PaymentFormSubset,
  options: { clearProofOfPayment?: boolean; markPendingReview?: boolean } = {}
): PaymentUpdatePayload {
  if (!requiresImmediatePayment(formData)) {
    return {
      payment_method: null,
      payer_name: null,
      payer_phone: null,
      amount: null,
      paid_at: null,
      momo_ref: null,
      payment_status: null,
      ...(options.clearProofOfPayment ? { pop_url: null } : {})
    }
  }

  return {
    payment_method: formData.payment_method || 'MTN Money',
    payer_name: formData.payer_name || null,
    payer_phone: formData.payer_phone || null,
    amount: typeof formData.amount === 'number' && Number.isFinite(formData.amount)
      ? formData.amount
      : MINIMUM_APPLICATION_FEE,
    paid_at: formData.paid_at && formData.paid_at.trim()
      ? new Date(formData.paid_at).toISOString()
      : null,
    momo_ref: formData.momo_ref || null,
    payment_status: options.markPendingReview ? 'pending_review' : null
  }
}
