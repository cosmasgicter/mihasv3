import React from 'react'
import { CreditCard } from 'lucide-react'
import { formatDate } from '@/lib/dateFormat'

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[minmax(0,9rem)_1fr] sm:items-start">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground break-words">{value}</dd>
    </div>
  )
}

interface PaymentStatusBlockProps {
  paymentStatusLabel: string
  applicationFee: number | string | null | undefined
  paymentVerifiedAt: string | null | undefined
  paymentStatusDescription: string
}

export function PaymentStatusBlock({
  paymentStatusLabel,
  applicationFee,
  paymentVerifiedAt,
  paymentStatusDescription,
}: PaymentStatusBlockProps) {
  return (
    <div className="rounded-lg border border-border bg-muted px-5 py-4 lg:col-span-2">
      <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2"><CreditCard className="w-5 h-5" aria-hidden="true" /> Payment information</h3>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <DetailRow label="Payment status" value={paymentStatusLabel} />
        <DetailRow
          label="Application fee"
          value={applicationFee != null ? `K${applicationFee}` : 'Resolved at payment step'}
        />
        <DetailRow label="Payment method" value="Lenco Payment Gateway" />
        {paymentVerifiedAt && (
          <DetailRow label="Verified" value={formatDate(paymentVerifiedAt)} />
        )}
      </dl>
      <p className="mt-3 text-sm text-muted-foreground">{paymentStatusDescription}</p>
    </div>
  )
}
