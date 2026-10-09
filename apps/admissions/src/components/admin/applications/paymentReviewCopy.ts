/**
 * What the payment-decision dialog says, per decision (admissions-v2 task 12.1,
 * MAINT-01).
 *
 * Lifted **verbatim** out of `ApplicationApprovalActions.tsx`, where it was a
 * `useMemo` over `pendingPaymentStatus`. Every title, description, button label,
 * field label, placeholder and `notesRequired` flag is the one that was there.
 *
 * Two reasons it belongs outside a component. It is a total function of one
 * string, so a `useMemo` bought nothing. And `notesRequired` is not copy: it is
 * the rule that a rejection must carry a reason the student can act on, which is
 * the only client-side gate in the whole block. That rule deserves a test that
 * does not mount a dialog.
 */
export interface PaymentReviewCopy {
  title: string
  description: string
  confirmText: string
  notesLabel: string
  notesPlaceholder: string
  notesRequired: boolean
}

export function resolvePaymentReviewCopy(pendingPaymentStatus: string | null): PaymentReviewCopy {
  if (pendingPaymentStatus === 'verified') {
    return {
      title: 'Verify Payment',
      description: 'Confirm that the application fee has been received before marking this payment as verified.',
      confirmText: 'Verify payment',
      notesLabel: 'Verification note',
      notesPlaceholder: 'Optional context for this verification decision.',
      notesRequired: false,
    }
  }

  if (pendingPaymentStatus === 'rejected') {
    return {
      title: 'Reject Payment',
      description: 'Explain why the proof was rejected so the student can correct and resubmit it.',
      confirmText: 'Reject payment',
      notesLabel: 'Rejection reason',
      notesPlaceholder: 'State what is wrong with the submitted proof or payment details.',
      notesRequired: true,
    }
  }

  if (pendingPaymentStatus === 'deferred') {
    return {
      title: 'Defer Payment',
      description: 'Defer payment collection for this application. The student will be contacted to arrange payment.',
      confirmText: 'Defer payment',
      notesLabel: 'Deferral reason',
      notesPlaceholder: 'Explain why payment is being deferred (e.g. financial hardship, instalment arrangement).',
      notesRequired: true,
    }
  }

  return {
    title: 'Return Payment To Review',
    description: 'Reopen this payment for review so the applicant can continue the payment process.',
    confirmText: 'Return to review',
    notesLabel: 'Review note',
    notesPlaceholder: 'Optional context for why the payment is being reopened.',
    notesRequired: false,
  }
}
