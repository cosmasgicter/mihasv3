import { useEffect, useState } from 'react'

import { CreditCard, Radio } from 'lucide-react'
import type { UseFormReturn } from 'react-hook-form'

import { AnimatedInput } from '@/components/smoothui/animated-input'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert'
import { FormSelect } from '@/components/ui/form-select'
import { FileUpload } from '@/components/ui/FileUpload'
import { SectionCard } from '@/components/ui/SectionCard'
import { animateClasses, staggerChild } from '@/lib/animations'
import { cn } from '@/lib/utils'

import type { WizardFormData } from '../types'

interface PaymentStepProps {
  title: string
  form: UseFormReturn<WizardFormData>
  getPaymentTarget: () => Promise<string>
  handleProofOfPaymentUpload: (file: File | null) => void
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
  const [paymentTarget, setPaymentTarget] = useState<string | null>(null)
  const [paymentTargetStatus, setPaymentTargetStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const paymentOption = watch('payment_option') || 'pay_now'
  const isPayLater = paymentOption === 'pay_later'

  useEffect(() => {
    let isActive = true

    setPaymentTargetStatus('loading')
    getPaymentTarget()
      .then((target) => {
        if (!isActive) return
        setPaymentTarget(target)
        setPaymentTargetStatus('ready')
      })
      .catch(() => {
        if (!isActive) return
        setPaymentTarget(null)
        setPaymentTargetStatus('unavailable')
      })

    return () => {
      isActive = false
    }
  }, [getPaymentTarget])

  // Payment method options
  const paymentMethodOptions = [
    { value: 'MTN Money', label: 'MTN Money' },
    { value: 'Airtel Money', label: 'Airtel Money (Cross Network)' },
    { value: 'Zamtel Money', label: 'Zamtel Money (Cross Network)' },
    { value: 'Ewallet', label: 'Ewallet' },
    { value: 'Bank To Cell', label: 'Bank To Cell' },
  ]

  const paymentChoices = [
    {
      value: 'pay_now',
      title: 'Pay now',
      description: 'Upload your proof of payment now and send the application to admissions for payment review.',
    },
    {
      value: 'pay_later',
      title: 'Pay later',
      description: 'Submit the application first and complete payment later from the dashboard payment section.',
    },
  ] as const

  return (
    <SectionCard
      title={title}
      description="Choose how you want to complete payment. The application can continue even if payment verification is delayed."
      icon={<CreditCard className="h-5 w-5" />}
      className={animateClasses.fadeIn}
      contentClassName="space-y-6"
      data-testid="payment-step"
    >
      <fieldset className="space-y-3">
        <legend id="payment-option-legend" className="text-sm font-semibold text-foreground">
          Choose when you want to complete payment
        </legend>
        <p className="text-sm text-muted-foreground" id="payment-option-hint">
          Pick the option that matches your situation. You can still submit without blocking on payment verification.
        </p>
        <div
          role="radiogroup"
          aria-labelledby="payment-option-legend"
          aria-describedby="payment-option-hint"
          className="grid gap-3 md:grid-cols-2"
        >
          {paymentChoices.map(choice => {
            const checked = paymentOption === choice.value

            return (
              <label
                key={choice.value}
                className={cn(
                  'block cursor-pointer rounded-2xl border bg-card p-4 transition-all',
                  'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
                  checked ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:border-primary/40'
                )}
              >
                <input
                  type="radio"
                  name="payment_option"
                  value={choice.value}
                  checked={checked}
                  onChange={() => setValue('payment_option', choice.value, { shouldDirty: true, shouldValidate: false })}
                  className="sr-only"
                />
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      'mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border',
                      checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-transparent'
                    )}
                    aria-hidden="true"
                  >
                    <Radio className="h-3 w-3" />
                  </span>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">{choice.title}</p>
                    <p className="text-sm text-muted-foreground">{choice.description}</p>
                  </div>
                </div>
              </label>
            )
          })}
        </div>
      </fieldset>

      <Alert variant="info" className={animateClasses.scaleIn}>
        <AlertTitle className="text-foreground">Application fee and payment instructions</AlertTitle>
        <AlertDescription className="space-y-4 text-muted-foreground">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border/70 bg-card px-3 py-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Application fee</dt>
              <dd className="mt-1 text-base font-semibold text-foreground">K153.00</dd>
            </div>
            <div className="rounded-xl border border-border/70 bg-card px-3 py-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment target</dt>
              <dd className="mt-1 text-base font-semibold text-foreground">
                {paymentTargetStatus === 'loading' && 'Checking payment details...'}
                {paymentTargetStatus === 'ready' && paymentTarget}
                {paymentTargetStatus === 'unavailable' && 'Temporarily unavailable'}
              </dd>
            </div>
          </dl>

