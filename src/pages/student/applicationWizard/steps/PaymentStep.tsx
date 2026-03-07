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
  const { register, control, setValue, watch, formState: { errors } } = form
  const [paymentTarget, setPaymentTarget] = useState('Loading...')
  const paymentOption = watch('payment_option') || 'pay_now'
  const isPayLater = paymentOption === 'pay_later'

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
      className={`bg-card rounded-lg shadow-lg p-4 sm:p-6 border border-border ${animateClasses.fadeIn}`}
      data-testid="payment-step"
    >
      <h2 className="text-lg font-semibold text-foreground mb-4">{title}</h2>

      <div className="space-y-6">
        <div className="grid gap-3 lg:grid-cols-2">
          <button
            type="button"
            onClick={() => setValue('payment_option', 'pay_now', { shouldDirty: true, shouldValidate: false })}
            className={`rounded-xl border p-4 text-left transition-colors ${
              !isPayLater
                ? 'border-primary bg-primary/5 shadow-sm'
                : 'border-border bg-card hover:border-primary/40'
            }`}
          >
            <p className="text-sm font-semibold text-foreground">Pay now</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload your proof of payment now and submit the application for payment review.
            </p>
          </button>
          <button
            type="button"
            onClick={() => setValue('payment_option', 'pay_later', { shouldDirty: true, shouldValidate: false })}
            className={`rounded-xl border p-4 text-left transition-colors ${
              isPayLater
                ? 'border-primary bg-primary/5 shadow-sm'
                : 'border-border bg-card hover:border-primary/40'
            }`}
          >
            <p className="text-sm font-semibold text-foreground">Pay later</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Submit the application now and complete payment later from the student dashboard payment section.
            </p>
          </button>
        </div>

        <div
          className={`bg-gradient-to-r from-blue-50 to-green-50 border border-primary/30 rounded-lg p-4 ${animateClasses.scaleIn}`}
        >
          <div className="flex items-start sm:items-center mb-3">
            <CreditCard className="h-5 w-5 text-primary mr-2" />
            <h3 className="text-sm sm:text-md font-medium text-primary-foreground leading-snug">
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
            <p className="text-foreground font-medium">
              {isPayLater ? '✓ Submit now and return later to complete payment' : '✓ Upload proof for admissions review'}
            </p>
            <p className="text-foreground font-medium">✓ Automated receipt generation after verification</p>
          </div>
        </div>

        {isPayLater ? (
          <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4">
            <h3 className="text-sm font-semibold text-foreground">Complete payment later from your dashboard</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Your application will be submitted without proof of payment. After submission, open
              the payment section on your dashboard to upload proof and send it for review.
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-foreground">Payment details</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Provide the transfer details exactly as they appear on the mobile money or bank confirmation.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
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
            </div>

            <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-foreground">Proof of payment upload</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Upload the receipt or screenshot that admissions will use to confirm your payment and submit for review.
                </p>
              </div>

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

              <p className="mt-3 text-sm font-medium text-foreground">Submit for review once your proof upload is complete.</p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default PaymentStep
