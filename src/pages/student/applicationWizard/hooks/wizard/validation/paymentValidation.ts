import type { WizardFormData } from '../../../types'

export interface PaymentValidationContext {
  formData: WizardFormData
  proofOfPaymentFile: File | null
  setError: (value: string) => void
  showError: (title: string, message?: string) => void
}

export function validatePaymentStep({
  formData,
  proofOfPaymentFile,
  setError,
  showError
}: PaymentValidationContext): boolean {
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

  if (typeof formData.amount === 'number' && Number.isFinite(formData.amount) && formData.amount < 153) {
    setError('')
    showError('Amount paid must be at least K153')
    return false
  }

  return true
}