          <div className="rounded-xl border border-border/70 bg-card px-3 py-3">
            <p className="text-sm font-semibold text-foreground">Available payment methods</p>
            <ul className="mt-2 grid gap-2 text-sm text-foreground sm:grid-cols-2">
              {paymentMethodOptions.map(option => (
                <li key={option.value} className="rounded-lg bg-muted/60 px-3 py-2">
                  {option.label}
                </li>
              ))}
            </ul>
          </div>

          <ul className="space-y-2 text-sm text-foreground">
            <li>Secure payment verification remains non-blocking while you complete the application.</li>
            <li>{isPayLater ? 'You can submit now and return later to upload payment proof from the dashboard.' : 'Upload proof of payment so admissions can review it alongside your application.'}</li>
            <li>Receipts are generated after payment verification is completed.</li>
          </ul>

          {paymentTargetStatus === 'unavailable' && (
            <p className="text-sm font-medium text-foreground">
              Payment contact details are temporarily unavailable. You can still continue and choose <span className="font-semibold">Pay later</span> if needed.
            </p>
          )}
        </AlertDescription>
      </Alert>

      {isPayLater ? (
        <Alert variant="warning">
          <AlertTitle className="text-foreground">Complete payment later from your dashboard</AlertTitle>
          <AlertDescription className="text-muted-foreground">
            Your application will be submitted without proof of payment. After submission, open the dashboard payment section to upload proof and send it for review.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <SectionCard
            title="Payment details"
            description="Provide the transfer details exactly as they appear on the mobile money or bank confirmation."
            padding="sm"
            className="shadow-none"
          >
            <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
              <div style={staggerChild(0)}>
                <FormSelect
                  name="payment_method"
                  control={control}
                  options={paymentMethodOptions}
                  label="Payment method"
                  placeholder="Select payment method"
                  error={errors.payment_method?.message}
                />
              </div>

              <div style={staggerChild(1)}>
                <AnimatedInput
                  {...register('payer_name')}
                  label="Payer name"
                  placeholder="Name of person who made payment"
                  error={errors.payer_name?.message}
                />
              </div>

              <div style={staggerChild(2)}>
                <AnimatedInput
                  {...register('payer_phone')}
                  label="Payer phone"
                  placeholder="Phone number used for payment"
                  error={errors.payer_phone?.message}
                />
              </div>

              <div style={staggerChild(3)}>
                <AnimatedInput
                  type="number"
                  {...register('amount', { valueAsNumber: true })}
                  label="Amount paid"
                  defaultValue={153}
                  min={153}
                  error={errors.amount?.message}
                />
              </div>

              <div style={staggerChild(4)}>
                <AnimatedInput
                  type="datetime-local"
                  {...register('paid_at')}
                  label="Payment date and time"
                  error={errors.paid_at?.message}
                />
              </div>

              <div style={staggerChild(5)}>
                <AnimatedInput
                  {...register('momo_ref')}
                  label="Mobile money reference (optional)"
                  placeholder="Transaction reference number"
                  helperText="Enter your transaction reference for faster verification"
                  error={errors.momo_ref?.message}
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Proof of payment upload"
            description="Upload the receipt or screenshot that admissions will use to confirm your payment."
            padding="sm"
            className="shadow-none"
          >
            <FileUpload
              label="Proof of payment"
              accept=".pdf,.jpg,.jpeg,.png"
              maxSize={10 * 1024 * 1024}
              onChange={(files) => handleProofOfPaymentUpload(files as File | null)}
              value={proofOfPaymentFile}
              uploading={uploadProgress.proof_of_payment !== undefined && uploadProgress.proof_of_payment < 100}
              progress={uploadProgress.proof_of_payment}
              preview={uploadedFiles.proof_of_payment && proofOfPaymentFile ? {
                url: URL.createObjectURL(proofOfPaymentFile),
                type: proofOfPaymentFile.type.startsWith('image/') ? 'image' : 'pdf'
              } : undefined}
            />

            <p className="text-sm font-medium text-foreground">
              Submit for review once your proof upload is complete.
            </p>
          </SectionCard>
        </>
      )}
    </SectionCard>
  )
}

export default PaymentStep
