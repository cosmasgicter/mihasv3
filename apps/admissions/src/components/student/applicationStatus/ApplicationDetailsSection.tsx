/**
 * The workspace's "Application details" section (admissions-v2 task 12.1,
 * MAINT-01).
 *
 * Lifted **verbatim** out of `pages/student/ApplicationStatus.tsx`: the same
 * `SectionCard`, the same two ruled blocks, the same fields in the same order,
 * and the same `PaymentStatusBlock` beside them. Nationality and institution are
 * task 10.6's parity fields and are still here; `DetailRow` moved with the
 * section that is its only caller.
 */
import React from 'react'
import { FileText, Phone, User } from 'lucide-react'

import { SectionCard } from '@/components/ui/SectionCard'
import { PaymentStatusBlock } from '@/components/student/applicationStatus/PaymentStatusBlock'
import type { ApplicationWithDetails } from '@/types/database'

/**
 * One labelled fact. A fact the student has not given, or the platform does not
 * have, is left out: a row reading "Not provided" presents a missing value as if
 * it were the answer (task 26.5, R14.6).
 */
export function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === false) return null
  if (typeof value === 'string' && value.trim().length === 0) return null
  return (
    // A long unbroken value (an email) wraps inside its column instead of
    // widening it past the 390 px viewport (measure/overflow, R19.7).
    <div className="grid grid-cols-[minmax(0,1fr)] gap-1 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)] sm:items-start">
      <dt className="text-base sm:text-sm font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-base sm:text-sm font-medium text-foreground [overflow-wrap:anywhere]">{value}</dd>
    </div>
  )
}

interface ApplicationDetailsSectionProps {
  application: ApplicationWithDetails
  paymentStatusLabel: string
  paymentStatusDescription: string
}

export function ApplicationDetailsSection({
  application,
  paymentStatusLabel,
  paymentStatusDescription,
}: ApplicationDetailsSectionProps) {
  return (
    <SectionCard title="Application details" description="Review the information you submitted with this application." icon={<FileText className="h-5 w-5" />}>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-lg bg-muted px-5 py-4">
          <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2"><User className="w-5 h-5" aria-hidden="true" /> Personal information</h3>
          <dl className="space-y-2 text-base sm:text-sm">
            <DetailRow label="Full name" value={application.full_name} />
            <DetailRow label="Date of birth" value={application.date_of_birth} />
            <DetailRow label="Sex" value={application.sex} />
            <DetailRow label="Phone" value={application.phone} />
            <DetailRow label="Email" value={application.email} />
            {/* Task 10.6 parity: the retired workspace showed nationality; the
                canonical one did not, so consolidating without it would have
                removed a field the student could previously read. */}
            <DetailRow label="Nationality" value={application.nationality} />
          </dl>
        </div>
        <div className="rounded-lg bg-muted px-5 py-4">
          <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2"><Phone className="w-5 h-5" aria-hidden="true" /> Contact information</h3>
          <dl className="space-y-2 text-base sm:text-sm">
            <DetailRow label="Residence town" value={application.residence_town} />
            <DetailRow label="NRC" value={application.nrc_number} />
            <DetailRow label="Next of kin" value={application.next_of_kin_name} />
            <DetailRow label="Next of kin phone" value={application.next_of_kin_phone} />
          </dl>
        </div>
        <PaymentStatusBlock
          paymentStatusLabel={paymentStatusLabel}
          applicationFee={application.application_fee}
          paymentCurrency={application.payment_currency}
          paymentVerifiedAt={application.payment_verified_at}
          paymentStatusDescription={paymentStatusDescription}
        />
      </div>
    </SectionCard>
  )
}
