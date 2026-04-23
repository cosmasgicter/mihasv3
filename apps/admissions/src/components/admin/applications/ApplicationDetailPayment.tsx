import React, { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { formatDate } from '@/lib/dateFormat'
import { CreditCard, Clock, CheckCircle, XCircle, AlertTriangle, Mail, Phone, Send } from 'lucide-react'
import { getPaymentStatusLabel, normalizePaymentStatus } from '@/lib/paymentStatus'
import type { ApplicationWithDetails, ApplicationDetailResponse, PaymentRecord } from './applicationDetailTypes'

interface ApplicationDetailPaymentProps {
  application: ApplicationWithDetails
  applicationData: ApplicationDetailResponse | null
  paymentRecords: PaymentRecord[]
  loadingPayments: boolean
  onShowNotificationModal: () => void
}

function getPaymentIcon(status: string) {
  switch (normalizePaymentStatus(status)) {
    case 'not_paid': return <Clock className="h-5 w-5 text-slate-700" />
    case 'pending_review': return <Clock className="h-5 w-5 text-orange-700" />
    case 'verified': return <CheckCircle className="h-5 w-5 text-accent" />
    case 'rejected': return <XCircle className="h-5 w-5 text-destructive" />
    case 'deferred': return <AlertTriangle className="h-5 w-5 text-amber-600" />
    default: return <Clock className="h-5 w-5 text-slate-700" />
  }
}

export function ApplicationDetailPayment({
  application, applicationData, paymentRecords, loadingPayments, onShowNotificationModal
}: ApplicationDetailPaymentProps) {
  const paymentStatusLabel = getPaymentStatusLabel(application.payment_status)
  const paymentStatusTextClass = {
    'Awaiting Payment': 'text-slate-900',
    'Awaiting Payment Review': 'text-orange-900',
    Verified: 'text-green-900',
    'Payment Rejected': 'text-red-900',
    Deferred: 'text-amber-800'
  }[paymentStatusLabel] || 'text-foreground'

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
        <CreditCard className="h-5 w-5 text-primary" />
        Payment Information
      </h3>

      <div className="mb-4 p-3 rounded-lg bg-gradient-to-r from-green-50 to-green-100">
        <div className="flex items-center gap-3">
          {getPaymentIcon(application.payment_status || 'not_paid')}
          <div>
            <p className="text-sm font-medium text-foreground">Current Status</p>
            <p className={`text-lg font-bold ${paymentStatusTextClass}`}>{paymentStatusLabel}</p>
          </div>
        </div>
      </div>

      {normalizePaymentStatus(application.payment_status) === 'deferred' && (
        <div className="mb-4 p-4 rounded-lg bg-amber-50 border border-amber-200">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <p className="font-medium text-amber-900">Payment Deferred</p>
          </div>
          <p className="text-sm text-amber-800 mb-3">This student's payment has been deferred. Please contact them to arrange payment.</p>
          <div className="space-y-1 mb-3">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Mail className="h-3.5 w-3.5 text-amber-700" />
              <span className="font-medium">{applicationData?.application?.email || application.email}</span>
            </div>
            {(applicationData?.application?.phone || application.phone) && (
              <div className="flex items-center gap-2 text-sm text-foreground">
                <Phone className="h-3.5 w-3.5 text-amber-700" />
                <span className="font-medium">{applicationData?.application?.phone || application.phone}</span>
              </div>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={onShowNotificationModal} className="border-amber-300 text-amber-800 hover:bg-amber-100">
            <Send className="h-3.5 w-3.5 mr-1.5" />
            Send Payment Reminder
          </Button>
        </div>
      )}

      <div>
        <p className="text-sm font-medium text-foreground mb-3">Payment History</p>
        {loadingPayments ? (
          <div className="flex items-center gap-2 text-sm text-foreground py-4">
            <div className="h-2.5 w-2.5 rounded-full bg-primary animate-pulse" aria-hidden="true" />
            <span>Loading payment records...</span>
          </div>
        ) : paymentRecords.length === 0 ? (
          <div className="text-center py-6 text-foreground">
            <CreditCard className="h-8 w-8 mx-auto mb-2 text-foreground opacity-40" />
            <p className="text-sm">No payment records found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {paymentRecords.map((payment) => (
              <div key={payment.id} className="flex items-center justify-between p-3 bg-muted border border-border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    payment.status === 'successful' ? 'bg-green-100' :
                    payment.status === 'failed' ? 'bg-red-100' : 'bg-amber-100'
                  }`}>
                    {payment.status === 'successful' ? <CheckCircle className="h-4 w-4 text-green-700" /> :
                      payment.status === 'failed' ? <XCircle className="h-4 w-4 text-red-700" /> :
                      <Clock className="h-4 w-4 text-amber-700" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground capitalize">{payment.status}</p>
                    <p className="text-xs text-foreground">
                      {payment.transaction_reference || 'No reference'}
                      {payment.payment_method ? ` · ${payment.payment_method}` : ''}
                    </p>
                    <p className="text-xs text-foreground">{formatDate(payment.created_at)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-foreground">
                    {payment.currency || 'ZMW'} {payment.amount != null ? Number(payment.amount).toFixed(2) : '—'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {(applicationData?.application?.last_payment_audit_at || application.last_payment_audit_at || applicationData?.application?.last_payment_audit_notes || application.last_payment_audit_notes) && (
        <div className="mt-4 bg-amber-50 border border-amber-200 p-4 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-amber-700" />
            <p className="font-medium text-amber-900">Latest Payment Review</p>
          </div>
          {(applicationData?.application?.last_payment_audit_at || application.last_payment_audit_at) && (
            <p className="text-sm text-amber-900/80 mb-1">
              Reviewed on {formatDate(applicationData?.application?.last_payment_audit_at || application.last_payment_audit_at || '')}
            </p>
          )}
          {(applicationData?.application?.last_payment_audit_by_name || application.last_payment_audit_by_name || applicationData?.application?.last_payment_audit_by_email || application.last_payment_audit_by_email) && (
            <p className="text-sm text-amber-900/80 mb-2">
              By: {applicationData?.application?.last_payment_audit_by_name || application.last_payment_audit_by_name || applicationData?.application?.last_payment_audit_by_email || application.last_payment_audit_by_email}
            </p>
          )}
          {(applicationData?.application?.last_payment_audit_notes || application.last_payment_audit_notes) && (
            <p className="text-sm text-foreground bg-background/80 rounded-md px-3 py-2">
              {applicationData?.application?.last_payment_audit_notes || application.last_payment_audit_notes}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// Fee waiver dialog — exported separately for use in overview tab
interface FeeWaiverDialogProps {
  open: boolean
  onClose: () => void
  onApply: (form: { waiver_type: string; reason_code: string; discount_percentage: number }) => void
  saving: boolean
}

export function FeeWaiverDialog({ open, onClose, onApply, saving }: FeeWaiverDialogProps) {
  const [form, setForm] = useState({ waiver_type: 'full', reason_code: 'staff_dependent', discount_percentage: 100 })

  if (!open) return null

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm space-y-3">
      <h4 className="text-sm font-semibold text-foreground">Apply Fee Waiver</h4>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-foreground block mb-1">Waiver Type</label>
          <select value={form.waiver_type} onChange={e => setForm(f => ({ ...f, waiver_type: e.target.value }))} className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm">
            <option value="full">Full</option>
            <option value="partial">Partial</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-foreground block mb-1">Reason</label>
          <select value={form.reason_code} onChange={e => setForm(f => ({ ...f, reason_code: e.target.value }))} className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm">
            <option value="staff_dependent">Staff Dependent</option>
            <option value="scholarship">Scholarship</option>
            <option value="financial_hardship">Financial Hardship</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs text-foreground block mb-1">Discount %</label>
        <input type="number" min={1} max={100} value={form.discount_percentage} onChange={e => setForm(f => ({ ...f, discount_percentage: Number(e.target.value) }))} className="w-24 rounded border border-border bg-background px-2 py-1.5 text-sm" />
      </div>
      <div className="flex gap-2">
        <button onClick={() => onApply(form)} disabled={saving} className="bg-primary text-primary-foreground text-xs px-3 py-1.5 rounded-lg disabled:opacity-50">{saving ? 'Saving…' : 'Apply'}</button>
        <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg border border-border">Cancel</button>
      </div>
    </div>
  )
}
