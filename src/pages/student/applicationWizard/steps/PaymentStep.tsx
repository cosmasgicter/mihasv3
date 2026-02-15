import type { ChangeEvent } from 'react'
import { useEffect, useState } from 'react'

import { CreditCard } from 'lucide-react'
import type { UseFormReturn } from 'react-hook-form'

import { AnimatedInput } from '@/components/smoothui/animated-input'
import { FormSelect } from '@/components/ui/form-select'
import { AnimatedFileUpload } from '@/components/smoothui/animated-file-upload'
import { animateClasses, staggerChild } from '@/lib/animations'

import type { WizardFormData } from '../types'

interface PaymentStepProps {
  title: string
  form: UseFormReturn<WizardFormData>
  getPaymentTarget: () => Promise<string>
  handleProofOfPaymentUpload: (event: ChangeEvent<HTMLInputElement>) => void
  proofOfPaymentFile: File | null
  uploadProgress: Record<string, number>
  uploadedFiles: Record<string, boolean>
}

const PaymentStep = ({
  title,
  form,
  getPaymentTarget,
  handleProofOfPaymentUpload,
  proofOfPaymentFile,
  uploadProgress,
  uploadedFiles
}: PaymentStepProps) => {
  const { register, control, formState: { errors } } = form
  const [paymentTarget, setPaymentTarget] = useState('Loading...')

  useEffect(() => {
    getPaymentTarget()
      .then(setPaymentTarget)
      .catch((error) => {
        console.error('Failed to load payment target:', error)
        setPaymentTarget('Payment information unavailable')
      })
  }, [getPaymentTarget])

  // Payment method options
  const paymentMethodOptions = [
    { value: 'MTN Money', label: 'MTN Money' },
    { value: 'Airtel Money', label: 'Airtel Money (Cross Network)' },
    { value: 'Zamtel Money', label: 'Zamtel Money (Cross Network)' },
    { value: 'Ewallet', label: 'Ewallet' },
    { value: 'Bank To Cell', label: 'Bank To Cell' },
  ]

  return (
    <div
      key="step3"
      className={`bg-card rounded-lg shadow-lg p-6 border border-border ${animateClasses.fadeIn}`}
      data-testid="payment-step"
    >
      <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>

      <div className="space-y-6">
        <div
          className={`bg-gradient-to-r from-blue-50 to-green-50 border border-primary/30 rounded-lg p-4 ${animateClasses.scaleIn}`}
        >
          <div className="flex items-center mb-3">
            <CreditCard className="h-5 w-5 text-primary mr-2" />
            <h3 className="text-md font-medium text-primary-foreground">
              Payment Required - Multiple Options Available
            </h3>
          </div>
          <div className="space-y-2 text-sm">
            <p className="text-foreground font-semibold">
              <strong>Application Fee:</strong> K153.00
            </p>
            <p className="text-foreground font-semibold">
              <strong>Payment Target:</strong> {paymentTarget}
            </p>
            <div className="bg-card rounded-md p-3 mt-3">
              <p className="text-foreground font-medium mb-2">Available Payment Methods:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <div className="flex items-center text-foreground font-medium">
                  <span className="w-2 h-2 bg-yellow-500 rounded-full mr-2"></span>
                  MTN Money
                </div>
                <div className="flex items-center text-foreground font-medium">
                  <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                  Airtel Money (Cross Network)
                </div>
                <div className="flex items-center text-foreground font-medium">
                  <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                  Zamtel Money (Cross Network)
                </div>
                <div className="flex items-center text-foreground font-medium">
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                  Ewallet
                </div>
                <div className="flex items-center text-foreground font-medium">
                  <span className="w-2 h-2 bg-orange-500 rounded-full mr-2"></span>
                  Bank To Cell
                </div>
              </div>
            </div>
            <p className="text-foreground font-medium">✓ Secure payment processing</p>
            <p className="text-foreground font-medium">✓ Instant payment verification</p>
            <p className="text-foreground font-medium">✓ Automated receipt generation</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div style={staggerChild(0)}>
            <FormSelect
              name="payment_method"
              control={control}
              options={paymentMethodOptions}
              label="Payment Method"
              placeholder="Select payment method"
              error={errors.payment_method?.message}
            />
          </div>

          <div style={staggerChild(1)}>
            <AnimatedInput
              {...register('payer_name')}
              label="Payer Name"
              placeholder="Name of person who made payment"
              error={errors.payer_name?.message}
            />
          </div>

          <div style={staggerChild(2)}>
            <AnimatedInput
              {...register('payer_phone')}
              label="Payer Phone"
              placeholder="Phone number used for payment"
              error={errors.payer_phone?.message}
            />
          </div>

          <div style={staggerChild(3)}>
            <AnimatedInput
              type="number"
              {...register('amount', { valueAsNumber: true })}
              label="Amount Paid"
              defaultValue={153}
              min={153}
              error={errors.amount?.message}
            />
          </div>

          <div style={staggerChild(4)}>
            <AnimatedInput
              type="datetime-local"
              {...register('paid_at')}
              label="Payment Date & Time"
              error={errors.paid_at?.message}
            />
          </div>

          <div style={staggerChild(5)}>
            <AnimatedInput
              {...register('momo_ref')}
              label="Mobile Money Reference (Optional)"
              placeholder="Transaction reference number"
              helperText="Enter your transaction reference for faster verification"
              error={errors.momo_ref?.message}
            />
          </div>
        </div>

        <div>
          <AnimatedFileUpload
            label="Proof of Payment"
            required
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={handleProofOfPaymentUpload}
            file={proofOfPaymentFile}
            uploadProgress={uploadProgress.proof_of_payment}
            isUploaded={uploadedFiles.proof_of_payment}
            helperText="Upload a screenshot or PDF of your payment confirmation"
          />
        </div>
      </div>
    </div>
  )
}

export default PaymentStep
