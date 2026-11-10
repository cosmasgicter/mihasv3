import React from 'react'
import { CreditCard } from 'lucide-react'
import { formatDate } from '@/lib/dateFormat'
import { PAYMENT_CHANNEL_LABEL } from '@/lib/paymentStatus'
import { formatServerAmount } from '@/lib/serverAmount'

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[minmax(0,9rem)_1fr] sm:items-start">
      <dt className="text-base sm:text-sm font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-base sm:text-sm font-medium text-foreground break-words">{value}</dd>
    </div>
  )
}

interface PaymentStatusBlockProps {
  paymentStatusLabel: string
  /** Server-derived fee for this application (canonical payment amount projection). */
  applicationFee: number | string | null | undefined
  /**
   * Currency the server recorded for this application's payment. Task 8.1: the
   * block no longer prefixes every amount with `K` — an international applicant
   * paying in USD is shown USD (R12.1: no client-side money assumptions).
   */
  paymentCurrency?: string | null
  paymentVerifiedAt: string | null | undefined
  paymentStatusDescription: string
}

export function PaymentStatusBlock({
  paymentStatusLabel,
  applicationFee,
  paymentCurrency = null,
  paymentVerifiedAt,
  paymentStatusDescription,
}: PaymentStatusBlockProps) {
  const feeLabel = formatServerAmount(
    typeof applicationFee === 'number' ? String(applicationFee) : applicationFee,
    paymentCurrency,
  )
  return (
    <div className="rounded-lg border border-border bg-muted px-5 py-4 lg:col-span-2">
      <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2"><CreditCard className="w-5 h-5" aria-hidden="true" /> Payment information</h3>
      <dl className="grid gap-2 text-base sm:text-sm sm:grid-cols-2">
        <DetailRow label="Payment status" value={paymentStatusLabel} />
        <DetailRow
          label="Application fee"
          value={feeLabel || 'Shown on the payment step'}
        />
        <DetailRow label="Payment method" value={PAYMENT_CHANNEL_LABEL} />
        {paymentVerifiedAt && (
          <DetailRow label="Verified" value={formatDate(paymentVerifiedAt)} />
        )}
      </dl>
      <p className="mt-3 text-base sm:text-sm text-muted-foreground">{paymentStatusDescription}</p>
    </div>
  )
}
